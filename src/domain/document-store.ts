import type { DocumentInput, IndexStatus, StoredDocument } from './document';
import { AppError } from './errors';

function cloneDocument<T extends DocumentInput>(document: T): T {
  return { ...document, tags: [...document.tags] };
}

export class DocumentStore {
  readonly #documents = new Map<string, StoredDocument>();
  readonly #now: () => string;

  constructor(now: () => string = () => new Date().toISOString()) {
    this.#now = now;
  }

  createMany(documents: readonly DocumentInput[]): void {
    const batchIds = new Set<string>();
    for (const document of documents) {
      if (batchIds.has(document.id)) {
        throw new AppError(
          'DUPLICATE_DOCUMENT_ID',
          409,
          `Document id "${document.id}" occurs more than once in the batch`,
          { id: document.id },
        );
      }
      if (this.#documents.has(document.id)) {
        throw new AppError(
          'DOCUMENT_EXISTS',
          409,
          `Document id "${document.id}" already exists`,
          { id: document.id },
        );
      }
      batchIds.add(document.id);
    }

    const acceptedAt = this.#now();
    for (const document of documents) {
      this.#documents.set(document.id, {
        ...cloneDocument(document),
        indexStatus: 'queued',
        acceptedAt,
      });
    }
  }

  has(id: string): boolean {
    return this.#documents.has(id);
  }

  get(id: string): StoredDocument | undefined {
    const document = this.#documents.get(id);
    return document === undefined ? undefined : cloneDocument(document);
  }

  values(): StoredDocument[] {
    return [...this.#documents.values()].map((document) => cloneDocument(document));
  }

  setStatus(id: string, status: IndexStatus, error?: string): void {
    const document = this.#documents.get(id);
    if (document === undefined) {
      throw new AppError(
        'DOCUMENT_NOT_FOUND',
        404,
        `Document id "${id}" does not exist`,
        { id },
      );
    }

    document.indexStatus = status;
    delete document.indexError;
    if (status === 'indexed') {
      document.indexedAt = this.#now();
    } else {
      delete document.indexedAt;
    }
    if (status === 'failed' && error !== undefined) {
      document.indexError = error;
    }
  }
}
