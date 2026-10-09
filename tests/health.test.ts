import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { testDocument } from './helpers';

test('GET /health reports queue capacity and worker state', async () => {
  const app = buildApp({
    config: loadConfig({ INDEX_QUEUE_CAPACITY: '10', INDEXING_CONCURRENCY: '2' }),
    startWorkers: false,
  });

  const response = await app.inject({ method: 'GET', url: '/health' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    status: 'ok',
    queue: { depth: 0, capacity: 10, utilization: 0 },
    workers: { active: 0, failedJobs: 0 },
  });
  await app.close();
});

test('GET /health degrades when queue utilization reaches its threshold', async () => {
  const app = buildApp({
    config: loadConfig({ INDEX_QUEUE_CAPACITY: '5' }),
    startWorkers: false,
  });
  await app.inject({
    method: 'POST',
    url: '/documents/bulk',
    payload: {
      documents: [0, 1, 2, 3].map((position) => testDocument({ id: `doc-${position}` })),
    },
  });

  const response = await app.inject({ method: 'GET', url: '/health' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(expect.objectContaining({ status: 'degraded' }));
  expect(response.json().queue.utilization).toBe(0.8);
  await app.close();
});

test('GET /health degrades after a permanent indexing failure', async () => {
  const app = buildApp({
    config: loadConfig({ MAX_INDEX_RETRIES: '0' }),
    indexDocument: async () => { throw new Error('broken indexer'); },
  });
  await app.inject({ method: 'POST', url: '/documents', payload: testDocument() });
  await app.searchContext.workers.drain();

  const response = await app.inject({ method: 'GET', url: '/health' });

  expect(response.json()).toEqual(expect.objectContaining({
    status: 'degraded',
    workers: { active: 0, failedJobs: 1 },
  }));
  await app.close();
});
