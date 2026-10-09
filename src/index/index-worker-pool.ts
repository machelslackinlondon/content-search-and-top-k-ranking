import type { DocumentInput } from '../domain/document';
import { DocumentStore } from '../domain/document-store';
import { AppError } from '../domain/errors';
import { BoundedQueue } from './bounded-queue';
import { InvertedIndex } from './inverted-index';

export interface IndexJob {
  documentId: string;
  attempt: number;
}

export interface IndexWorkerPoolOptions {
  queue: BoundedQueue<IndexJob>;
  store: DocumentStore;
  index: InvertedIndex;
  concurrency: number;
  maxRetries: number;
  indexDocument?: (document: DocumentInput) => Promise<void>;
  onFailure?: (documentId: string, attempts: number, error: Error) => void;
  onEvent?: (status: 'indexed' | 'retry' | 'failed') => void;
  onActiveWorkersChange?: (active: number) => void;
  onQueueDepthChange?: (depth: number) => void;
}

export class IndexWorkerPool {
  readonly #queue: BoundedQueue<IndexJob>;
  readonly #store: DocumentStore;
  readonly #index: InvertedIndex;
  readonly #concurrency: number;
  readonly #maxRetries: number;
  readonly #indexDocument: (document: DocumentInput) => Promise<void>;
  readonly #onFailure?: (documentId: string, attempts: number, error: Error) => void;
  readonly #onEvent?: (status: 'indexed' | 'retry' | 'failed') => void;
  readonly #onActiveWorkersChange?: (active: number) => void;
  readonly #onQueueDepthChange?: (depth: number) => void;
  readonly #drainWaiters: Array<() => void> = [];
  #loops: Array<Promise<void>> = [];
  #started = false;
  #stopping = false;
  #activeWorkers = 0;
  #failedJobs = 0;

  constructor(options: IndexWorkerPoolOptions) {
    this.#queue = options.queue;
    this.#store = options.store;
    this.#index = options.index;
    this.#concurrency = options.concurrency;
    this.#maxRetries = options.maxRetries;
    this.#indexDocument = options.indexDocument
      ?? (async (document) => { this.#index.replace(document); });
    if (options.onFailure !== undefined) {
      this.#onFailure = options.onFailure;
    }
    if (options.onEvent !== undefined) {
      this.#onEvent = options.onEvent;
    }
    if (options.onActiveWorkersChange !== undefined) {
      this.#onActiveWorkersChange = options.onActiveWorkersChange;
    }
    if (options.onQueueDepthChange !== undefined) {
      this.#onQueueDepthChange = options.onQueueDepthChange;
    }
  }

  get activeWorkers(): number {
    return this.#activeWorkers;
  }

  get failedJobs(): number {
    return this.#failedJobs;
  }

  start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.#loops = Array.from({ length: this.#concurrency }, () => this.#run());
  }

  async drain(): Promise<void> {
    await Promise.resolve();
    if (this.#isIdle()) {
      return;
    }
    await new Promise<void>((resolve) => this.#drainWaiters.push(resolve));
  }

  async stop(): Promise<void> {
    if (!this.#stopping) {
      this.#stopping = true;
      this.#queue.close();
    }
    await Promise.all(this.#loops);
  }

  async rebuild(): Promise<void> {
    await this.drain();
    this.#index.clear();
    const documents = this.#store.values().sort((left, right) => left.id.localeCompare(right.id));
    for (const document of documents) {
      await this.#process({ documentId: document.id, attempt: 0 });
    }
  }

  async #run(): Promise<void> {
    while (!this.#stopping) {
      try {
        const immediate = this.#queue.tryTake();
        const job = immediate ?? await this.#queue.take();
        this.#onQueueDepthChange?.(this.#queue.depth);
        this.#activeWorkers += 1;
        this.#onActiveWorkersChange?.(this.#activeWorkers);
        try {
          await this.#process(job);
        } finally {
          this.#activeWorkers -= 1;
          this.#onActiveWorkersChange?.(this.#activeWorkers);
          this.#notifyIdle();
        }
      } catch (error) {
        if (error instanceof AppError && error.code === 'INDEX_QUEUE_CLOSED') {
          return;
        }
        throw error;
      }
    }
  }

  async #process(job: IndexJob): Promise<void> {
    const document = this.#store.get(job.documentId);
    if (document === undefined) {
      return;
    }
    let retry = job.attempt;
    while (true) {
      this.#store.setStatus(document.id, 'indexing');
      try {
        await this.#indexDocument(document);
        this.#store.setStatus(document.id, 'indexed');
        this.#onEvent?.('indexed');
        return;
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error('Unknown indexing failure');
        if (retry < this.#maxRetries) {
          retry += 1;
          this.#onEvent?.('retry');
          continue;
        }
        this.#failedJobs += 1;
        this.#store.setStatus(document.id, 'failed', error.message);
        this.#onEvent?.('failed');
        this.#onFailure?.(document.id, retry + 1, error);
        return;
      }
    }
  }

  #isIdle(): boolean {
    return this.#queue.depth === 0 && this.#activeWorkers === 0;
  }

  #notifyIdle(): void {
    if (!this.#isIdle()) {
      return;
    }
    for (const resolve of this.#drainWaiters.splice(0)) {
      resolve();
    }
  }
}
