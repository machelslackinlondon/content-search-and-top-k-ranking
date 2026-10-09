import { AppError } from './errors';

export interface DocumentInput {
  id: string;
  title: string;
  body: string;
  tags: string[];
  category?: string;
  author?: string;
  popularity: number;
}

export type IndexStatus = 'queued' | 'indexing' | 'indexed' | 'failed';

export interface StoredDocument extends DocumentInput {
  indexStatus: IndexStatus;
  acceptedAt: string;
  indexedAt?: string;
  indexError?: string;
}

export interface DocumentLimits {
  maxIdLength: number;
  maxTitleLength: number;
  maxBodyLength: number;
  maxTags: number;
  maxTagLength: number;
  maxCategoryLength: number;
  maxAuthorLength: number;
  maxPopularity: number;
}

function invalid(field: string, reason: string): never {
  throw new AppError(
    'INVALID_DOCUMENT',
    400,
    `Invalid document field "${field}": ${reason}`,
    { field, reason },
  );
}

function requiredString(
  value: unknown,
  field: string,
  maxLength: number,
): string {
  if (typeof value !== 'string') {
    return invalid(field, 'must be a string');
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    return invalid(field, 'must not be empty');
  }
  if (normalized.length > maxLength) {
    return invalid(field, `must be at most ${maxLength} characters`);
  }
  return normalized;
}

function optionalNormalizedString(
  value: unknown,
  field: string,
  maxLength: number,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, field, maxLength).toLocaleLowerCase('en');
}

function validateTags(value: unknown, limits: DocumentLimits): string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return invalid('tags', 'must be an array of strings');
  }
  if (value.length > limits.maxTags) {
    return invalid('tags', `must contain at most ${limits.maxTags} values`);
  }

  const tags = new Set<string>();
  for (const tag of value) {
    tags.add(requiredString(tag, 'tags', limits.maxTagLength).toLocaleLowerCase('en'));
  }
  return [...tags];
}

export function validateDocument(
  input: unknown,
  limits: DocumentLimits,
): DocumentInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return invalid('document', 'must be an object');
  }
  const value = input as Record<string, unknown>;
  const popularity = value.popularity ?? 0;
  if (
    typeof popularity !== 'number'
    || !Number.isFinite(popularity)
    || popularity < 0
    || popularity > limits.maxPopularity
  ) {
    return invalid(
      'popularity',
      `must be a finite number between 0 and ${limits.maxPopularity}`,
    );
  }

  const category = optionalNormalizedString(
    value.category,
    'category',
    limits.maxCategoryLength,
  );
  const author = optionalNormalizedString(
    value.author,
    'author',
    limits.maxAuthorLength,
  );

  return {
    id: requiredString(value.id, 'id', limits.maxIdLength),
    title: requiredString(value.title, 'title', limits.maxTitleLength),
    body: requiredString(value.body, 'body', limits.maxBodyLength),
    tags: validateTags(value.tags, limits),
    ...(category === undefined ? {} : { category }),
    ...(author === undefined ? {} : { author }),
    popularity,
  };
}
