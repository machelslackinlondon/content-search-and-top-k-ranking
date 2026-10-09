import type { DocumentInput } from '../src/domain/document';
import { DocumentStore } from '../src/domain/document-store';
import { InvertedIndex } from '../src/index/inverted-index';
import { SearchService } from '../src/search/search-service';
import type { FuzzyLimits } from '../src/search/search-types';

function serviceFor(
  terms: string[],
  limits: Partial<FuzzyLimits> = {},
  now: () => number = () => 0,
): SearchService {
  const store = new DocumentStore();
  const index = new InvertedIndex();
  const documents: DocumentInput[] = terms.map((term, position) => ({
    id: `doc-${position}`,
    title: term,
    body: 'content',
    tags: [],
    popularity: 0,
  }));
  store.createMany(documents);
  for (const document of documents) {
    index.replace(document);
    store.setStatus(document.id, 'indexed');
  }
  return new SearchService(store, index, now, {
    maxTermLength: 32,
    maxVocabularyComparisons: 100,
    maxExpansions: 5,
    maxDistance: 2,
    deadlineMs: 25,
    ...limits,
  });
}

test('finds a one-edit match only when fuzzy search is enabled', () => {
  const service = serviceFor(['search']);

  expect(service.search({ q: 'serch', limit: 10, fuzzy: false, filters: {} }).results)
    .toEqual([]);
  const response = service.search({ q: 'serch', limit: 10, fuzzy: true, filters: {} });

  expect(response.results.map(({ document }) => document.id)).toEqual(['doc-0']);
  expect(response.fuzzy).toEqual({ comparisons: 2, expansions: 1, truncated: false });
});

test('does not expand a query term that already has exact postings', () => {
  const service = serviceFor(['search', 'searches']);

  const response = service.search({ q: 'search', limit: 10, fuzzy: true, filters: {} });

  expect(response.results.map(({ document }) => document.id)).toEqual(['doc-0']);
  expect(response.fuzzy).toEqual({ comparisons: 0, expansions: 0, truncated: false });
});

test('orders expansions by distance then term and enforces the expansion cap', () => {
  const service = serviceFor(['bat', 'cat', 'coat', 'cut'], { maxExpansions: 2 });

  const response = service.search({ q: 'cot', limit: 10, fuzzy: true, filters: {} });

  expect(response.results.map(({ document }) => document.title).sort()).toEqual(['cat', 'coat']);
  expect(response.fuzzy?.expansions).toBe(2);
  expect(response.fuzzy?.truncated).toBe(true);
});

test('stops fuzzy work at the vocabulary comparison cap', () => {
  const service = serviceFor(
    ['alpha', 'bravo', 'charlie'],
    { maxVocabularyComparisons: 2, maxDistance: 5 },
  );

  const response = service.search({ q: 'zulu', limit: 10, fuzzy: true, filters: {} });

  expect(response.fuzzy).toEqual({ comparisons: 2, expansions: 2, truncated: true });
});

test('stops fuzzy work when its deadline is exceeded', () => {
  let time = 0;
  const service = serviceFor(['alpha', 'bravo'], { deadlineMs: 2 }, () => time++);

  const response = service.search({ q: 'zulu', limit: 10, fuzzy: true, filters: {} });

  expect(response.fuzzy?.truncated).toBe(true);
  expect(response.fuzzy?.comparisons).toBeLessThan(2);
});
