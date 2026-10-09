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

export interface SearchContext {
  config: Readonly<AppConfig>;
  store: DocumentStore;
  index: InvertedIndex;
  queue: BoundedQueue<IndexJob>;
  search: SearchService;
  workers: IndexWorkerPool;
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
  const search = new SearchService(store, index, undefined, config.fuzzy, config.search);
  const workers = new IndexWorkerPool({
    queue,
    store,
    index,
    concurrency: config.indexing.concurrency,
    maxRetries: config.indexing.maxRetries,
    ...(options.indexDocument === undefined ? {} : { indexDocument: options.indexDocument }),
  });
  const context: SearchContext = { config, store, index, queue, search, workers };
  app.decorate('searchContext', context);

  app.get('/health', async () => ({ status: 'ok' }));
  registerRoutes(app, context);
  if (options.startWorkers ?? true) {
    workers.start();
  }
  app.addHook('onClose', async () => workers.stop());

  return app;
}
