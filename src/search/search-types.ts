import type { DocumentInput } from '../domain/document';

export interface SearchFilters {
  category?: string;
  author?: string;
  tags?: string[];
}

export interface SearchQuery {
  q: string;
  limit: number;
  fuzzy: boolean;
  filters: SearchFilters;
}

export interface FuzzyLimits {
  maxTermLength: number;
  maxVocabularyComparisons: number;
  maxExpansions: number;
  maxDistance: number;
  deadlineMs: number;
}

export interface FuzzyMetadata {
  comparisons: number;
  expansions: number;
  truncated: boolean;
}

export interface SearchResult {
  document: DocumentInput;
  score: number;
  explanation: ScoreExplanation;
}

export interface ScoreExplanation {
  coverage: number;
  termFrequency: number;
  titleBoost: number;
  tagBoost: number;
  popularity: number;
  total: number;
}

export interface SearchResponse {
  query: string;
  terms: string[];
  totalCandidates: number;
  consideredCandidates: number;
  tookMs: number;
  results: SearchResult[];
  fuzzy?: FuzzyMetadata;
}
