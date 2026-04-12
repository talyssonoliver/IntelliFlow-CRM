/**
 * Sentiment Dashboard Types (PG-142)
 *
 * Canonical response shape for the getSentimentDashboard tRPC procedure.
 * Used by hooks, test fixtures, and the intelligence router.
 */

import type { SentimentLabel, EmotionLabel, UrgencyLevel } from '@intelliflow/domain';

export interface SentimentStats {
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  avgScore: number;
  urgentCount: number;
}

export interface SentimentAnalysis {
  id: string;
  entityType: 'lead' | 'contact';
  entityId: string;
  entityName: string;
  sentiment: SentimentLabel;
  sentimentScore: number;
  emotions: Array<{ emotion: EmotionLabel; intensity: number }>;
  primaryEmotion: EmotionLabel;
  urgency: UrgencyLevel;
  keyPhrases: Array<{ phrase: string; sentiment: string }>;
  confidence: number;
  analyzedAt: string;
}

export interface SentimentTrendPoint {
  date: string;
  positive: number;
  neutral: number;
  negative: number;
  avgScore: number;
}

export interface SentimentDashboardData {
  stats: SentimentStats;
  distribution: Record<string, number>;
  recentAnalyses: SentimentAnalysis[];
  trends: SentimentTrendPoint[];
}
