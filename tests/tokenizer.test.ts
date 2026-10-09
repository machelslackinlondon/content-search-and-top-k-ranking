import { countTerms, normalizeTerm, tokenize } from '../src/index/tokenizer';

test.each([
  ['Café NODE.js — Search!', ['café', 'node', 'js', 'search']],
  ['Ｆｕｌｌ－ｗｉｄｔｈ', ['full', 'width']],
  ['version2 API_2026', ['version2', 'api', '2026']],
  ['', []],
])('tokenizes %p into Unicode words and numbers', (input, expected) => {
  expect(tokenize(input)).toEqual(expected);
});

test('normalizes a single term consistently with tokenization', () => {
  expect(normalizeTerm(' ＮＯＤＥ ')).toBe('node');
});

test('counts repeated terms while preserving first-seen order', () => {
  expect([...countTerms(['node', 'search', 'node'])]).toEqual([
    ['node', 2],
    ['search', 1],
  ]);
});
