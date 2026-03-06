import { describe, it, expect } from 'vitest';
import {
  deriveConversionProbability,
  deriveChurnRisk,
  deriveSentiment,
  deriveSentimentTrend,
  deriveNextBestAction,
  deriveIcpMatch,
  deriveEngagementScore,
  deriveLastEngagementDays,
  deriveLeadInsights,
  type LeadProfile,
} from '../lead-insight-deriver';

describe('lead-insight-deriver', () => {
  describe('deriveConversionProbability', () => {
    it('returns score at full confidence', () => {
      expect(deriveConversionProbability(80, 1)).toBe(80);
    });

    it('blends toward 50 at zero confidence', () => {
      expect(deriveConversionProbability(80, 0)).toBe(50);
    });

    it('blends proportionally at partial confidence', () => {
      // 80 * 0.5 + 50 * 0.5 = 65
      expect(deriveConversionProbability(80, 0.5)).toBe(65);
    });

    it('clamps to 0-100 range', () => {
      expect(deriveConversionProbability(0, 1)).toBe(0);
      expect(deriveConversionProbability(100, 1)).toBe(100);
    });
  });

  describe('deriveChurnRisk', () => {
    it('returns MINIMAL for score >= 75', () => {
      expect(deriveChurnRisk(75)).toBe('MINIMAL');
      expect(deriveChurnRisk(100)).toBe('MINIMAL');
    });

    it('returns LOW for score 60-74', () => {
      expect(deriveChurnRisk(60)).toBe('LOW');
      expect(deriveChurnRisk(74)).toBe('LOW');
    });

    it('returns MEDIUM for score 40-59', () => {
      expect(deriveChurnRisk(40)).toBe('MEDIUM');
      expect(deriveChurnRisk(59)).toBe('MEDIUM');
    });

    it('returns HIGH for score 20-39', () => {
      expect(deriveChurnRisk(20)).toBe('HIGH');
      expect(deriveChurnRisk(39)).toBe('HIGH');
    });

    it('returns CRITICAL for score < 20', () => {
      expect(deriveChurnRisk(19)).toBe('CRITICAL');
      expect(deriveChurnRisk(0)).toBe('CRITICAL');
    });
  });

  describe('deriveSentiment', () => {
    it('returns POSITIVE for score >= 65', () => {
      expect(deriveSentiment(65)).toBe('POSITIVE');
      expect(deriveSentiment(100)).toBe('POSITIVE');
    });

    it('returns NEUTRAL for score 35-64', () => {
      expect(deriveSentiment(35)).toBe('NEUTRAL');
      expect(deriveSentiment(64)).toBe('NEUTRAL');
    });

    it('returns NEGATIVE for score < 35', () => {
      expect(deriveSentiment(34)).toBe('NEGATIVE');
      expect(deriveSentiment(0)).toBe('NEGATIVE');
    });
  });

  describe('deriveSentimentTrend', () => {
    it('returns improving for QUALIFIED + high score', () => {
      expect(deriveSentimentTrend('QUALIFIED', 60)).toBe('improving');
    });

    it('returns improving for CONTACTED + high score', () => {
      expect(deriveSentimentTrend('CONTACTED', 75)).toBe('improving');
    });

    it('returns declining for UNQUALIFIED', () => {
      expect(deriveSentimentTrend('UNQUALIFIED', 80)).toBe('declining');
    });

    it('returns declining for LOST', () => {
      expect(deriveSentimentTrend('LOST', 50)).toBe('declining');
    });

    it('returns stable for NEW', () => {
      expect(deriveSentimentTrend('NEW', 50)).toBe('stable');
    });

    it('returns stable for CONTACTED with low score', () => {
      expect(deriveSentimentTrend('CONTACTED', 40)).toBe('stable');
    });
  });

  describe('deriveNextBestAction', () => {
    it('returns proposal action for score >= 80 and QUALIFIED', () => {
      const action = deriveNextBestAction(80, 'QUALIFIED');
      expect(action).toContain('proposal');
    });

    it('returns discovery call for score >= 80 and non-QUALIFIED', () => {
      const action = deriveNextBestAction(85, 'NEW');
      expect(action).toContain('discovery call');
    });

    it('returns follow-up for score 60-79', () => {
      const action = deriveNextBestAction(65, 'CONTACTED');
      expect(action).toContain('case studies');
    });

    it('returns nurture for score 40-59', () => {
      const action = deriveNextBestAction(45, 'NEW');
      expect(action).toContain('nurture');
    });

    it('returns monitor for score < 40', () => {
      const action = deriveNextBestAction(20, 'UNQUALIFIED');
      expect(action).toContain('Monitor');
    });
  });

  describe('deriveIcpMatch', () => {
    it('returns Strong Match for high score + title + company', () => {
      expect(deriveIcpMatch(80, 'CTO', 'TechCorp')).toBe('Strong Match');
    });

    it('returns Good Match for score 65-79', () => {
      expect(deriveIcpMatch(70, 'Manager', 'SomeCo')).toBe('Good Match');
    });

    it('returns Partial Match for score 45-64', () => {
      expect(deriveIcpMatch(50, null, null)).toBe('Partial Match');
    });

    it('returns Weak Match for score < 45', () => {
      expect(deriveIcpMatch(30, 'Intern', 'SmallCo')).toBe('Weak Match');
    });

    it('downgrades to Good Match when missing title despite high score', () => {
      expect(deriveIcpMatch(90, null, 'TechCorp')).toBe('Good Match');
    });

    it('downgrades when company is Freelance', () => {
      expect(deriveIcpMatch(85, 'CTO', 'Freelance')).toBe('Good Match');
    });
  });

  describe('deriveEngagementScore', () => {
    it('uses source base scores', () => {
      expect(deriveEngagementScore('WEBSITE')).toBe(90);
      expect(deriveEngagementScore('REFERRAL')).toBe(85);
      expect(deriveEngagementScore('OTHER')).toBe(40);
    });

    it('adds title boost for senior titles', () => {
      expect(deriveEngagementScore('OTHER', 'VP Engineering')).toBe(45);
      expect(deriveEngagementScore('OTHER', 'Manager')).toBe(43);
    });

    it('adds status boost for QUALIFIED', () => {
      expect(deriveEngagementScore('OTHER', null, 'QUALIFIED')).toBe(45);
    });

    it('subtracts for UNQUALIFIED status', () => {
      expect(deriveEngagementScore('OTHER', null, 'UNQUALIFIED')).toBe(30);
    });

    it('clamps to 0-100', () => {
      // WEBSITE (90) + VP title (5) + QUALIFIED (5) = 100, clamped
      expect(deriveEngagementScore('WEBSITE', 'VP Sales', 'QUALIFIED')).toBe(100);
    });
  });

  describe('deriveLastEngagementDays', () => {
    it('returns 0 for today', () => {
      expect(deriveLastEngagementDays(new Date())).toBe(0);
    });

    it('returns correct days since last contact', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      expect(deriveLastEngagementDays(threeDaysAgo)).toBe(3);
    });

    it('falls back to createdAt when no lastContactedAt', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
      expect(deriveLastEngagementDays(null, fiveDaysAgo)).toBe(5);
    });
  });

  describe('deriveLeadInsights (integration)', () => {
    it('populates all fields for a high-score lead', () => {
      const profile: LeadProfile = {
        score: 85,
        confidence: 0.9,
        source: 'WEBSITE',
        title: 'CTO',
        company: 'TechCorp',
        estimatedValue: 50000,
        status: 'QUALIFIED',
        lastContactedAt: new Date(),
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      };

      const result = deriveLeadInsights(profile);

      expect(result.conversionProbability).toBeGreaterThanOrEqual(0);
      expect(result.conversionProbability).toBeLessThanOrEqual(100);
      expect(result.estimatedValue).toBe(5000000); // 50000 * 100
      expect(result.churnRisk).toBe('MINIMAL');
      expect(result.sentiment).toBe('POSITIVE');
      expect(result.sentimentTrend).toBe('improving');
      expect(result.icpMatch).toBe('Strong Match');
      expect(result.engagementScore).toBeGreaterThan(0);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(1);
      expect(result.recommendations.length).toBeLessThanOrEqual(4);
      expect(result.lastEngagementDays).toBe(0);
      expect(result.nextBestAction).toBeTruthy();
    });

    it('uses score * 100_000 when no estimatedValue', () => {
      const profile: LeadProfile = {
        score: 60,
        confidence: 0.8,
        source: 'EMAIL',
        status: 'NEW',
      };

      const result = deriveLeadInsights(profile);
      expect(result.estimatedValue).toBe(6000000); // 60 * 100_000
    });
  });
});
