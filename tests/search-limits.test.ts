import type { DocumentInput } from '../src/domain/document';
import { DocumentStore } from '../src/domain/document-store';
import { InvertedIndex } from '../src/index/inverted-index';
import { SearchService } from '../src/search/search-service';
import type { SearchLimits } from '../src/search/search-types';

const strictLimits: SearchLimits = {
  maxQueryLength: 100,
  maxSearchTerms: 2,
  maxCandidates: 2,
  maxTopK: 2,
};

function serviceWithDocuments(documents: DocumentInput[]): SearchService {
  const store = new DocumentStore();
  const index = new InvertedIndex();
  store.createMany(documents);
  for (const document of documents) {
    index.replace(document);
    store.setStatus(document.id, 'indexed');
  }
  return new SearchService(store, index, () => 0, undefined, strictLimits);
}

function document(id: string, title = 'common'): DocumentInput {
  return { id, title, body: 'body', tags: [], popularity: 0 };
}

test('rejects a query longer than the configured limit before index work', () => {
  const service = serviceWithDocuments([]);

  expect(() => service.search({
    q: 'x'.repeat(101), limit: 1, fuzzy: false, filters: {},
  })).toThrow(expect.objectContaining({ code: 'QUERY_TOO_LARGE', statusCode: 400 }));
});

test('rejects too many normalized search terms', () => {
  const service = serviceWithDocuments([]);

  expect(() => service.search({
    q: 'one two three', limit: 1, fuzzy: false, filters: {},
  })).toThrow(expect.objectContaining({ code: 'TOO_MANY_SEARCH_TERMS' }));
});

test.each([0, -1, 3, 1.5, Number.NaN])('rejects invalid Top-K %p', (limit) => {
  const service = serviceWithDocuments([]);
  expect(() => service.search({ q: 'node', limit, fuzzy: false, filters: {} }))
    .toThrow(expect.objectContaining({ code: 'INVALID_LIMIT' }));
});

test('caps candidate collection deterministically before ranking', () => {
  const service = serviceWithDocuments([
    document('first'),
    document('second'),
    document('third'),
  ]);

  const response = service.search({ q: 'common', limit: 2, fuzzy: false, filters: {} });

  expect(response.totalCandidates).toBe(2);
  expect(response.candidatesTruncated).toBe(true);
  expect(response.results.map(({ document: value }) => value.id)).toEqual(['first', 'second']);
});

test('rejects an oversized fuzzy term before edit-distance allocation', () => {
  const service = serviceWithDocuments([]);

  expect(() => service.search({ q: 'x'.repeat(101), limit: 1, fuzzy: true, filters: {} }))
    .toThrow(expect.objectContaining({ code: 'QUERY_TOO_LARGE' }));

  const fuzzyTermService = new SearchService(
    new DocumentStore(),
    new InvertedIndex(),
    () => 0,
    {
      maxTermLength: 3,
      maxVocabularyComparisons: 10,
      maxExpansions: 2,
      maxDistance: 1,
      deadlineMs: 5,
    },
    strictLimits,
  );
  expect(() => fuzzyTermService.search({ q: 'four', limit: 1, fuzzy: true, filters: {} }))
    .toThrow(expect.objectContaining({ code: 'FUZZY_TERM_TOO_LARGE' }));
});
