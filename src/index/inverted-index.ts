import type { DocumentInput } from '../domain/document';
import { countTerms, normalizeTerm, tokenize } from './tokenizer';

export interface IndexedDocumentTerms {
  all: Map<string, number>;
  title: Set<string>;
  tags: Set<string>;
}

export type FilterField = 'tag' | 'category' | 'author';

interface DocumentIndexState extends IndexedDocumentTerms {
  filterTags: Set<string>;
  category?: string;
  author?: string;
}

function cloneTerms(state: IndexedDocumentTerms): IndexedDocumentTerms {
  return {
    all: new Map(state.all),
    title: new Set(state.title),
    tags: new Set(state.tags),
  };
}

export class InvertedIndex {
  readonly #postings = new Map<string, Map<string, number>>();
  readonly #tagFilters = new Map<string, Set<string>>();
  readonly #categoryFilters = new Map<string, Set<string>>();
  readonly #authorFilters = new Map<string, Set<string>>();
  readonly #documents = new Map<string, DocumentIndexState>();

  replace(document: DocumentInput): void {
    const title = new Set(tokenize(document.title));
    const tags = new Set(document.tags.flatMap((tag) => tokenize(tag)));
    const all = countTerms([
      ...tokenize(document.title),
      ...tokenize(document.body),
      ...tags,
    ]);
    const filterTags = new Set(document.tags.map((tag) => normalizeTerm(tag)));
    const category = document.category === undefined
      ? undefined
      : normalizeTerm(document.category);
    const author = document.author === undefined
      ? undefined
      : normalizeTerm(document.author);
    const state: DocumentIndexState = {
      all,
      title,
      tags,
      filterTags,
      ...(category === undefined ? {} : { category }),
      ...(author === undefined ? {} : { author }),
    };

    this.remove(document.id);
    this.#documents.set(document.id, state);
    for (const [term, frequency] of all) {
      const posting = this.#postings.get(term) ?? new Map<string, number>();
      posting.set(document.id, frequency);
      this.#postings.set(term, posting);
    }
    for (const tag of filterTags) {
      this.#addFilter(this.#tagFilters, tag, document.id);
    }
    if (category !== undefined) {
      this.#addFilter(this.#categoryFilters, category, document.id);
    }
    if (author !== undefined) {
      this.#addFilter(this.#authorFilters, author, document.id);
    }
  }

  remove(id: string): boolean {
    const state = this.#documents.get(id);
    if (state === undefined) {
      return false;
    }

    for (const term of state.all.keys()) {
      const posting = this.#postings.get(term);
      posting?.delete(id);
      if (posting?.size === 0) {
        this.#postings.delete(term);
      }
    }
    for (const tag of state.filterTags) {
      this.#removeFilter(this.#tagFilters, tag, id);
    }
    if (state.category !== undefined) {
      this.#removeFilter(this.#categoryFilters, state.category, id);
    }
    if (state.author !== undefined) {
      this.#removeFilter(this.#authorFilters, state.author, id);
    }
    this.#documents.delete(id);
    return true;
  }

  postings(term: string): Map<string, number> {
    return new Map(this.#postings.get(normalizeTerm(term)) ?? []);
  }

  filterIds(field: FilterField, value: string): Set<string> {
    const index = field === 'tag'
      ? this.#tagFilters
      : field === 'category'
        ? this.#categoryFilters
        : this.#authorFilters;
    return new Set(index.get(normalizeTerm(value)) ?? []);
  }

  documentTerms(id: string): IndexedDocumentTerms | undefined {
    const state = this.#documents.get(id);
    return state === undefined ? undefined : cloneTerms(state);
  }

  vocabulary(): Set<string> {
    return new Set(this.#postings.keys());
  }

  clear(): void {
    this.#postings.clear();
    this.#tagFilters.clear();
    this.#categoryFilters.clear();
    this.#authorFilters.clear();
    this.#documents.clear();
  }

  #addFilter(index: Map<string, Set<string>>, value: string, id: string): void {
    const ids = index.get(value) ?? new Set<string>();
    ids.add(id);
    index.set(value, ids);
  }

  #removeFilter(index: Map<string, Set<string>>, value: string, id: string): void {
    const ids = index.get(value);
    ids?.delete(id);
    if (ids?.size === 0) {
      index.delete(value);
    }
  }
}
