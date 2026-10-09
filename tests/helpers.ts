import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import type { DocumentInput } from '../src/domain/document';

export function testDocument(overrides: Partial<DocumentInput> = {}): DocumentInput {
  return {
    id: 'doc-1',
    title: 'Node search',
    body: 'Index content',
    tags: ['backend'],
    popularity: 0,
    ...overrides,
  };
}

export function buildTestApp(environment: NodeJS.ProcessEnv = {}) {
  return buildApp({ config: loadConfig(environment) });
}

export async function indexAndDrain(
  app: ReturnType<typeof buildApp>,
  documents: readonly DocumentInput[],
): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: '/documents/bulk',
    payload: { documents },
  });
  if (response.statusCode !== 202) {
    throw new Error(`Expected seed ingestion to return 202, received ${response.statusCode}`);
  }
  await app.searchContext.workers.drain();
}
