import type { DocumentInput } from '../src/domain/document';
import { InvertedIndex } from '../src/index/inverted-index';

function document(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    id: 'doc-1',
    title: 'Node Node',
    body: 'Search with Node',
    tags: ['backend'],
    category: 'article',
    author: 'ada',
    popularity: 0,
    ...overrides,
  };
}

test('indexes aggregate frequencies and field-specific terms', () => {
  const index = new InvertedIndex();

  index.replace(document());

  expect(index.postings('node')).toEqual(new Map([['doc-1', 3]]));
  expect(index.postings('search')).toEqual(new Map([['doc-1', 1]]));
  expect(index.documentTerms('doc-1')).toEqual({
    all: new Map([
      ['node', 3],
      ['search', 1],
      ['with', 1],
      ['backend', 1],
    ]),
    title: new Set(['node']),
    tags: new Set(['backend']),
  });
});

test('indexes tag, category, and author filters without duplicate ids', () => {
  const index = new InvertedIndex();
  index.replace(document({ tags: ['backend', 'node'] }));

  expect(index.filterIds('tag', 'backend')).toEqual(new Set(['doc-1']));
  expect(index.filterIds('category', 'article')).toEqual(new Set(['doc-1']));
  expect(index.filterIds('author', 'ada')).toEqual(new Set(['doc-1']));
});

test('replacement removes stale postings and metadata filters', () => {
  const index = new InvertedIndex();
  index.replace(document({ title: 'old', body: 'value', category: 'first' }));

  index.replace(document({ title: 'new', body: 'content', category: 'second' }));

  expect(index.postings('old').size).toBe(0);
  expect(index.filterIds('category', 'first').size).toBe(0);
  expect(index.postings('new')).toEqual(new Map([['doc-1', 1]]));
  expect(index.filterIds('category', 'second')).toEqual(new Set(['doc-1']));
});

test('remove deletes the document and empty index entries', () => {
  const index = new InvertedIndex();
  index.replace(document());

  expect(index.remove('doc-1')).toBe(true);

  expect(index.remove('doc-1')).toBe(false);
  expect(index.postings('node').size).toBe(0);
  expect(index.vocabulary()).toEqual(new Set());
  expect(index.documentTerms('doc-1')).toBeUndefined();
});

test('read methods return copies that cannot mutate the index', () => {
  const index = new InvertedIndex();
  index.replace(document());

  index.postings('node').clear();
  index.filterIds('tag', 'backend').clear();
  index.documentTerms('doc-1')?.all.clear();
  index.vocabulary().clear();

  expect(index.postings('node')).toEqual(new Map([['doc-1', 3]]));
  expect(index.filterIds('tag', 'backend')).toEqual(new Set(['doc-1']));
  expect(index.documentTerms('doc-1')?.all.size).toBeGreaterThan(0);
  expect(index.vocabulary()).toContain('node');
});

test('clear removes all derived state', () => {
  const index = new InvertedIndex();
  index.replace(document());

  index.clear();

  expect(index.postings('node').size).toBe(0);
  expect(index.filterIds('author', 'ada').size).toBe(0);
  expect(index.documentTerms('doc-1')).toBeUndefined();
});
