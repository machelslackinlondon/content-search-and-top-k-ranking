import type { DocumentInput } from '../src/domain/document';
import { DocumentStore } from '../src/domain/document-store';
import { BoundedQueue } from '../src/index/bounded-queue';
import { InvertedIndex } from '../src/index/inverted-index';
import { IndexWorkerPool, type IndexJob } from '../src/index/index-worker-pool';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => { resolve = resolver; });
  return { promise, resolve };
}

function document(id: string): DocumentInput {
  return { id, title: `Node ${id}`, body: 'Search', tags: [], popularity: 0 };
}

function enqueue(queue: BoundedQueue<IndexJob>, ids: string[]): void {
  queue.reserve(ids.length).commit(ids.map((documentId) => ({ documentId, attempt: 0 })));
}

test('never exceeds configured indexing concurrency', async () => {
  const queue = new BoundedQueue<IndexJob>(3);
  const store = new DocumentStore();
  const index = new InvertedIndex();
  store.createMany(['one', 'two', 'three'].map(document));
  const release = deferred<void>();
  const twoStarted = deferred<void>();
  let running = 0;
  let maximumRunning = 0;
  const pool = new IndexWorkerPool({
    queue,
    store,
    index,
    concurrency: 2,
    maxRetries: 0,
    indexDocument: async () => {
      running += 1;
      maximumRunning = Math.max(maximumRunning, running);
      if (running === 2) {
        twoStarted.resolve();
      }
      await release.promise;
      running -= 1;
    },
  });
  pool.start();
  enqueue(queue, ['one', 'two', 'three']);

  await twoStarted.promise;
  expect(pool.activeWorkers).toBe(2);
  expect(maximumRunning).toBe(2);
  release.resolve();
  await pool.drain();

  expect(store.values().map(({ indexStatus }) => indexStatus)).toEqual([
    'indexed', 'indexed', 'indexed',
  ]);
  await pool.stop();
});

test('retries a transient failure inside the same worker', async () => {
  const queue = new BoundedQueue<IndexJob>(1);
  const store = new DocumentStore();
  const index = new InvertedIndex();
  store.createMany([document('one')]);
  let attempts = 0;
  const pool = new IndexWorkerPool({
    queue,
    store,
    index,
    concurrency: 1,
    maxRetries: 1,
    indexDocument: async (value) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('transient');
      }
      index.replace(value);
    },
  });
  pool.start();
  enqueue(queue, ['one']);

  await pool.drain();

  expect(attempts).toBe(2);
  expect(store.get('one')?.indexStatus).toBe('indexed');
  expect(index.postings('node')).toEqual(new Map([['one', 1]]));
  await pool.stop();
});

test('records permanent failure while retaining the source document', async () => {
  const queue = new BoundedQueue<IndexJob>(1);
  const store = new DocumentStore();
  const index = new InvertedIndex();
  store.createMany([document('one')]);
  const failures: Array<{ id: string; attempts: number }> = [];
  const pool = new IndexWorkerPool({
    queue,
    store,
    index,
    concurrency: 1,
    maxRetries: 1,
    indexDocument: async () => { throw new Error('permanent'); },
    onFailure: (id, attempts) => failures.push({ id, attempts }),
  });
  pool.start();
  enqueue(queue, ['one']);

  await pool.drain();

  expect(pool.failedJobs).toBe(1);
  expect(store.get('one')).toEqual(expect.objectContaining({
    indexStatus: 'failed',
    indexError: 'permanent',
  }));
  expect(failures).toEqual([{ id: 'one', attempts: 2 }]);
  await pool.stop();
});

test('rebuild clears stale derived state and indexes every source in id order', async () => {
  const queue = new BoundedQueue<IndexJob>(2);
  const store = new DocumentStore();
  const index = new InvertedIndex();
  store.createMany([document('b'), document('a')]);
  index.replace({ ...document('stale'), id: 'stale' });
  const indexedOrder: string[] = [];
  const pool = new IndexWorkerPool({
    queue,
    store,
    index,
    concurrency: 1,
    maxRetries: 0,
    indexDocument: async (value) => {
      indexedOrder.push(value.id);
      index.replace(value);
    },
  });
  pool.start();

  await pool.rebuild();

  expect(indexedOrder).toEqual(['a', 'b']);
  expect(index.documentTerms('stale')).toBeUndefined();
  expect(store.values().every(({ indexStatus }) => indexStatus === 'indexed')).toBe(true);
  await pool.stop();
});
