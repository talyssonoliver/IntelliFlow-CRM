/**
 * getDrainDelaySeconds — idle BullMQ blocking time.
 *
 * BullMQ's 5 s default wakes every idle worker every 5 s (~1,600 Redis
 * commands a minute across ~14 workers). New jobs wake a blocked worker
 * through the marker key, so a 30 s block adds no pickup latency.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_DRAIN_DELAY_SECONDS, getDrainDelaySeconds } from './drain-delay';

describe('getDrainDelaySeconds', () => {
  const saved = process.env.QUEUE_DRAIN_DELAY_SECONDS;

  afterEach(() => {
    if (saved === undefined) delete process.env.QUEUE_DRAIN_DELAY_SECONDS;
    else process.env.QUEUE_DRAIN_DELAY_SECONDS = saved;
  });

  it('defaults to 30 s, not BullMQ’s 5 s', () => {
    delete process.env.QUEUE_DRAIN_DELAY_SECONDS;
    expect(DEFAULT_DRAIN_DELAY_SECONDS).toBe(30);
    expect(getDrainDelaySeconds()).toBe(30);
  });

  it('honours QUEUE_DRAIN_DELAY_SECONDS', () => {
    process.env.QUEUE_DRAIN_DELAY_SECONDS = '10';
    expect(getDrainDelaySeconds()).toBe(10);
  });

  it.each(['0', '-5', 'abc', ''])('falls back to the default for %j', (value) => {
    process.env.QUEUE_DRAIN_DELAY_SECONDS = value;
    expect(getDrainDelaySeconds()).toBe(30);
  });
});
