/**
 * Priority writes for a drag-reorder of routing rules.
 *
 * Convention (schema + LeadRoutingService): a HIGHER priority is evaluated
 * FIRST, and the list is shown in evaluation order, so the top row must carry
 * the largest number. The reordered rows reuse the number range that the
 * pre-reorder rows already occupied (from their lowest priority upward), so a
 * partial page of rules never jumps past rules that are not on screen.
 */
export interface PriorityWrite {
  id: string;
  priority: number;
}

export function prioritiesForOrder(
  reordered: ReadonlyArray<{ id: string; priority: number }>
): PriorityWrite[] {
  const base = reordered.reduce((lowest, rule) => Math.min(lowest, rule.priority), Infinity);
  const floor = Number.isFinite(base) ? base : 0;
  const last = reordered.length - 1;
  return reordered.map((rule, index) => ({ id: rule.id, priority: floor + (last - index) }));
}
