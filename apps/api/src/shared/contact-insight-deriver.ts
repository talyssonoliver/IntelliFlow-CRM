/**
 * Contact Insight Deriver
 *
 * Pure function module that derives ContactAIInsight fields from a contact's profile.
 * Zero external deps — fully unit-testable.
 *
 * Used by:
 *  - contact.router.ts getById (inline insight derivation when aiInsight is null)
 */

export interface ContactProfile {
  lastContactedAt?: Date | null;
  createdAt?: Date | null;
  title?: string | null;
  department?: string | null;
  status: string;
  leadScore?: number | null;
  opportunities?: Array<{ value: number | null; stage: string }>;
}

export interface DerivedContactInsights {
  conversionProbability: number;
  lifetimeValue: number;
  churnRisk: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  engagementScore: number;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
  sentimentTrend: string;
  nextBestAction: string;
  recommendations: string[];
  lastEngagementDays: number;
}

export function deriveContactLastEngagementDays(
  lastContactedAt?: Date | null,
  createdAt?: Date | null
): number {
  const ref = lastContactedAt ?? createdAt ?? new Date();
  return Math.max(0, Math.floor((Date.now() - ref.getTime()) / (1000 * 60 * 60 * 24)));
}

export function deriveContactChurnRisk(
  daysSinceContact: number,
  hasActiveDeals: boolean
): DerivedContactInsights['churnRisk'] {
  if (daysSinceContact <= 3) return 'MINIMAL';
  if (daysSinceContact <= 7) return 'LOW';
  if (daysSinceContact <= 14) return hasActiveDeals ? 'MEDIUM' : 'LOW';
  if (daysSinceContact <= 30) return hasActiveDeals ? 'HIGH' : 'MEDIUM';
  return hasActiveDeals ? 'CRITICAL' : 'HIGH';
}

export function deriveContactEngagement(
  daysSinceContact: number,
  activeDealsCount: number,
  title?: string | null
): number {
  let score = Math.max(0, 100 - daysSinceContact * 2);
  if (activeDealsCount > 0) score = Math.min(100, score + 15 + activeDealsCount * 5);
  if (title) {
    const t = title.toUpperCase();
    if (
      t.includes('VP') ||
      t.includes('DIRECTOR') ||
      t.includes('CTO') ||
      t.includes('CEO') ||
      t.includes('HEAD')
    )
      score = Math.min(100, score + 5);
  }
  return Math.round(score);
}

export function deriveContactSentiment(
  engagementScore: number
): DerivedContactInsights['sentiment'] {
  if (engagementScore >= 65) return 'POSITIVE';
  if (engagementScore >= 35) return 'NEUTRAL';
  return 'NEGATIVE';
}

export function deriveContactSentimentTrend(
  daysSinceContact: number,
  hasActiveDeals: boolean
): string {
  if (daysSinceContact <= 7 && hasActiveDeals) return 'improving';
  if (daysSinceContact > 30) return 'declining';
  return 'stable';
}

export function deriveContactNextBestAction(
  daysSinceContact: number,
  hasActiveDeals: boolean,
  engagementScore: number
): string {
  if (hasActiveDeals && daysSinceContact > 14)
    return 'Re-engage immediately — active deals need attention';
  if (hasActiveDeals && engagementScore >= 70)
    return 'Review deal progress and advance pipeline stage';
  if (hasActiveDeals) return 'Schedule a check-in to maintain deal momentum';
  if (daysSinceContact > 30) return 'Send a re-engagement email with relevant updates';
  if (engagementScore >= 60) return 'Explore upsell or cross-sell opportunities';
  return 'Add to nurture campaign with periodic touchpoints';
}

function deriveContactRecommendations(
  daysSinceContact: number,
  activeDeals: Array<{ value: number | null; stage: string }>,
  totalValue: number,
  title?: string | null
): string[] {
  const recs: string[] = [];

  if (activeDeals.length > 0) {
    recs.push(
      `${activeDeals.length} active deal${activeDeals.length > 1 ? 's' : ''} — maintain regular engagement`
    );
  }

  if (totalValue > 100_000) {
    recs.push('High-value relationship — consider executive sponsorship');
  } else if (totalValue > 0) {
    recs.push('Existing revenue — explore expansion opportunities');
  }

  if (daysSinceContact > 30) {
    recs.push(`No contact in ${daysSinceContact} days — schedule a follow-up urgently`);
  } else if (daysSinceContact > 14) {
    recs.push(`${daysSinceContact} days since last contact — time for a check-in`);
  }

  if (title) {
    const t = title.toUpperCase();
    if (
      t.includes('CTO') ||
      t.includes('VP') ||
      t.includes('DIRECTOR') ||
      t.includes('CEO') ||
      t.includes('HEAD')
    ) {
      recs.push('Decision-maker contact — prioritize for strategic conversations');
    }
  }

  if (recs.length === 0) {
    recs.push('Maintain periodic touchpoints to strengthen the relationship');
  }

  return recs.slice(0, 4);
}

/**
 * Derive all ContactAIInsight fields from a contact profile.
 */
export function deriveContactInsights(profile: ContactProfile): DerivedContactInsights {
  const daysSinceContact = deriveContactLastEngagementDays(
    profile.lastContactedAt,
    profile.createdAt
  );

  const activeDeals = (profile.opportunities || []).filter(
    (o) => !['CLOSED_WON', 'CLOSED_LOST'].includes(o.stage)
  );
  const hasActiveDeals = activeDeals.length > 0;
  const totalValue = (profile.opportunities || []).reduce(
    (sum, o) => sum + (Number(o.value) || 0),
    0
  );

  const engagementScore = deriveContactEngagement(
    daysSinceContact,
    activeDeals.length,
    profile.title
  );

  const rawConversion = hasActiveDeals
    ? 30 + activeDeals.length * 15 + (profile.leadScore || 0) * 0.3
    : (profile.leadScore || 0) * 0.5;

  return {
    conversionProbability: Math.round(Math.min(100, rawConversion)),
    lifetimeValue: totalValue,
    churnRisk: deriveContactChurnRisk(daysSinceContact, hasActiveDeals),
    engagementScore,
    sentiment: deriveContactSentiment(engagementScore),
    sentimentTrend: deriveContactSentimentTrend(daysSinceContact, hasActiveDeals),
    nextBestAction: deriveContactNextBestAction(daysSinceContact, hasActiveDeals, engagementScore),
    recommendations: deriveContactRecommendations(
      daysSinceContact,
      activeDeals,
      totalValue,
      profile.title
    ),
    lastEngagementDays: daysSinceContact,
  };
}
