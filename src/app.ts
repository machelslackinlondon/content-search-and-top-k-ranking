import Fastify, { type FastifyInstance } from 'fastify';
import { registerRoutes, type IndexJob } from './api/routes';
import { loadConfig, type AppConfig } from './config';
import { DocumentStore } from './domain/document-store';
import { BoundedQueue } from './index/bounded-queue';
import { InvertedIndex } from './index/inverted-index';
import { SearchService } from './search/search-service';

export interface SearchContext {
  config: Readonly<AppConfig>;
  store: DocumentStore;
  index: InvertedIndex;
  queue: BoundedQueue<IndexJob>;
  search: SearchService;
}

declare module 'fastify' {
  interface FastifyInstance {
    searchContext: SearchContext;
  }
}

export interface BuildAppOptions {
  logger?: boolean;
  config?: Readonly<AppConfig>;
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? false });
  const config = options.config ?? loadConfig();
  const store = new DocumentStore();
  const index = new InvertedIndex();
  const queue = new BoundedQueue<IndexJob>(config.indexing.queueCapacity);
  const search = new SearchService(store, index, undefined, config.fuzzy, config.search);
  const context: SearchContext = { config, store, index, queue, search };
  app.decorate('searchContext', context);

  app.get('/health', async () => ({ status: 'ok' }));
  registerRoutes(app, context);
  app.addHook('onClose', async () => queue.close());

  return app;
}
