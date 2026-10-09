import type { DocumentInput, StoredDocument } from '../domain/document';
import { DocumentStore } from '../domain/document-store';
import { InvertedIndex, type FilterField } from '../index/inverted-index';
import { tokenize } from '../index/tokenizer';
import { compareRankedResults, rankDocument } from '../ranking/ranker';
import type {
  SearchFilters,
  SearchQuery,
  SearchResponse,
  SearchResult,
} from './search-types';

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

  constructor(
    store: DocumentStore,
    index: InvertedIndex,
    now: () => number = () => performance.now(),
  ) {
    this.#store = store;
    this.#index = index;
    this.#now = now;
  }

  search(query: SearchQuery): SearchResponse {
    const startedAt = this.#now();
    const terms = [...new Set(tokenize(query.q))];
    const candidates = new Set<string>();
    for (const term of terms) {
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
        const explanation = rankDocument(publicValue, documentTerms, terms);
        results.push({
          document: publicValue,
          score: explanation.total,
          explanation,
        });
      }
    }
    results.sort(compareRankedResults);

    return {
      query: query.q,
      terms,
      totalCandidates: candidates.size,
      consideredCandidates: results.length,
      tookMs: Math.max(0, this.#now() - startedAt),
      results: results.slice(0, Math.max(0, query.limit)),
    };
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
