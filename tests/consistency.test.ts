import { buildApp } from '../src/app';
import type { DocumentInput } from '../src/domain/document';
import type { InvertedIndex } from '../src/index/inverted-index';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

test('an accepted write becomes searchable only after asynchronous indexing', async () => {
  const gate = deferred();
  let targetIndex!: InvertedIndex;
  const app = buildApp({
    indexDocument: async (document: DocumentInput) => {
      await gate.promise;
      targetIndex.replace(document);
    },
  });
  targetIndex = app.searchContext.index;

  const accepted = await app.inject({
    method: 'POST',
    url: '/documents',
    payload: { id: 'eventual', title: 'Node', body: 'Search' },
  });
  expect(accepted.statusCode).toBe(202);
  expect(app.searchContext.search.search({
    q: 'node', limit: 10, fuzzy: false, filters: {},
  }).results).toEqual([]);

  gate.resolve();
  await app.searchContext.workers.drain();

  expect(app.searchContext.search.search({
    q: 'node', limit: 10, fuzzy: false, filters: {},
  }).results.map(({ document }) => document.id)).toEqual(['eventual']);
  await app.close();
});
