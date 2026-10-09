import type { DocumentInput } from '../src/domain/document';
import type { IndexedDocumentTerms } from '../src/index/inverted-index';
import {
  compareRankedResults,
  DEFAULT_RANKING_WEIGHTS,
  rankDocument,
} from '../src/ranking/ranker';
import type { SearchResult } from '../src/search/search-types';

const document: DocumentInput = {
  id: 'doc-1',
  title: 'Node',
  body: 'Node search Node',
  tags: ['backend'],
  popularity: 100,
};

const terms: IndexedDocumentTerms = {
  all: new Map([['node', 3], ['search', 1], ['backend', 1]]),
  title: new Set(['node']),
  tags: new Set(['backend']),
};

test('explains coverage, frequency, field boosts, and bounded popularity', () => {
  const score = rankDocument(
    document,
    terms,
    ['node', 'backend'],
    DEFAULT_RANKING_WEIGHTS,
  );

  expect(score.coverage).toBe(4);
  expect(score.termFrequency).toBeCloseTo(Math.log1p(4));
  expect(score.titleBoost).toBe(2);
  expect(score.tagBoost).toBe(1);
  expect(score.popularity).toBeGreaterThan(0);
  expect(score.popularity).toBeLessThanOrEqual(1);
  expect(score.total).toBeCloseTo(
    score.coverage
      + score.termFrequency
      + score.titleBoost
      + score.tagBoost
      + score.popularity,
  );
});

test('counts unique query terms once when calculating coverage and boosts', () => {
  const score = rankDocument(document, terms, ['node', 'node'], DEFAULT_RANKING_WEIGHTS);

  expect(score.coverage).toBe(4);
  expect(score.termFrequency).toBeCloseTo(Math.log1p(3));
  expect(score.titleBoost).toBe(2);
});

test('compares higher scores first and breaks equal scores by ascending id', () => {
  function result(id: string, score: number): SearchResult {
    return {
      document: { ...document, id, tags: [] },
      score,
      explanation: {
        coverage: score,
        termFrequency: 0,
        titleBoost: 0,
        tagBoost: 0,
        popularity: 0,
        total: score,
      },
    };
  }

  expect([
    result('b', 2),
    result('a', 2),
    result('c', 3),
  ].sort(compareRankedResults).map(({ document: value }) => value.id)).toEqual(['c', 'a', 'b']);
});
