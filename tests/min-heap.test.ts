import { MinHeap, topK } from '../src/algorithms/min-heap';

const numericAscending = (left: number, right: number): number => left - right;
const numericBestFirst = (left: number, right: number): number => right - left;

test('maintains the smallest value at the root through pushes and replacement', () => {
  const heap = new MinHeap(numericAscending);
  for (const value of [4, 2, 5, 1, 3]) {
    heap.push(value);
  }

  expect(heap.size).toBe(5);
  expect(heap.peek()).toBe(1);
  expect(heap.replaceRoot(6)).toBe(1);
  expect(heap.peek()).toBe(2);
});

test('keeps only the best k values and returns them best-first', () => {
  expect(topK([5, 1, 4, 2, 3], 3, numericBestFirst)).toEqual([5, 4, 3]);
});

test('handles k zero and k larger than the input', () => {
  expect(topK([2, 1], 0, numericBestFirst)).toEqual([]);
  expect(topK([2, 1], 5, numericBestFirst)).toEqual([2, 1]);
});

test('rejects replacement on an empty heap', () => {
  const heap = new MinHeap(numericAscending);
  expect(() => heap.replaceRoot(1)).toThrow('empty heap');
});

test('returns a copy rather than exposing heap storage', () => {
  const heap = new MinHeap(numericAscending);
  heap.push(2);
  const values = heap.toArray();
  values.push(1);
  expect(heap.size).toBe(1);
});
