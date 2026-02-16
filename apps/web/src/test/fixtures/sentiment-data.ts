/**
 * Test fixtures for Sentiment Analysis Dashboard (PG-142)
 */

import type {
  SentimentStats,
  SentimentAnalysis,
  SentimentTrendPoint,
  SentimentDashboardData,
} from '@/lib/sentiment/types';

export const mockSentimentStats: SentimentStats = {
  total: 156,
  positive: 89,
  neutral: 42,
  negative: 25,
  avgScore: 0.42,
  urgentCount: 8,
};

export const mockSentimentDistribution: Record<string, number> = {
  VERY_POSITIVE: 34,
  POSITIVE: 55,
  NEUTRAL: 42,
  NEGATIVE: 18,
  VERY_NEGATIVE: 7,
};

export const mockSentimentAnalyses: SentimentAnalysis[] = [
  {
    id: 'sa-1',
    entityType: 'lead',
    entityId: 'lead-1',
    entityName: 'Acme Corp',
    sentiment: 'VERY_POSITIVE',
    sentimentScore: 0.92,
    emotions: [
      { emotion: 'JOY', intensity: 0.85 },
      { emotion: 'TRUST', intensity: 0.72 },
    ],
    primaryEmotion: 'JOY',
    urgency: 'NONE',
    keyPhrases: [
      { phrase: 'great product', sentiment: 'positive' },
      { phrase: 'excellent support', sentiment: 'positive' },
    ],
    confidence: 0.95,
    analyzedAt: '2026-02-13T10:30:00Z',
  },
  {
    id: 'sa-2',
    entityType: 'contact',
    entityId: 'contact-1',
    entityName: 'Jane Smith',
    sentiment: 'NEGATIVE',
    sentimentScore: -0.65,
    emotions: [
      { emotion: 'ANGER', intensity: 0.7 },
      { emotion: 'DISGUST', intensity: 0.4 },
    ],
    primaryEmotion: 'ANGER',
    urgency: 'HIGH',
    keyPhrases: [
      { phrase: 'delayed delivery', sentiment: 'negative' },
      { phrase: 'poor communication', sentiment: 'negative' },
    ],
    confidence: 0.88,
    analyzedAt: '2026-02-13T09:15:00Z',
  },
  {
    id: 'sa-3',
    entityType: 'lead',
    entityId: 'lead-2',
    entityName: 'TechStart Inc',
    sentiment: 'NEUTRAL',
    sentimentScore: 0.05,
    emotions: [
      { emotion: 'NEUTRAL', intensity: 0.6 },
      { emotion: 'ANTICIPATION', intensity: 0.3 },
    ],
    primaryEmotion: 'NEUTRAL',
    urgency: 'LOW',
    keyPhrases: [{ phrase: 'looking for options', sentiment: 'neutral' }],
    confidence: 0.72,
    analyzedAt: '2026-02-12T16:45:00Z',
  },
  {
    id: 'sa-4',
    entityType: 'contact',
    entityId: 'contact-2',
    entityName: 'Bob Johnson',
    sentiment: 'VERY_NEGATIVE',
    sentimentScore: -0.91,
    emotions: [
      { emotion: 'ANGER', intensity: 0.9 },
      { emotion: 'FEAR', intensity: 0.5 },
      { emotion: 'SADNESS', intensity: 0.6 },
      { emotion: 'DISGUST', intensity: 0.4 },
    ],
    primaryEmotion: 'ANGER',
    urgency: 'CRITICAL',
    keyPhrases: [
      { phrase: 'unacceptable service', sentiment: 'negative' },
      { phrase: 'cancelling contract', sentiment: 'negative' },
      {
        phrase:
          'This is a very long key phrase that should be truncated with ellipsis when displayed',
        sentiment: 'negative',
      },
    ],
    confidence: 0.97,
    analyzedAt: '2026-02-13T08:00:00Z',
  },
  {
    id: 'sa-5',
    entityType: 'lead',
    entityId: 'lead-3',
    entityName: 'Growth Partners',
    sentiment: 'POSITIVE',
    sentimentScore: 0.58,
    emotions: [
      { emotion: 'TRUST', intensity: 0.65 },
      { emotion: 'ANTICIPATION', intensity: 0.45 },
    ],
    primaryEmotion: 'TRUST',
    urgency: 'MEDIUM',
    keyPhrases: [{ phrase: 'interested in demo', sentiment: 'positive' }],
    confidence: 0.25,
    analyzedAt: '2026-02-11T14:20:00Z',
  },
];

export const mockSentimentTrends: SentimentTrendPoint[] = [
  { date: '2026-02-07', positive: 12, neutral: 8, negative: 3, avgScore: 0.45 },
  { date: '2026-02-08', positive: 15, neutral: 6, negative: 4, avgScore: 0.42 },
  { date: '2026-02-09', positive: 10, neutral: 9, negative: 5, avgScore: 0.32 },
  { date: '2026-02-10', positive: 14, neutral: 7, negative: 2, avgScore: 0.52 },
  { date: '2026-02-11', positive: 13, neutral: 5, negative: 6, avgScore: 0.35 },
  { date: '2026-02-12', positive: 11, neutral: 4, negative: 3, avgScore: 0.44 },
  { date: '2026-02-13', positive: 14, neutral: 3, negative: 2, avgScore: 0.55 },
];

export const mockDashboardData: SentimentDashboardData = {
  stats: mockSentimentStats,
  distribution: mockSentimentDistribution,
  recentAnalyses: mockSentimentAnalyses,
  trends: mockSentimentTrends,
};

export const mockEmptyDashboard: SentimentDashboardData = {
  stats: { total: 0, positive: 0, neutral: 0, negative: 0, avgScore: 0, urgentCount: 0 },
  distribution: {},
  recentAnalyses: [],
  trends: [],
};
