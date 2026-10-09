import type { DocumentInput } from '../src/domain/document';
import { DocumentStore } from '../src/domain/document-store';
import { InvertedIndex } from '../src/index/inverted-index';
import { SearchService } from '../src/search/search-service';

function document(overrides: Partial<DocumentInput>): DocumentInput {
  return {
    id: 'doc',
    title: 'Title',
    body: 'Body',
    tags: [],
    popularity: 0,
    ...overrides,
  };
}

function indexedService(documents: DocumentInput[]): SearchService {
  const store = new DocumentStore();
  const index = new InvertedIndex();
  store.createMany(documents);
  for (const value of documents) {
    index.replace(value);
    store.setStatus(value.id, 'indexed');
  }
  return new SearchService(store, index, () => 10);
}

test('unions postings and considers a multi-term match only once', () => {
  const service = indexedService([
    document({ id: 'both', title: 'Node search' }),
    document({ id: 'one', title: 'Node only' }),
  ]);

  const response = service.search({
    q: 'node search',
    limit: 10,
    fuzzy: false,
    filters: {},
  });

  expect(response.results.map(({ document: value }) => value.id)).toEqual(['both', 'one']);
  expect(response.totalCandidates).toBe(2);
  expect(response.consideredCandidates).toBe(2);
  expect(response.terms).toEqual(['node', 'search']);
});

test('applies category, author, and every requested tag as AND filters', () => {
  const service = indexedService([
    document({
      id: 'matching',
      title: 'Node search',
      tags: ['backend', 'typescript'],
      category: 'article',
      author: 'ada',
    }),
    document({
      id: 'wrong-tag',
      title: 'Node search',
      tags: ['backend'],
      category: 'article',
      author: 'ada',
    }),
    document({
      id: 'wrong-author',
      title: 'Node search',
      tags: ['backend', 'typescript'],
      category: 'article',
      author: 'grace',
    }),
  ]);

  const response = service.search({
    q: 'node',
    limit: 10,
    fuzzy: false,
    filters: {
      category: 'ARTICLE',
      author: 'ADA',
      tags: ['backend', 'typescript'],
    },
  });

  expect(response.results.map(({ document: value }) => value.id)).toEqual(['matching']);
  expect(response.totalCandidates).toBe(3);
  expect(response.consideredCandidates).toBe(1);
});

test('does not expose a queued source document before it is indexed', () => {
  const queued = document({ id: 'queued', title: 'Node' });
  const store = new DocumentStore();
  const index = new InvertedIndex();
  store.createMany([queued]);
  index.replace(queued);
  const service = new SearchService(store, index);

  const response = service.search({ q: 'node', limit: 10, fuzzy: false, filters: {} });

  expect(response.results).toEqual([]);
  expect(response.totalCandidates).toBe(1);
  expect(response.consideredCandidates).toBe(0);
});

test('returns an empty response for an empty query or no matching postings', () => {
  const service = indexedService([document({ id: 'one', title: 'Node' })]);

  expect(service.search({ q: '  ', limit: 10, fuzzy: false, filters: {} }).results).toEqual([]);
  expect(service.search({ q: 'missing', limit: 10, fuzzy: false, filters: {} }).results).toEqual([]);
});

test('returns defensive document values rather than source-store references', () => {
  const service = indexedService([
    document({ id: 'one', title: 'Node', tags: ['backend'] }),
  ]);

  const response = service.search({ q: 'node', limit: 10, fuzzy: false, filters: {} });
  response.results[0]?.document.tags.push('mutated');

  expect(service.search({ q: 'node', limit: 10, fuzzy: false, filters: {} }).results[0]?.document.tags)
    .toEqual(['backend']);
});
