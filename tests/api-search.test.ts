import { buildTestApp, indexAndDrain, testDocument } from './helpers';

test('GET /search returns ranked exact results and response metadata', async () => {
  const app = buildTestApp();
  await indexAndDrain(app, [
    testDocument({ id: 'body', title: 'Other', body: 'Node' }),
    testDocument({ id: 'title', title: 'Node', body: 'Other' }),
  ]);

  const response = await app.inject({ method: 'GET', url: '/search?q=node&limit=1' });

  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(expect.objectContaining({
    query: 'node',
    terms: ['node'],
    totalCandidates: 2,
    consideredCandidates: 2,
    candidatesTruncated: false,
    results: [expect.objectContaining({
      document: expect.objectContaining({ id: 'title' }),
      score: expect.any(Number),
      explanation: expect.objectContaining({ titleBoost: 2 }),
    })],
  }));
  await app.close();
});

test('GET /search applies category, author, and repeated tag filters', async () => {
  const app = buildTestApp();
  await indexAndDrain(app, [
    testDocument({
      id: 'match',
      category: 'article',
      author: 'ada',
      tags: ['backend', 'typescript'],
    }),
    testDocument({
      id: 'missing-tag',
      category: 'article',
      author: 'ada',
      tags: ['backend'],
    }),
  ]);

  const response = await app.inject({
    method: 'GET',
    url: '/search?q=node&category=article&author=ada&tag=backend&tag=typescript',
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().results.map(({ document }: { document: { id: string } }) => document.id))
    .toEqual(['match']);
  await app.close();
});

test('GET /search enables bounded fuzzy expansion explicitly', async () => {
  const app = buildTestApp();
  await indexAndDrain(app, [testDocument({ id: 'search', title: 'Search' })]);

  const exact = await app.inject({ method: 'GET', url: '/search?q=serch' });
  const fuzzy = await app.inject({ method: 'GET', url: '/search?q=serch&fuzzy=true' });

  expect(exact.json().results).toEqual([]);
  expect(fuzzy.json().results[0].document.id).toBe('search');
  expect(fuzzy.json().fuzzy).toEqual(expect.objectContaining({ expansions: 1 }));
  await app.close();
});

test('GET /search returns an empty result for an empty q value', async () => {
  const app = buildTestApp();
  const response = await app.inject({ method: 'GET', url: '/search?q=' });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual(expect.objectContaining({ terms: [], results: [] }));
  await app.close();
});

test.each([
  ['/search', 'MISSING_QUERY'],
  ['/search?q=node&limit=abc', 'INVALID_LIMIT'],
  ['/search?q=node&limit=0', 'INVALID_LIMIT'],
  ['/search?q=node&fuzzy=yes', 'INVALID_FUZZY_FLAG'],
])('GET %s returns a stable client error', async (url, code) => {
  const app = buildTestApp();
  const response = await app.inject({ method: 'GET', url });
  expect(response.statusCode).toBe(400);
  expect(response.json().error.code).toBe(code);
  await app.close();
});

test('GET /search passes query resource-limit errors through the API', async () => {
  const app = buildTestApp({ MAX_QUERY_LENGTH: '4' });
  const response = await app.inject({ method: 'GET', url: '/search?q=12345' });
  expect(response.statusCode).toBe(400);
  expect(response.json().error.code).toBe('QUERY_TOO_LARGE');
  await app.close();
});
