import { validateDocument, type DocumentLimits } from '../src/domain/document';

const limits: DocumentLimits = {
  maxIdLength: 32,
  maxTitleLength: 100,
  maxBodyLength: 1_000,
  maxTags: 3,
  maxTagLength: 20,
  maxCategoryLength: 20,
  maxAuthorLength: 40,
  maxPopularity: 1_000_000,
};

test('normalizes metadata and defaults optional values', () => {
  expect(validateDocument({
    id: '  doc-1 ',
    title: '  Node Search ',
    body: '  Educational body  ',
    tags: [' Node ', 'node', ' BACKEND '],
    category: ' Article ',
    author: ' Ada ',
  }, limits)).toEqual({
    id: 'doc-1',
    title: 'Node Search',
    body: 'Educational body',
    tags: ['node', 'backend'],
    category: 'article',
    author: 'ada',
    popularity: 0,
  });
});

test.each([
  [{ title: 'title', body: 'body' }, 'id'],
  [{ id: 'id', title: ' ', body: 'body' }, 'title'],
  [{ id: 'id', title: 'title', body: '' }, 'body'],
  [{ id: 'id', title: 'title', body: 'body', tags: 'tag' }, 'tags'],
  [{ id: 'id', title: 'title', body: 'body', popularity: -1 }, 'popularity'],
  [{ id: 'id', title: 'title', body: 'body', popularity: Number.NaN }, 'popularity'],
])('rejects malformed document %p', (input, field) => {
  expect(() => validateDocument(input, limits)).toThrow(
    expect.objectContaining({ code: 'INVALID_DOCUMENT', statusCode: 400 }),
  );
  expect(() => validateDocument(input, limits)).toThrow(field);
});

test('enforces field, tag-count, and popularity bounds', () => {
  expect(() => validateDocument({ id: 'x'.repeat(33), title: 't', body: 'b' }, limits)).toThrow('id');
  expect(() => validateDocument({ id: '1', title: 't', body: 'b', tags: ['a', 'b', 'c', 'd'] }, limits)).toThrow('tags');
  expect(() => validateDocument({ id: '1', title: 't', body: 'b', popularity: 1_000_001 }, limits)).toThrow('popularity');
});
