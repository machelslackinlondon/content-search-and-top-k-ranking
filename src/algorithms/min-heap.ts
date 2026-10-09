export type Comparator<T> = (left: T, right: T) => number;

export class MinHeap<T> {
  readonly #items: T[] = [];
  readonly #compare: Comparator<T>;

  constructor(compare: Comparator<T>) {
    this.#compare = compare;
  }

  get size(): number {
    return this.#items.length;
  }

  peek(): T | undefined {
    return this.#items[0];
  }

  push(value: T): void {
    this.#items.push(value);
    this.#siftUp(this.#items.length - 1);
  }

  replaceRoot(value: T): T {
    if (this.#items.length === 0) {
      throw new RangeError('Cannot replace the root of an empty heap');
    }
    const previous = this.#items[0] as T;
    this.#items[0] = value;
    this.#siftDown(0);
    return previous;
  }

  toArray(): T[] {
    return [...this.#items];
  }

  #siftUp(start: number): void {
    let child = start;
    while (child > 0) {
      const parent = Math.floor((child - 1) / 2);
      if (this.#compare(this.#items[child] as T, this.#items[parent] as T) >= 0) {
        return;
      }
      this.#swap(child, parent);
      child = parent;
    }
  }

  #siftDown(start: number): void {
    let parent = start;
    while (true) {
      const left = parent * 2 + 1;
      const right = left + 1;
      let smallest = parent;
      if (
        left < this.#items.length
        && this.#compare(this.#items[left] as T, this.#items[smallest] as T) < 0
      ) {
        smallest = left;
      }
      if (
        right < this.#items.length
        && this.#compare(this.#items[right] as T, this.#items[smallest] as T) < 0
      ) {
        smallest = right;
      }
      if (smallest === parent) {
        return;
      }
      this.#swap(parent, smallest);
      parent = smallest;
    }
  }

  #swap(left: number, right: number): void {
    const value = this.#items[left] as T;
    this.#items[left] = this.#items[right] as T;
    this.#items[right] = value;
  }
}

export function topK<T>(
  values: Iterable<T>,
  k: number,
  compareBestFirst: Comparator<T>,
): T[] {
  const capacity = Math.max(0, Math.floor(k));
  if (capacity === 0) {
    return [];
  }

  const compareWorstFirst = (left: T, right: T): number => compareBestFirst(right, left);
  const heap = new MinHeap(compareWorstFirst);
  for (const value of values) {
    if (heap.size < capacity) {
      heap.push(value);
      continue;
    }
    const worst = heap.peek();
    if (worst !== undefined && compareBestFirst(value, worst) < 0) {
      heap.replaceRoot(value);
    }
  }
  return heap.toArray().sort(compareBestFirst);
}
