import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';

const validDocument = {
  id: 'doc-1',
  title: 'Node search',
  body: 'Educational content',
  tags: ['backend'],
};

test('accepts a document only after source storage and queue admission', async () => {
  const app = buildApp({ startWorkers: false });

  const response = await app.inject({
    method: 'POST',
    url: '/documents',
    payload: validDocument,
  });

  expect(response.statusCode).toBe(202);
  expect(response.json()).toEqual({ id: 'doc-1', status: 'queued' });
  expect(app.searchContext.store.get('doc-1')?.indexStatus).toBe('queued');
  expect(app.searchContext.queue.depth).toBe(1);
  await app.close();
});

test('accepts a valid bulk request atomically', async () => {
  const app = buildApp({ startWorkers: false });
  const response = await app.inject({
    method: 'POST',
    url: '/documents/bulk',
    payload: {
      documents: [
        validDocument,
        { ...validDocument, id: 'doc-2', title: 'Ranking' },
      ],
    },
  });

  expect(response.statusCode).toBe(202);
  expect(response.json()).toEqual({ ids: ['doc-1', 'doc-2'], status: 'queued' });
  expect(app.searchContext.queue.depth).toBe(2);
  await app.close();
});

test('does not partially store a malformed or duplicate bulk request', async () => {
  const app = buildApp({ startWorkers: false });
  const malformed = await app.inject({
    method: 'POST',
    url: '/documents/bulk',
    payload: { documents: [validDocument, { id: 'bad' }] },
  });

  expect(malformed.statusCode).toBe(400);
  expect(app.searchContext.store.values()).toEqual([]);
  expect(app.searchContext.queue.depth).toBe(0);

  const duplicate = await app.inject({
    method: 'POST',
    url: '/documents/bulk',
    payload: { documents: [validDocument, validDocument] },
  });
  expect(duplicate.statusCode).toBe(409);
  expect(app.searchContext.store.values()).toEqual([]);
  expect(app.searchContext.queue.depth).toBe(0);
  await app.close();
});

test('rejects an oversized bulk request before mutating state', async () => {
  const config = loadConfig({ MAX_BULK_SIZE: '1' });
  const app = buildApp({ config, startWorkers: false });

  const response = await app.inject({
    method: 'POST',
    url: '/documents/bulk',
    payload: {
      documents: [validDocument, { ...validDocument, id: 'doc-2' }],
    },
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({
    error: {
      code: 'BULK_SIZE_EXCEEDED',
      message: 'Bulk requests may contain at most 1 documents',
    },
  });
  expect(app.searchContext.store.values()).toEqual([]);
  await app.close();
});

test('returns 429 without storing when the indexing queue is full', async () => {
  const config = loadConfig({ INDEX_QUEUE_CAPACITY: '1' });
  const app = buildApp({ config, startWorkers: false });
  await app.inject({ method: 'POST', url: '/documents', payload: validDocument });

  const response = await app.inject({
    method: 'POST',
    url: '/documents',
    payload: { ...validDocument, id: 'doc-2' },
  });

  expect(response.statusCode).toBe(429);
  expect(response.headers['retry-after']).toBe('1');
  expect(response.json()).toEqual({
    error: {
      code: 'INDEX_QUEUE_FULL',
      message: 'The indexing queue has no capacity for 1 additional job',
      details: { capacity: 1, depth: 1, requested: 1, reserved: 0 },
    },
  });
  expect(app.searchContext.store.has('doc-2')).toBe(false);
  await app.close();
});

test('maps malformed single-document input to a stable error response', async () => {
  const app = buildApp({ startWorkers: false });
  const response = await app.inject({
    method: 'POST',
    url: '/documents',
    payload: { id: 'missing-fields' },
  });

  expect(response.statusCode).toBe(400);
  expect(response.json()).toEqual({
    error: {
      code: 'INVALID_DOCUMENT',
      message: 'Invalid document field "title": must be a string',
      details: { field: 'title', reason: 'must be a string' },
    },
  });
  await app.close();
});
