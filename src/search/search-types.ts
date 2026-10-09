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

export interface SearchResult {
  document: DocumentInput;
  score: number;
}

export interface SearchResponse {
  query: string;
  terms: string[];
  totalCandidates: number;
  consideredCandidates: number;
  tookMs: number;
  results: SearchResult[];
}
