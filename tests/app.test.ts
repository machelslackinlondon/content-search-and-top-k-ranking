import { buildApp } from '../src/app';

test('GET /health reports an available service', async () => {
  const app = buildApp();

  const response = await app.inject({ method: 'GET', url: '/health' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({
    status: 'ok',
    queue: { depth: 0, capacity: 1_000, utilization: 0 },
    workers: { active: 0, failedJobs: 0 },
  });
  await app.close();
});
