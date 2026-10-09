import { editDistance } from '../src/algorithms/edit-distance';

test.each([
  ['', '', 0],
  ['kitten', 'sitting', 3],
  ['search', 'serch', 1],
  ['a', '', 1],
  ['café', 'cafe', 1],
])('calculates editDistance(%p, %p)', (left, right, expected) => {
  expect(editDistance(left, right)).toBe(expected);
});

test('returns maxDistance plus one when the distance exceeds the bound', () => {
  expect(editDistance('abcdefgh', 'xyz', 2)).toBe(3);
  expect(editDistance('kitten', 'sitting', 3)).toBe(3);
});

test('uses Unicode code points rather than UTF-16 code units', () => {
  expect(editDistance('a😀', 'a😃')).toBe(1);
});

test('rejects a negative or non-integer bound', () => {
  expect(() => editDistance('a', 'b', -1)).toThrow(RangeError);
  expect(() => editDistance('a', 'b', 1.5)).toThrow(RangeError);
});
