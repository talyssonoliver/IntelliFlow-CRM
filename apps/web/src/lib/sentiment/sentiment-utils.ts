/**
 * Sentiment Dashboard Utilities (PG-142)
 *
 * Color, icon, and badge class mapping for sentiment, emotion, and urgency values.
 * Located in lib/sentiment/ alongside hooks and types per project conventions.
 */

import type { SentimentLabel, EmotionLabel, UrgencyLevel } from '@intelliflow/domain';

const SENTIMENT_BADGE_CLASSES: Record<SentimentLabel, string> = {
  VERY_POSITIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  POSITIVE: 'bg-success/10 text-success',
  NEUTRAL: 'bg-muted text-muted-foreground',
  NEGATIVE: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  VERY_NEGATIVE: 'bg-destructive/10 text-destructive',
};

const SENTIMENT_COLORS: Record<SentimentLabel, string> = {
  VERY_POSITIVE: 'text-emerald-600 dark:text-emerald-400',
  POSITIVE: 'text-success',
  NEUTRAL: 'text-muted-foreground',
  NEGATIVE: 'text-orange-600 dark:text-orange-400',
  VERY_NEGATIVE: 'text-destructive',
};

const SENTIMENT_ICONS: Record<SentimentLabel, string> = {
  VERY_POSITIVE: 'sentiment_very_satisfied',
  POSITIVE: 'sentiment_satisfied',
  NEUTRAL: 'sentiment_neutral',
  NEGATIVE: 'sentiment_dissatisfied',
  VERY_NEGATIVE: 'sentiment_very_dissatisfied',
};

const EMOTION_ICONS: Record<EmotionLabel, string> = {
  JOY: 'mood',
  TRUST: 'handshake',
  ANTICIPATION: 'schedule',
  SURPRISE: 'priority_high',
  SADNESS: 'mood_bad',
  FEAR: 'warning',
  ANGER: 'local_fire_department',
  DISGUST: 'thumb_down',
  NEUTRAL: 'remove',
};

const EMOTION_COLORS: Record<EmotionLabel, string> = {
  JOY: 'text-yellow-600 dark:text-yellow-400',
  TRUST: 'text-primary',
  ANTICIPATION: 'text-purple-600 dark:text-purple-400',
  SURPRISE: 'text-pink-600 dark:text-pink-400',
  SADNESS: 'text-indigo-600 dark:text-indigo-400',
  FEAR: 'text-amber-600 dark:text-amber-400',
  ANGER: 'text-destructive',
  DISGUST: 'text-teal-600 dark:text-teal-400',
  NEUTRAL: 'text-muted-foreground',
};

const URGENCY_BADGE_CLASSES: Record<UrgencyLevel, string> = {
  CRITICAL: 'bg-destructive/10 text-destructive',
  HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  LOW: 'bg-muted text-muted-foreground',
  NONE: 'bg-muted text-muted-foreground',
};

export function getSentimentColor(sentiment: SentimentLabel): string {
  return SENTIMENT_COLORS[sentiment] ?? 'text-muted-foreground';
}

export function getSentimentIcon(sentiment: SentimentLabel): string {
  return SENTIMENT_ICONS[sentiment] ?? 'sentiment_neutral';
}

export function getSentimentBadgeClass(sentiment: SentimentLabel): string {
  return SENTIMENT_BADGE_CLASSES[sentiment] ?? SENTIMENT_BADGE_CLASSES.NEUTRAL;
}

export function getEmotionIcon(emotion: EmotionLabel): string {
  return EMOTION_ICONS[emotion] ?? 'remove';
}

export function getEmotionColor(emotion: EmotionLabel): string {
  return EMOTION_COLORS[emotion] ?? 'text-muted-foreground';
}

export function getUrgencyBadgeClass(urgency: UrgencyLevel): string {
  return URGENCY_BADGE_CLASSES[urgency] ?? URGENCY_BADGE_CLASSES.NONE;
}

const SENTIMENT_NORMALIZE_MAP: Record<string, SentimentLabel> = {
  very_positive: 'VERY_POSITIVE',
  positive: 'POSITIVE',
  neutral: 'NEUTRAL',
  negative: 'NEGATIVE',
  very_negative: 'VERY_NEGATIVE',
  'Very Positive': 'VERY_POSITIVE',
  Positive: 'POSITIVE',
  Neutral: 'NEUTRAL',
  Negative: 'NEGATIVE',
  'Very Negative': 'VERY_NEGATIVE',
  VERY_POSITIVE: 'VERY_POSITIVE',
  POSITIVE: 'POSITIVE',
  NEUTRAL: 'NEUTRAL',
  NEGATIVE: 'NEGATIVE',
  VERY_NEGATIVE: 'VERY_NEGATIVE',
};

export function normalizeSentiment(value: string | null): SentimentLabel | null {
  if (!value) return null;
  return SENTIMENT_NORMALIZE_MAP[value] ?? null;
}
