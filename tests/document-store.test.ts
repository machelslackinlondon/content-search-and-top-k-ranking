import { DocumentStore } from '../src/domain/document-store';
import type { DocumentInput } from '../src/domain/document';

function document(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    id: 'doc-1',
    title: 'Title',
    body: 'Body',
    tags: [],
    popularity: 0,
    ...overrides,
  };
}

test('stores defensive copies with queued status', () => {
  const store = new DocumentStore(() => '2026-10-09T12:00:00.000Z');
  const input = document({ tags: ['backend'] });

  store.createMany([input]);
  input.tags.push('mutated');
  const stored = store.get('doc-1');
  stored?.tags.push('also-mutated');

  expect(store.get('doc-1')).toEqual({
    ...document({ tags: ['backend'] }),
    indexStatus: 'queued',
    acceptedAt: '2026-10-09T12:00:00.000Z',
  });
});

test('rejects an entire batch when an id already exists', () => {
  const store = new DocumentStore();
  store.createMany([document({ id: 'existing' })]);

  expect(() => store.createMany([
    document({ id: 'new' }),
    document({ id: 'existing' }),
  ])).toThrow(expect.objectContaining({ code: 'DOCUMENT_EXISTS', statusCode: 409 }));
  expect(store.has('new')).toBe(false);
});

test('rejects duplicate ids within a batch before storing anything', () => {
  const store = new DocumentStore();

  expect(() => store.createMany([
    document({ id: 'same' }),
    document({ id: 'same' }),
  ])).toThrow(expect.objectContaining({ code: 'DUPLICATE_DOCUMENT_ID' }));
  expect(store.values()).toEqual([]);
});

test('records indexing success and failure without deleting the source', () => {
  const store = new DocumentStore(() => '2026-10-09T12:00:00.000Z');
  store.createMany([document()]);

  store.setStatus('doc-1', 'indexing');
  expect(store.get('doc-1')?.indexStatus).toBe('indexing');
  store.setStatus('doc-1', 'failed', 'worker failed');
  expect(store.get('doc-1')).toEqual(expect.objectContaining({
    indexStatus: 'failed',
    indexError: 'worker failed',
  }));
  store.setStatus('doc-1', 'indexed');
  expect(store.get('doc-1')).toEqual(expect.objectContaining({
    indexStatus: 'indexed',
    indexedAt: '2026-10-09T12:00:00.000Z',
  }));
  expect(store.get('doc-1')).not.toHaveProperty('indexError');
});

test('rejects status changes for an unknown document', () => {
  const store = new DocumentStore();
  expect(() => store.setStatus('missing', 'indexed')).toThrow(
    expect.objectContaining({ code: 'DOCUMENT_NOT_FOUND', statusCode: 404 }),
  );
});
