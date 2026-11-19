/**
 * "Who is waiting" on the dashboard card (MVP-014): how long someone has been waiting for our
 * reply, in the words the card shows.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** How many people the card lists; the rest are counted. */
export const WAITING_CARD_LIMIT = 3;

/** "waiting 2 days", "waiting 5 hours", "waiting under an hour". */
export function waitingLabel(since: Date | string, now: Date): string {
  const start = new Date(since).getTime();
  if (Number.isNaN(start)) return 'waiting';
  const elapsed = Math.max(0, now.getTime() - start);
  if (elapsed >= DAY_MS) {
    const days = Math.floor(elapsed / DAY_MS);
    return `waiting ${days} ${days === 1 ? 'day' : 'days'}`;
  }
  const hours = Math.floor(elapsed / HOUR_MS);
  if (hours >= 1) return `waiting ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return 'waiting under an hour';
}

/** Past two days the card turns the wait amber, past a week red. */
export function waitingTone(since: Date | string, now: Date): 'normal' | 'amber' | 'red' {
  const days = (now.getTime() - new Date(since).getTime()) / DAY_MS;
  if (days >= 7) return 'red';
  return days >= 2 ? 'amber' : 'normal';
}
