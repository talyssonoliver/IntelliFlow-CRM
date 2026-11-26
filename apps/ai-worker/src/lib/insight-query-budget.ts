/**
 * Query budget for one ai-insights job (ADR-053 background budget). The generic background
 * budget is 50; this job writes each flagged person under its own locked transaction (about 4
 * queries each, PG-203 #1002) for up to 20 leads and 20 contacts, plus a few queries per
 * insight, so a busy tenant legitimately needs more: the 06:00 run on 25/11/2026 tipped 50 at
 * its 51st query. 450 is the measured worst case (444: 20 leads, 20 contacts and 20 insights
 * all high priority), pinned by jobs/__tests__/insight-generation.query-budget.test.ts, not a
 * guess.
 */
export const INSIGHT_JOB_QUERY_BUDGET = 450;

/**
 * The budget to seed for a background job: the insight queue's sized budget (never below the
 * generic one), the generic budget for every other queue, and the operator's
 * QUERY_BUDGET_BACKGROUND when it is set.
 */
export function insightJobQueryBudget(
  queueName: string | undefined,
  insightQueueName: string,
  genericBudget: number,
  env: NodeJS.ProcessEnv = process.env
): number {
  if (queueName !== insightQueueName || env['QUERY_BUDGET_BACKGROUND'] !== undefined) {
    return genericBudget;
  }
  return Math.max(genericBudget, INSIGHT_JOB_QUERY_BUDGET);
}
