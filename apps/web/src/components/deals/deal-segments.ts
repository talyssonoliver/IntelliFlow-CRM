import { OPPORTUNITY_STAGES, type OpportunityStage } from '@intelliflow/domain';

/**
 * The Deals sidebar's segments (owner 26/11: the sidebar's folders and segments did nothing).
 * Each segment is a real filter on the deals list: `/deals?segment=hot` or `?segment=stalled`.
 */
export type DealSegment = 'hot' | 'stalled';

const DAY_MS = 86_400_000;
const OPEN_STAGES = OPPORTUNITY_STAGES.filter(
  (s) => s !== 'CLOSED_WON' && s !== 'CLOSED_LOST'
) as OpportunityStage[];

export interface DealSegmentFilter {
  label: string;
  stage: OpportunityStage[];
  minProbability?: number;
  updatedBefore?: Date;
}

export function parseDealSegment(value: string | null | undefined): DealSegment | null {
  return value === 'hot' || value === 'stalled' ? value : null;
}

/**
 * The list filter for a segment. `now` is rounded down to the UTC day, so the stalled cutoff (and
 * the query key) holds still all day.
 */
export function dealSegmentFilter(segment: DealSegment, now: Date): DealSegmentFilter {
  if (segment === 'hot') {
    return { label: 'Hot deals (over 70%)', stage: OPEN_STAGES, minProbability: 71 };
  }
  const today = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  return {
    label: 'Stalled (no update in 30 days)',
    stage: OPEN_STAGES,
    updatedBefore: new Date(today - 30 * DAY_MS),
  };
}
