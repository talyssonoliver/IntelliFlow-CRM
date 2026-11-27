'use client';

import { useEffect, useState } from 'react';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's UTC date as YYYY-MM-DD. */
export function utcDayOf(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Today's UTC date, kept current: it turns over at UTC midnight and catches up when a hidden tab
 * comes back (codex 27/11: the Stalled deals cutoff stayed on the day the tab was opened).
 */
export function useUtcDay(): string {
  const [day, setDay] = useState(() => utcDayOf(new Date()));

  useEffect(() => {
    const now = new Date();
    const untilMidnight = DAY_MS - (now.getTime() % DAY_MS) + 50;
    const timer = setTimeout(() => setDay(utcDayOf(new Date())), untilMidnight);
    const onVisible = () => {
      if (document.visibilityState === 'visible') setDay(utcDayOf(new Date()));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [day]);

  return day;
}
