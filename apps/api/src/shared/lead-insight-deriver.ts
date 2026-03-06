/**
 * Lead Insight Deriver
 *
 * Pure function module that derives LeadAIInsight fields from a lead's profile.
 * Zero external deps — fully unit-testable.
 *
 * Used by:
 *  - lead.router.ts scoreWithAI (fire-and-forget insight upsert)
 *  - seed.ts (generating realistic seed data)
 */

export interface LeadProfile {
  score: number;
  confidence: number;
  source: string;
  title?: string | null;
  company?: string | null;
  estimatedValue?: number | null;
  status: string;
  lastContactedAt?: Date | null;
  createdAt?: Date | null;
}

export interface DerivedInsights {
  conversionProbability: number;
  estimatedValue: number;
  churnRisk: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  engagementScore: number;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  sentimentTrend: string;
  nextBestAction: string;
  recommendations: string[];
  lastEngagementDays: number;
  icpMatch: string;
}

export function deriveConversionProbability(score: number, confidence: number): number {
  const raw = score * confidence + 50 * (1 - confidence);
  return Math.round(Math.max(0, Math.min(100, raw)));
}

export function deriveChurnRisk(score: number): DerivedInsights['churnRisk'] {
  if (score >= 75) return 'MINIMAL';
  if (score >= 60) return 'LOW';
  if (score >= 40) return 'MEDIUM';
  if (score >= 20) return 'HIGH';
  return 'CRITICAL';
}

export function deriveSentiment(score: number): DerivedInsights['sentiment'] {
  if (score >= 65) return 'POSITIVE';
  if (score >= 35) return 'NEUTRAL';
  return 'NEGATIVE';
}

export function deriveSentimentTrend(status: string, score: number): string {
  const upper = status.toUpperCase();
  if ((upper === 'QUALIFIED' || upper === 'CONTACTED') && score >= 60) return 'improving';
  if (upper === 'UNQUALIFIED' || upper === 'LOST') return 'declining';
  return 'stable';
}

export function deriveNextBestAction(score: number, status: string): string {
  const upper = status.toUpperCase();
  if (score >= 80) {
    return upper === 'QUALIFIED'
      ? 'Send a tailored proposal addressing key pain points'
      : 'Schedule a discovery call to qualify needs and timeline';
  }
  if (score >= 60) return 'Follow up with relevant case studies and ROI analysis';
  if (score >= 40) return 'Add to nurture campaign with educational content';
  return 'Monitor for engagement signals before direct outreach';
}

export function deriveIcpMatch(
  score: number,
  title?: string | null,
  company?: string | null
): string {
  const hasTitle = !!title;
  const hasCompany = !!company && company.toLowerCase() !== 'freelance';
  if (score >= 80 && hasTitle && hasCompany) return 'Strong Match';
  if (score >= 65) return 'Good Match';
  if (score >= 45) return 'Partial Match';
  return 'Weak Match';
}

const SOURCE_BASE_SCORES: Record<string, number> = {
  WEBSITE: 90,
  REFERRAL: 85,
  EVENT: 80,
  EMAIL: 70,
  SOCIAL: 60,
  PHONE: 65,
  OTHER: 40,
};

export function deriveEngagementScore(
  source: string,
  title?: string | null,
  status?: string,
  lastContactedAt?: Date | null
): number {
  const base = SOURCE_BASE_SCORES[source.toUpperCase()] ?? 50;
  let adj = 0;

  // Title boost: having a senior title shows higher intent
  if (title) {
    const t = title.toUpperCase();
    if (
      t.includes('VP') ||
      t.includes('DIRECTOR') ||
      t.includes('CTO') ||
      t.includes('CEO') ||
      t.includes('HEAD')
    )
      adj += 5;
    else if (t.includes('MANAGER') || t.includes('FOUNDER')) adj += 3;
  }

  // Status boost
  if (status) {
    const s = status.toUpperCase();
    if (s === 'QUALIFIED') adj += 5;
    else if (s === 'CONTACTED') adj += 2;
    else if (s === 'UNQUALIFIED' || s === 'LOST') adj -= 10;
  }

  // Recency penalty: no contact in >30 days
  if (lastContactedAt) {
    const daysSince = Math.floor((Date.now() - lastContactedAt.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > 30) adj -= 10;
    else if (daysSince > 14) adj -= 5;
  }

  return Math.max(0, Math.min(100, base + adj));
}

export function deriveLastEngagementDays(
  lastContactedAt?: Date | null,
  createdAt?: Date | null
): number {
  const ref = lastContactedAt ?? createdAt ?? new Date();
  return Math.max(0, Math.floor((Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24)));
}

function deriveRecommendations(
  score: number,
  source: string,
  title?: string | null,
  status?: string
): string[] {
  const recs: string[] = [];

  // Tier-based primary recommendation
  if (score >= 80)
    recs.push('High-value prospect — prioritize personal outreach and executive sponsorship');
  else if (score >= 60)
    recs.push('Warm lead with potential — send targeted content and schedule a demo');
  else if (score >= 40)
    recs.push('Needs nurturing — enroll in drip campaign with educational resources');
  else recs.push('Low engagement — continue passive monitoring and brand awareness efforts');

  // Factor-based suggestions (up to 3 more)
  if (source.toUpperCase() === 'REFERRAL')
    recs.push('Referral source — leverage mutual connection for warm introduction');
  if (source.toUpperCase() === 'EVENT')
    recs.push('Event lead — reference the specific event in follow-up messaging');
  if (title) {
    const t = title.toUpperCase();
    if (t.includes('CTO') || t.includes('VP') || t.includes('DIRECTOR'))
      recs.push('Decision-maker title — prepare ROI-focused business case');
  }
  if (status?.toUpperCase() === 'NEW')
    recs.push('New lead — respond within 24 hours for optimal conversion');

  return recs.slice(0, 4);
}

/**
 * Derive all LeadAIInsight fields from a lead profile.
 */
export function deriveLeadInsights(profile: LeadProfile): DerivedInsights {
  return {
    conversionProbability: deriveConversionProbability(profile.score, profile.confidence),
    estimatedValue: profile.estimatedValue ? profile.estimatedValue * 100 : profile.score * 100_000,
    churnRisk: deriveChurnRisk(profile.score),
    engagementScore: deriveEngagementScore(
      profile.source,
      profile.title,
      profile.status,
      profile.lastContactedAt
    ),
    sentiment: deriveSentiment(profile.score),
    sentimentTrend: deriveSentimentTrend(profile.status, profile.score),
    nextBestAction: deriveNextBestAction(profile.score, profile.status),
    recommendations: deriveRecommendations(
      profile.score,
      profile.source,
      profile.title,
      profile.status
    ),
    lastEngagementDays: deriveLastEngagementDays(profile.lastContactedAt, profile.createdAt),
    icpMatch: deriveIcpMatch(profile.score, profile.title, profile.company),
  };
}
