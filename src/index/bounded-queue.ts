import { AppError } from '../domain/errors';

export class QueueReservation<T> {
  readonly #count: number;
  readonly #commit: (items: readonly T[]) => void;
  readonly #release: () => void;
  #settled = false;

  constructor(
    count: number,
    commit: (items: readonly T[]) => void,
    release: () => void,
  ) {
    this.#count = count;
    this.#commit = commit;
    this.#release = release;
  }

  get settled(): boolean {
    return this.#settled;
  }

  commit(items: readonly T[]): void {
    this.#assertActive();
    if (items.length !== this.#count) {
      throw new RangeError(`Reservation must commit exactly ${this.#count} items`);
    }
    this.#commit(items);
    this.#settled = true;
  }

  release(): void {
    this.#assertActive();
    this.#release();
    this.#settled = true;
  }

  #assertActive(): void {
    if (this.#settled) {
      throw new Error('Queue reservation is already settled');
    }
  }
}

interface WaitingConsumer<T> {
  resolve: (item: T) => void;
  reject: (error: AppError) => void;
}

export class BoundedQueue<T> {
  readonly #capacity: number;
  readonly #items: T[] = [];
  readonly #consumers: Array<WaitingConsumer<T>> = [];
  #reserved = 0;
  #closed = false;

  constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError('Queue capacity must be a positive safe integer');
    }
    this.#capacity = capacity;
  }

  get capacity(): number {
    return this.#capacity;
  }

  get depth(): number {
    return this.#items.length;
  }

  get reserved(): number {
    return this.#reserved;
  }

  reserve(count: number): QueueReservation<T> {
    this.#assertOpen();
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new RangeError('Reservation count must be a positive safe integer');
    }
    if (this.#items.length + this.#reserved + count > this.#capacity) {
      throw new AppError(
        'INDEX_QUEUE_FULL',
        429,
        `The indexing queue has no capacity for ${count} additional job${count === 1 ? '' : 's'}`,
        {
          capacity: this.#capacity,
          depth: this.#items.length,
          requested: count,
          reserved: this.#reserved,
        },
      );
    }
    this.#reserved += count;
    return new QueueReservation(
      count,
      (items) => this.#commit(count, items),
      () => { this.#reserved -= count; },
    );
  }

  take(): Promise<T> {
    const item = this.#items.shift();
    if (item !== undefined) {
      return Promise.resolve(item);
    }
    if (this.#closed) {
      return Promise.reject(this.#closedError());
    }
    return new Promise<T>((resolve, reject) => {
      this.#consumers.push({ resolve, reject });
    });
  }

  close(): void {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    const error = this.#closedError();
    for (const consumer of this.#consumers.splice(0)) {
      consumer.reject(error);
    }
  }

  #commit(count: number, items: readonly T[]): void {
    this.#assertOpen();
    this.#reserved -= count;
    for (const item of items) {
      const consumer = this.#consumers.shift();
      if (consumer === undefined) {
        this.#items.push(item);
      } else {
        consumer.resolve(item);
      }
    }
  }

  #assertOpen(): void {
    if (this.#closed) {
      throw this.#closedError();
    }
  }

  #closedError(): AppError {
    return new AppError('INDEX_QUEUE_CLOSED', 503, 'The indexing queue is closed');
  }
}
