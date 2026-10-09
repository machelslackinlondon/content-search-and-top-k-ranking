import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes } from './api/routes';
import { loadConfig, type AppConfig } from './config';
import { DocumentStore } from './domain/document-store';
import { BoundedQueue } from './index/bounded-queue';
import {
  IndexWorkerPool,
  type IndexJob,
} from './index/index-worker-pool';
import { InvertedIndex } from './index/inverted-index';
import { SearchService } from './search/search-service';
import { ServiceMetrics } from './metrics/metrics';

export interface SearchContext {
  config: Readonly<AppConfig>;
  store: DocumentStore;
  index: InvertedIndex;
  queue: BoundedQueue<IndexJob>;
  search: SearchService;
  workers: IndexWorkerPool;
  metrics: ServiceMetrics;
}

declare module 'fastify' {
  interface FastifyInstance {
    searchContext: SearchContext;
  }
}

export interface BuildAppOptions {
  logger?: boolean;
  config?: Readonly<AppConfig>;
  startWorkers?: boolean;
  indexDocument?: (document: import('./domain/document').DocumentInput) => Promise<void>;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const config = options.config ?? loadConfig();
  const store = new DocumentStore();
  const index = new InvertedIndex();
  const queue = new BoundedQueue<IndexJob>(config.indexing.queueCapacity);
  const metrics = new ServiceMetrics();
  const search = new SearchService(
    store,
    index,
    undefined,
    config.fuzzy,
    config.search,
    metrics,
  );
  const workers = new IndexWorkerPool({
    queue,
    store,
    index,
    concurrency: config.indexing.concurrency,
    maxRetries: config.indexing.maxRetries,
    ...(options.indexDocument === undefined ? {} : { indexDocument: options.indexDocument }),
    onEvent: (status) => metrics.recordIndex(status),
    onActiveWorkersChange: (active) => metrics.setActiveWorkers(active),
    onQueueDepthChange: (depth) => metrics.setQueueDepth(depth),
    onFailure: (documentId, attempts, error) => {
      metrics.recordError('index', 'INDEXING_FAILED');
      app.log.error(
        { documentId, attempts, code: 'INDEXING_FAILED', error: error.message },
        'Indexing failed',
      );
    },
  });
  const context: SearchContext = { config, store, index, queue, search, workers, metrics };
  app.decorate('searchContext', context);

  registerRoutes(app, context);
  if (options.startWorkers ?? true) {
    workers.start();
  }
  app.addHook('onClose', async () => workers.stop());

  return app;
}
