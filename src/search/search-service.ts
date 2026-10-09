import type { DocumentInput, StoredDocument } from '../domain/document';
import { DocumentStore } from '../domain/document-store';
import { AppError } from '../domain/errors';
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
  SearchLimits,
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

const DEFAULT_SEARCH_LIMITS: Readonly<SearchLimits> = Object.freeze({
  maxQueryLength: 512,
  maxSearchTerms: 16,
  maxCandidates: 10_000,
  maxTopK: 100,
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
  readonly #searchLimits: Readonly<SearchLimits>;

  constructor(
    store: DocumentStore,
    index: InvertedIndex,
    now: () => number = () => performance.now(),
    fuzzyLimits: Readonly<FuzzyLimits> = DEFAULT_FUZZY_LIMITS,
    searchLimits: Readonly<SearchLimits> = DEFAULT_SEARCH_LIMITS,
  ) {
    this.#store = store;
    this.#index = index;
    this.#now = now;
    this.#fuzzyLimits = fuzzyLimits;
    this.#searchLimits = searchLimits;
  }

  search(query: SearchQuery): SearchResponse {
    if (query.q.length > this.#searchLimits.maxQueryLength) {
      throw new AppError(
        'QUERY_TOO_LARGE',
        400,
        `Query must be at most ${this.#searchLimits.maxQueryLength} characters`,
      );
    }
    if (
      !Number.isSafeInteger(query.limit)
      || query.limit < 1
      || query.limit > this.#searchLimits.maxTopK
    ) {
      throw new AppError(
        'INVALID_LIMIT',
        400,
        `limit must be an integer between 1 and ${this.#searchLimits.maxTopK}`,
      );
    }
    const terms = [...new Set(tokenize(query.q))];
    if (terms.length > this.#searchLimits.maxSearchTerms) {
      throw new AppError(
        'TOO_MANY_SEARCH_TERMS',
        400,
        `Query must contain at most ${this.#searchLimits.maxSearchTerms} terms`,
      );
    }
    if (
      query.fuzzy
      && terms.some((term) => Array.from(term).length > this.#fuzzyLimits.maxTermLength)
    ) {
      throw new AppError(
        'FUZZY_TERM_TOO_LARGE',
        400,
        `Fuzzy terms must be at most ${this.#fuzzyLimits.maxTermLength} characters`,
      );
    }

    const startedAt = this.#now();
    const fuzzyExpansion = query.fuzzy ? this.#expandFuzzyTerms(terms) : undefined;
    const rankingTerms = fuzzyExpansion?.terms ?? terms;
    const candidates = new Set<string>();
    let candidatesTruncated = false;
    candidateCollection:
    for (const term of rankingTerms) {
      for (const id of this.#index.postings(term).keys()) {
        if (!candidates.has(id) && candidates.size >= this.#searchLimits.maxCandidates) {
          candidatesTruncated = true;
          break candidateCollection;
        }
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
      candidatesTruncated,
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
