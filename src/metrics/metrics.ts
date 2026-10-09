import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client';
import type { SearchInstrumentation, SearchMode } from '../search/search-types';

export type IndexMetricStatus = 'accepted' | 'indexed' | 'retry' | 'failed';

export class ServiceMetrics implements SearchInstrumentation {
  readonly registry = new Registry();
  readonly #searchRequests: Counter<'mode' | 'status'>;
  readonly #searchLatency: Histogram<'mode'>;
  readonly #rankingLatency: Histogram;
  readonly #fuzzyLatency: Histogram;
  readonly #indexDocuments: Counter<'status'>;
  readonly #queueDepth: Gauge;
  readonly #queueRejections: Counter;
  readonly #activeWorkers: Gauge;
  readonly #errors: Counter<'component' | 'code'>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.#searchRequests = new Counter({
      name: 'search_requests_total',
      help: 'Search requests by mode and outcome',
      labelNames: ['mode', 'status'] as const,
      registers: [this.registry],
    });
    this.#searchLatency = new Histogram({
      name: 'search_latency_seconds',
      help: 'End-to-end search latency in seconds',
      labelNames: ['mode'] as const,
      buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      registers: [this.registry],
    });
    this.#rankingLatency = new Histogram({
      name: 'ranking_latency_seconds',
      help: 'Candidate ranking and Top-K latency in seconds',
      buckets: [0.0001, 0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1],
      registers: [this.registry],
    });
    this.#fuzzyLatency = new Histogram({
      name: 'fuzzy_search_latency_seconds',
      help: 'Fuzzy vocabulary expansion latency in seconds',
      buckets: [0.0005, 0.001, 0.0025, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25],
      registers: [this.registry],
    });
    this.#indexDocuments = new Counter({
      name: 'index_documents_total',
      help: 'Documents observed at indexing lifecycle stages',
      labelNames: ['status'] as const,
      registers: [this.registry],
    });
    this.#queueDepth = new Gauge({
      name: 'index_queue_depth',
      help: 'Current number of queued indexing jobs',
      registers: [this.registry],
    });
    this.#queueRejections = new Counter({
      name: 'index_queue_rejections_total',
      help: 'Producer requests rejected because the indexing queue was full',
      registers: [this.registry],
    });
    this.#activeWorkers = new Gauge({
      name: 'index_active_workers',
      help: 'Current number of workers actively indexing',
      registers: [this.registry],
    });
    this.#errors = new Counter({
      name: 'service_errors_total',
      help: 'Handled service errors by bounded component and code',
      labelNames: ['component', 'code'] as const,
      registers: [this.registry],
    });
    this.#queueDepth.set(0);
    this.#activeWorkers.set(0);
  }

  observeSearch(mode: SearchMode, durationMs: number): void {
    this.#searchRequests.inc({ mode, status: 'success' });
    this.#searchLatency.observe({ mode }, Math.max(0, durationMs) / 1_000);
  }

  observeRanking(durationMs: number): void {
    this.#rankingLatency.observe(Math.max(0, durationMs) / 1_000);
  }

  observeFuzzy(durationMs: number): void {
    this.#fuzzyLatency.observe(Math.max(0, durationMs) / 1_000);
  }

  recordSearchFailure(mode: SearchMode): void {
    this.#searchRequests.inc({ mode, status: 'error' });
  }

  recordIndex(status: IndexMetricStatus, count = 1): void {
    this.#indexDocuments.inc({ status }, count);
  }

  setQueueDepth(depth: number): void {
    this.#queueDepth.set(depth);
  }

  recordQueueRejection(): void {
    this.#queueRejections.inc();
  }

  setActiveWorkers(active: number): void {
    this.#activeWorkers.set(active);
  }

  recordError(component: 'api' | 'index' | 'queue' | 'search', code: string): void {
    this.#errors.inc({ component, code });
  }
}
