import type { DocumentLimits } from './domain/document';
import { AppError } from './domain/errors';
import type { FuzzyLimits, SearchLimits } from './search/search-types';

export interface IndexingConfig {
  maxBulkSize: number;
  queueCapacity: number;
  concurrency: number;
  maxRetries: number;
  shutdownTimeoutMs: number;
}

export interface AppConfig {
  server: Readonly<{ host: string; port: number }>;
  documents: Readonly<DocumentLimits>;
  search: Readonly<SearchLimits>;
  fuzzy: Readonly<FuzzyLimits>;
  indexing: Readonly<IndexingConfig>;
  health: Readonly<{ degradedQueueUtilization: number }>;
}

function integer(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = env[name];
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AppError(
      'INVALID_CONFIGURATION',
      500,
      `${name} must be a safe integer between ${minimum} and ${maximum}`,
      { name },
    );
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Readonly<AppConfig> {
  const host = (env.HOST ?? '0.0.0.0').trim();
  if (host.length === 0) {
    throw new AppError('INVALID_CONFIGURATION', 500, 'HOST must not be empty');
  }

  const config: AppConfig = {
    server: Object.freeze({
      host,
      port: integer(env, 'PORT', 3000, 1, 65_535),
    }),
    documents: Object.freeze({
      maxIdLength: integer(env, 'MAX_DOCUMENT_ID_LENGTH', 128, 1, 1_024),
      maxTitleLength: integer(env, 'MAX_DOCUMENT_TITLE_LENGTH', 512, 1, 10_000),
      maxBodyLength: integer(env, 'MAX_DOCUMENT_BODY_LENGTH', 100_000, 1, 10_000_000),
      maxTags: integer(env, 'MAX_DOCUMENT_TAGS', 50, 0, 1_000),
      maxTagLength: integer(env, 'MAX_DOCUMENT_TAG_LENGTH', 64, 1, 1_000),
      maxCategoryLength: integer(env, 'MAX_DOCUMENT_CATEGORY_LENGTH', 128, 1, 1_000),
      maxAuthorLength: integer(env, 'MAX_DOCUMENT_AUTHOR_LENGTH', 128, 1, 1_000),
      maxPopularity: integer(env, 'MAX_DOCUMENT_POPULARITY', 1_000_000, 0, 1_000_000_000),
    }),
    search: Object.freeze({
      maxQueryLength: integer(env, 'MAX_QUERY_LENGTH', 512, 1, 100_000),
      maxSearchTerms: integer(env, 'MAX_SEARCH_TERMS', 16, 1, 1_000),
      maxCandidates: integer(env, 'MAX_CANDIDATES', 10_000, 1, 10_000_000),
      maxTopK: integer(env, 'MAX_TOP_K', 100, 1, 10_000),
    }),
    fuzzy: Object.freeze({
      maxTermLength: integer(env, 'MAX_FUZZY_TERM_LENGTH', 32, 1, 1_000),
      maxVocabularyComparisons: integer(env, 'MAX_FUZZY_COMPARISONS', 500, 1, 1_000_000),
      maxExpansions: integer(env, 'MAX_FUZZY_EXPANSIONS', 5, 1, 10_000),
      maxDistance: integer(env, 'MAX_FUZZY_DISTANCE', 2, 0, 100),
      deadlineMs: integer(env, 'FUZZY_DEADLINE_MS', 25, 1, 60_000),
    }),
    indexing: Object.freeze({
      maxBulkSize: integer(env, 'MAX_BULK_SIZE', 100, 1, 100_000),
      queueCapacity: integer(env, 'INDEX_QUEUE_CAPACITY', 1_000, 1, 10_000_000),
      concurrency: integer(env, 'INDEXING_CONCURRENCY', 4, 1, 1_000),
      maxRetries: integer(env, 'MAX_INDEX_RETRIES', 1, 0, 100),
      shutdownTimeoutMs: integer(env, 'SHUTDOWN_TIMEOUT_MS', 5_000, 1, 600_000),
    }),
    health: Object.freeze({ degradedQueueUtilization: 0.8 }),
  };
  return Object.freeze(config);
}
