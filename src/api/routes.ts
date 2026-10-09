import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SearchContext } from '../app';
import { validateDocument, type DocumentInput } from '../domain/document';
import { AppError } from '../domain/errors';
import type { SearchFilters } from '../search/search-types';

function errorBody(error: AppError): {
  error: { code: string; message: string; details?: Readonly<Record<string, unknown>> };
} {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

function admitDocuments(context: SearchContext, documents: readonly DocumentInput[]): void {
  const reservation = context.queue.reserve(documents.length);
  try {
    context.store.createMany(documents);
    reservation.commit(documents.map(({ id }) => ({ documentId: id, attempt: 0 })));
  } catch (error) {
    if (!reservation.settled) {
      reservation.release();
    }
    throw error;
  }
}

function bulkBody(request: FastifyRequest): unknown[] {
  const body = request.body;
  if (
    typeof body !== 'object'
    || body === null
    || Array.isArray(body)
    || !Array.isArray((body as Record<string, unknown>).documents)
  ) {
    throw new AppError(
      'INVALID_BULK_REQUEST',
      400,
      'Bulk request body must be an object with a documents array',
    );
  }
  return (body as { documents: unknown[] }).documents;
}

function searchParameters(request: FastifyRequest): {
  q: string;
  limit: number;
  fuzzy: boolean;
  filters: SearchFilters;
} {
  const query = request.query;
  const values = typeof query === 'object' && query !== null && !Array.isArray(query)
    ? query as Record<string, unknown>
    : {};
  if (typeof values.q !== 'string') {
    throw new AppError('MISSING_QUERY', 400, 'The q query parameter is required');
  }

  let limit = 10;
  if (values.limit !== undefined) {
    if (typeof values.limit !== 'string' || !/^\d+$/.test(values.limit)) {
      throw new AppError('INVALID_LIMIT', 400, 'limit must be a positive integer');
    }
    limit = Number(values.limit);
  }

  let fuzzy = false;
  if (values.fuzzy !== undefined) {
    if (values.fuzzy !== 'true' && values.fuzzy !== 'false') {
      throw new AppError(
        'INVALID_FUZZY_FLAG',
        400,
        'fuzzy must be either true or false',
      );
    }
    fuzzy = values.fuzzy === 'true';
  }

  const filters: SearchFilters = {};
  for (const field of ['category', 'author'] as const) {
    const value = values[field];
    if (value !== undefined) {
      if (typeof value !== 'string') {
        throw new AppError('INVALID_FILTER', 400, `${field} must be a string`);
      }
      filters[field] = value;
    }
  }
  if (values.tag !== undefined) {
    const tags = Array.isArray(values.tag) ? values.tag : [values.tag];
    if (!tags.every((tag) => typeof tag === 'string')) {
      throw new AppError('INVALID_FILTER', 400, 'tag must be a string');
    }
    filters.tags = tags as string[];
  }
  return { q: values.q, limit, fuzzy, filters };
}

export function registerRoutes(app: FastifyInstance, context: SearchContext): void {
  app.setErrorHandler((error: Error, _request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof AppError) {
      if (error.statusCode === 429) {
        void reply.header('Retry-After', '1');
      }
      void reply.code(error.statusCode).send(errorBody(error));
      return;
    }
    app.log.error(error);
    void reply.code(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  app.get('/search', async (request) => context.search.search(searchParameters(request)));

  app.post('/documents', async (request, reply) => {
    const document = validateDocument(request.body, context.config.documents);
    admitDocuments(context, [document]);
    return reply.code(202).send({ id: document.id, status: 'queued' });
  });

  app.post('/documents/bulk', async (request, reply) => {
    const rawDocuments = bulkBody(request);
    if (rawDocuments.length === 0) {
      throw new AppError('EMPTY_BULK_REQUEST', 400, 'Bulk requests must contain a document');
    }
    if (rawDocuments.length > context.config.indexing.maxBulkSize) {
      throw new AppError(
        'BULK_SIZE_EXCEEDED',
        400,
        `Bulk requests may contain at most ${context.config.indexing.maxBulkSize} documents`,
      );
    }
    const documents = rawDocuments.map((value) => validateDocument(
      value,
      context.config.documents,
    ));
    admitDocuments(context, documents);
    return reply.code(202).send({
      ids: documents.map(({ id }) => id),
      status: 'queued',
    });
  });
}
