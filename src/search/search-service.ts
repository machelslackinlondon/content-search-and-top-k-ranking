import type { DocumentInput, StoredDocument } from '../domain/document';
import { DocumentStore } from '../domain/document-store';
import { topK } from '../algorithms/min-heap';
import { editDistance } from '../algorithms/edit-distance';
import { InvertedIndex, type FilterField } from '../index/inverted-index';
import { tokenize } from '../index/tokenizer';
import { compareRankedResults, rankDocument } from '../ranking/ranker';
import type {
  FuzzyLimits,
  FuzzyMetadata,
  SearchFilters,
  SearchQuery,
  SearchResponse,
  SearchResult,
} from './search-types';

const DEFAULT_FUZZY_LIMITS: Readonly<FuzzyLimits> = Object.freeze({
  maxTermLength: 32,
  maxVocabularyComparisons: 500,
  maxExpansions: 5,
  maxDistance: 2,
  deadlineMs: 25,
});

function publicDocument(document: StoredDocument): DocumentInput {
  return {
    id: document.id,
    title: document.title,
    body: document.body,
    tags: [...document.tags],
    ...(document.category === undefined ? {} : { category: document.category }),
    ...(document.author === undefined ? {} : { author: document.author }),
    popularity: document.popularity,
  };
}

export class SearchService {
  readonly #store: DocumentStore;
  readonly #index: InvertedIndex;
  readonly #now: () => number;
  readonly #fuzzyLimits: Readonly<FuzzyLimits>;

  constructor(
    store: DocumentStore,
    index: InvertedIndex,
    now: () => number = () => performance.now(),
    fuzzyLimits: Readonly<FuzzyLimits> = DEFAULT_FUZZY_LIMITS,
  ) {
    this.#store = store;
    this.#index = index;
    this.#now = now;
    this.#fuzzyLimits = fuzzyLimits;
  }

  search(query: SearchQuery): SearchResponse {
    const startedAt = this.#now();
    const terms = [...new Set(tokenize(query.q))];
    const fuzzyExpansion = query.fuzzy ? this.#expandFuzzyTerms(terms) : undefined;
    const rankingTerms = fuzzyExpansion?.terms ?? terms;
    const candidates = new Set<string>();
    for (const term of rankingTerms) {
      for (const id of this.#index.postings(term).keys()) {
        candidates.add(id);
      }
    }

    const filteredIds = this.#applyFilters(candidates, query.filters);
    const results: SearchResult[] = [];
    for (const id of filteredIds) {
      const document = this.#store.get(id);
      const documentTerms = this.#index.documentTerms(id);
      if (document?.indexStatus === 'indexed' && documentTerms !== undefined) {
        const publicValue = publicDocument(document);
        const explanation = rankDocument(publicValue, documentTerms, rankingTerms);
        results.push({
          document: publicValue,
          score: explanation.total,
          explanation,
        });
      }
    }
    const selectedResults = topK(results, query.limit, compareRankedResults);

    return {
      query: query.q,
      terms,
      totalCandidates: candidates.size,
      consideredCandidates: results.length,
      tookMs: Math.max(0, this.#now() - startedAt),
      results: selectedResults,
      ...(fuzzyExpansion === undefined ? {} : { fuzzy: fuzzyExpansion.metadata }),
    };
  }

  #expandFuzzyTerms(queryTerms: readonly string[]): {
    terms: string[];
    metadata: FuzzyMetadata;
  } {
    const metadata: FuzzyMetadata = {
      comparisons: 0,
      expansions: 0,
      truncated: false,
    };
    const terms: string[] = [];
    const vocabulary = [...this.#index.vocabulary()].sort((left, right) => left.localeCompare(right));
    const deadlineAt = this.#now() + this.#fuzzyLimits.deadlineMs;

    for (const queryTerm of queryTerms) {
      if (this.#index.postings(queryTerm).size > 0) {
        terms.push(queryTerm);
        continue;
      }
      if (Array.from(queryTerm).length > this.#fuzzyLimits.maxTermLength) {
        metadata.truncated = true;
        continue;
      }

      const matches: Array<{ term: string; distance: number }> = [];
      for (const vocabularyTerm of vocabulary) {
        if (metadata.comparisons >= this.#fuzzyLimits.maxVocabularyComparisons) {
          metadata.truncated = true;
          break;
        }
        if (this.#now() >= deadlineAt) {
          metadata.truncated = true;
          break;
        }
        metadata.comparisons += 1;
        const distance = editDistance(
          queryTerm,
          vocabularyTerm,
          this.#fuzzyLimits.maxDistance,
        );
        if (distance <= this.#fuzzyLimits.maxDistance) {
          matches.push({ term: vocabularyTerm, distance });
        }
      }

      matches.sort((left, right) => left.distance - right.distance
        || left.term.localeCompare(right.term));
      const remaining = Math.max(0, this.#fuzzyLimits.maxExpansions - metadata.expansions);
      const selected = matches.slice(0, remaining);
      if (selected.length < matches.length || (remaining === 0 && vocabulary.length > 0)) {
        metadata.truncated = true;
      }
      metadata.expansions += selected.length;
      terms.push(...selected.map(({ term }) => term));
    }

    return { terms: [...new Set(terms)], metadata };
  }

  #applyFilters(candidates: Set<string>, filters: SearchFilters): Set<string> {
    const filterSets: Set<string>[] = [];
    this.#appendFilter(filterSets, 'category', filters.category);
    this.#appendFilter(filterSets, 'author', filters.author);
    for (const tag of filters.tags ?? []) {
      this.#appendFilter(filterSets, 'tag', tag);
    }
    filterSets.sort((left, right) => left.size - right.size);

    const result = new Set(candidates);
    for (const filterSet of filterSets) {
      for (const id of result) {
        if (!filterSet.has(id)) {
          result.delete(id);
        }
      }
      if (result.size === 0) {
        break;
      }
    }
    return result;
  }

  #appendFilter(
    target: Set<string>[],
    field: FilterField,
    value: string | undefined,
  ): void {
    if (value !== undefined) {
      target.push(this.#index.filterIds(field, value));
    }
  }
}
