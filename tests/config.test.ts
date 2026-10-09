import { loadConfig } from '../src/config';

test('loads documented defaults into immutable nested configuration', () => {
  const config = loadConfig({});

  expect(config.server).toEqual({ host: '0.0.0.0', port: 3000 });
  expect(config.search).toEqual({
    maxQueryLength: 512,
    maxSearchTerms: 16,
    maxCandidates: 10_000,
    maxTopK: 100,
  });
  expect(config.indexing).toEqual({
    maxBulkSize: 100,
    queueCapacity: 1_000,
    concurrency: 4,
    maxRetries: 1,
    shutdownTimeoutMs: 5_000,
  });
  expect(Object.isFrozen(config)).toBe(true);
  expect(Object.isFrozen(config.search)).toBe(true);
});

test('parses explicit environment overrides', () => {
  const config = loadConfig({
    HOST: '127.0.0.1',
    PORT: '4000',
    MAX_SEARCH_TERMS: '8',
    INDEX_QUEUE_CAPACITY: '25',
    FUZZY_DEADLINE_MS: '10',
  });

  expect(config.server).toEqual({ host: '127.0.0.1', port: 4000 });
  expect(config.search.maxSearchTerms).toBe(8);
  expect(config.indexing.queueCapacity).toBe(25);
  expect(config.fuzzy.deadlineMs).toBe(10);
});

test.each([
  ['MAX_SEARCH_TERMS', '0'],
  ['MAX_CANDIDATES', 'not-a-number'],
  ['INDEXING_CONCURRENCY', '1.5'],
  ['PORT', '70000'],
  ['MAX_FUZZY_DISTANCE', '-1'],
])('rejects invalid %s at startup', (name, value) => {
  expect(() => loadConfig({ [name]: value })).toThrow(name);
});
