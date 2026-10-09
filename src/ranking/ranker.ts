import type { DocumentInput } from '../domain/document';
import type { IndexedDocumentTerms } from '../index/inverted-index';
import type { ScoreExplanation, SearchResult } from '../search/search-types';

export interface RankingWeights {
  coverage: number;
  termFrequency: number;
  title: number;
  tag: number;
  popularity: number;
}

export const DEFAULT_RANKING_WEIGHTS: Readonly<RankingWeights> = Object.freeze({
  coverage: 4,
  termFrequency: 1,
  title: 2,
  tag: 1,
  popularity: 1,
});

export function rankDocument(
  document: DocumentInput,
  documentTerms: IndexedDocumentTerms,
  queryTerms: readonly string[],
  weights: Readonly<RankingWeights> = DEFAULT_RANKING_WEIGHTS,
): ScoreExplanation {
  const uniqueTerms = [...new Set(queryTerms)];
  const matchedTerms = uniqueTerms.filter((term) => documentTerms.all.has(term));
  const matchedFrequency = matchedTerms.reduce(
    (total, term) => total + (documentTerms.all.get(term) ?? 0),
    0,
  );
  const coverage = uniqueTerms.length === 0
    ? 0
    : (matchedTerms.length / uniqueTerms.length) * weights.coverage;
  const termFrequency = Math.log1p(matchedFrequency) * weights.termFrequency;
  const titleBoost = matchedTerms.filter((term) => documentTerms.title.has(term)).length
    * weights.title;
  const tagBoost = matchedTerms.filter((term) => documentTerms.tags.has(term)).length
    * weights.tag;
  const popularity = Math.min(
    1,
    Math.log1p(document.popularity) / Math.log1p(1_000_000),
  ) * weights.popularity;
  return {
    coverage,
    termFrequency,
    titleBoost,
    tagBoost,
    popularity,
    total: coverage + termFrequency + titleBoost + tagBoost + popularity,
  };
}

export function compareRankedResults(left: SearchResult, right: SearchResult): number {
  const scoreOrder = right.score - left.score;
  return scoreOrder === 0
    ? left.document.id.localeCompare(right.document.id)
    : scoreOrder;
}
