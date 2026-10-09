import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { indexAndDrain, testDocument } from './helpers';

test('GET /metrics exposes process, ingestion, queue, and search observations', async () => {
  const app = buildApp();
  await indexAndDrain(app, [testDocument({ id: 'secret-document-id' })]);
  await app.inject({ method: 'GET', url: '/search?q=node' });
  await app.inject({ method: 'GET', url: '/search?q=serch&fuzzy=true' });

  const response = await app.inject({ method: 'GET', url: '/metrics' });
  const text = response.body;

  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toContain('text/plain');
  expect(text).toContain('search_requests_total');
  expect(text).toContain('search_latency_seconds');
  expect(text).toContain('ranking_latency_seconds');
  expect(text).toContain('fuzzy_search_latency_seconds');
  expect(text).toContain('index_documents_total');
  expect(text).toContain('index_queue_depth');
  expect(text).toContain('process_resident_memory_bytes');
  expect(text).not.toContain('secret-document-id');
  expect(text).not.toContain('serch');
  await app.close();
});

test('records queue load shedding without storing high-cardinality labels', async () => {
  const app = buildApp({
    config: loadConfig({ INDEX_QUEUE_CAPACITY: '1' }),
    startWorkers: false,
  });
  await app.inject({ method: 'POST', url: '/documents', payload: testDocument() });
  await app.inject({
    method: 'POST',
    url: '/documents',
    payload: testDocument({ id: 'high-cardinality-document-123' }),
  });

  const metrics = (await app.inject({ method: 'GET', url: '/metrics' })).body;

  expect(metrics).toMatch(/index_queue_rejections_total 1(?:\.0+)?/);
  expect(metrics).toContain('service_errors_total{component="queue",code="INDEX_QUEUE_FULL"} 1');
  expect(metrics).not.toContain('high-cardinality-document-123');
  await app.close();
});

test('each app owns an independent metrics registry', async () => {
  const first = buildApp({ startWorkers: false });
  const second = buildApp({ startWorkers: false });
  await first.inject({ method: 'POST', url: '/documents', payload: testDocument() });

  const firstMetrics = await first.searchContext.metrics.registry.metrics();
  const secondMetrics = await second.searchContext.metrics.registry.metrics();

  expect(firstMetrics).toContain('index_documents_total{status="accepted"} 1');
  expect(secondMetrics).not.toContain('index_documents_total{status="accepted"} 1');
  await first.close();
  await second.close();
});
