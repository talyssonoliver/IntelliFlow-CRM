import { describe, it, expect } from 'vitest';
import {
  getSentimentColor,
  getSentimentIcon,
  getSentimentBadgeClass,
  getEmotionIcon,
  getEmotionColor,
  getUrgencyBadgeClass,
  normalizeSentiment,
} from '../sentiment-utils';

describe('sentiment-utils', () => {
  describe('getSentimentBadgeClass', () => {
    it('returns emerald class for VERY_POSITIVE', () => {
      expect(getSentimentBadgeClass('VERY_POSITIVE')).toContain('bg-emerald-100');
    });

    it('returns success class for POSITIVE', () => {
      expect(getSentimentBadgeClass('POSITIVE')).toContain('bg-success/10');
    });

    it('returns muted class for NEUTRAL', () => {
      expect(getSentimentBadgeClass('NEUTRAL')).toContain('bg-muted');
    });

    it('returns orange class for NEGATIVE', () => {
      expect(getSentimentBadgeClass('NEGATIVE')).toContain('bg-orange-100');
    });

    it('returns destructive class for VERY_NEGATIVE', () => {
      expect(getSentimentBadgeClass('VERY_NEGATIVE')).toContain('bg-destructive/10');
    });

    it('returns NEUTRAL fallback for unknown value', () => {
      expect(getSentimentBadgeClass('UNKNOWN' as any)).toContain('bg-muted');
    });
  });

  describe('getSentimentColor', () => {
    it('returns emerald for VERY_POSITIVE', () => {
      expect(getSentimentColor('VERY_POSITIVE')).toContain('text-emerald');
    });

    it('returns success for POSITIVE', () => {
      expect(getSentimentColor('POSITIVE')).toBe('text-success');
    });

    it('returns muted for NEUTRAL', () => {
      expect(getSentimentColor('NEUTRAL')).toBe('text-muted-foreground');
    });

    it('returns orange for NEGATIVE', () => {
      expect(getSentimentColor('NEGATIVE')).toContain('text-orange');
    });

    it('returns destructive for VERY_NEGATIVE', () => {
      expect(getSentimentColor('VERY_NEGATIVE')).toBe('text-destructive');
    });

    it('returns fallback for unknown value', () => {
      expect(getSentimentColor('UNKNOWN' as any)).toBe('text-muted-foreground');
    });
  });

  describe('getSentimentIcon', () => {
    it('returns correct icon for each sentiment level', () => {
      expect(getSentimentIcon('VERY_POSITIVE')).toBe('sentiment_very_satisfied');
      expect(getSentimentIcon('POSITIVE')).toBe('sentiment_satisfied');
      expect(getSentimentIcon('NEUTRAL')).toBe('sentiment_neutral');
      expect(getSentimentIcon('NEGATIVE')).toBe('sentiment_dissatisfied');
      expect(getSentimentIcon('VERY_NEGATIVE')).toBe('sentiment_very_dissatisfied');
    });

    it('returns fallback for unknown value', () => {
      expect(getSentimentIcon('UNKNOWN' as any)).toBe('sentiment_neutral');
    });
  });

  describe('getEmotionIcon', () => {
    it('returns correct icon for each emotion', () => {
      expect(getEmotionIcon('JOY')).toBe('mood');
      expect(getEmotionIcon('TRUST')).toBe('handshake');
      expect(getEmotionIcon('ANTICIPATION')).toBe('schedule');
      expect(getEmotionIcon('SURPRISE')).toBe('priority_high');
      expect(getEmotionIcon('SADNESS')).toBe('mood_bad');
      expect(getEmotionIcon('FEAR')).toBe('warning');
      expect(getEmotionIcon('ANGER')).toBe('local_fire_department');
      expect(getEmotionIcon('DISGUST')).toBe('thumb_down');
      expect(getEmotionIcon('NEUTRAL')).toBe('remove');
    });

    it('returns fallback for unknown value', () => {
      expect(getEmotionIcon('UNKNOWN' as any)).toBe('remove');
    });
  });

  describe('getEmotionColor', () => {
    it('returns correct color for each emotion', () => {
      expect(getEmotionColor('JOY')).toContain('text-yellow');
      expect(getEmotionColor('TRUST')).toBe('text-primary');
      expect(getEmotionColor('ANTICIPATION')).toContain('text-purple');
      expect(getEmotionColor('SURPRISE')).toContain('text-pink');
      expect(getEmotionColor('SADNESS')).toContain('text-indigo');
      expect(getEmotionColor('FEAR')).toContain('text-amber');
      expect(getEmotionColor('ANGER')).toBe('text-destructive');
      expect(getEmotionColor('DISGUST')).toContain('text-teal');
      expect(getEmotionColor('NEUTRAL')).toBe('text-muted-foreground');
    });

    it('returns fallback for unknown value', () => {
      expect(getEmotionColor('UNKNOWN' as any)).toBe('text-muted-foreground');
    });
  });

  describe('getUrgencyBadgeClass', () => {
    it('returns destructive for CRITICAL', () => {
      expect(getUrgencyBadgeClass('CRITICAL')).toContain('bg-destructive/10');
    });

    it('returns orange for HIGH', () => {
      expect(getUrgencyBadgeClass('HIGH')).toContain('bg-orange-100');
    });

    it('returns yellow for MEDIUM', () => {
      expect(getUrgencyBadgeClass('MEDIUM')).toContain('bg-yellow-100');
    });

    it('returns muted for LOW', () => {
      expect(getUrgencyBadgeClass('LOW')).toContain('bg-muted');
    });

    it('returns muted for NONE', () => {
      expect(getUrgencyBadgeClass('NONE')).toContain('bg-muted');
    });

    it('returns NONE fallback for unknown value', () => {
      expect(getUrgencyBadgeClass('UNKNOWN' as any)).toContain('bg-muted');
    });
  });

  describe('normalizeSentiment', () => {
    it('returns null for null input', () => {
      expect(normalizeSentiment(null)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(normalizeSentiment('')).toBeNull();
    });

    it('normalizes lowercase values', () => {
      expect(normalizeSentiment('very_positive')).toBe('VERY_POSITIVE');
      expect(normalizeSentiment('positive')).toBe('POSITIVE');
      expect(normalizeSentiment('neutral')).toBe('NEUTRAL');
      expect(normalizeSentiment('negative')).toBe('NEGATIVE');
      expect(normalizeSentiment('very_negative')).toBe('VERY_NEGATIVE');
    });

    it('normalizes title case values', () => {
      expect(normalizeSentiment('Very Positive')).toBe('VERY_POSITIVE');
      expect(normalizeSentiment('Positive')).toBe('POSITIVE');
      expect(normalizeSentiment('Neutral')).toBe('NEUTRAL');
      expect(normalizeSentiment('Negative')).toBe('NEGATIVE');
      expect(normalizeSentiment('Very Negative')).toBe('VERY_NEGATIVE');
    });

    it('passes through uppercase values', () => {
      expect(normalizeSentiment('VERY_POSITIVE')).toBe('VERY_POSITIVE');
      expect(normalizeSentiment('POSITIVE')).toBe('POSITIVE');
      expect(normalizeSentiment('NEUTRAL')).toBe('NEUTRAL');
      expect(normalizeSentiment('NEGATIVE')).toBe('NEGATIVE');
      expect(normalizeSentiment('VERY_NEGATIVE')).toBe('VERY_NEGATIVE');
    });

    it('returns null for unrecognized values', () => {
      expect(normalizeSentiment('UNKNOWN')).toBeNull();
      expect(normalizeSentiment('happy')).toBeNull();
    });
  });
});
