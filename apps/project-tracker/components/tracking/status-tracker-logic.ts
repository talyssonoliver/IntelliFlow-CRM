/**
 * StatusTracker's calculations, kept out of the component so they can be tested (#1216: its
 * tests used to copy them).
 */

/** Completed share of the total as a whole percentage; 0 when there is nothing to count. */
export function completionRate(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

/** How many sprints the "By Sprint" list shows. */
export const MAX_SPRINTS_SHOWN = 6;

/**
 * The sprints the "By Sprint" list shows, in order: numbered sprints ascending, then named ones
 * (the plan also has "backlog" and "Continuous") alphabetically. The component used to sort
 * with parseInt(a) - parseInt(b), which is NaN for a named sprint and leaves the order undefined.
 */
export function sprintsToShow<T>(bySprint: Record<string, T>): Array<[string, T]> {
  return Object.entries(bySprint)
    .sort(([a], [b]) => {
      const numA = Number.parseInt(a, 10);
      const numB = Number.parseInt(b, 10);
      const aNamed = Number.isNaN(numA);
      const bNamed = Number.isNaN(numB);
      if (aNamed && bNamed) return a.localeCompare(b);
      if (aNamed) return 1;
      if (bNamed) return -1;
      return numA - numB;
    })
    .slice(0, MAX_SPRINTS_SHOWN);
}
