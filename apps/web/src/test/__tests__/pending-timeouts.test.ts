import { describe, it, expect, afterEach } from 'vitest';
import { promisify } from 'node:util';

import { trackTimeouts, type TimeoutTracker } from '../pending-timeouts';

/** A host with its own real timer functions, so tests do not touch globalThis. */
function makeHost() {
  return { setTimeout, clearTimeout } as {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('trackTimeouts', () => {
  let tracker: TimeoutTracker | undefined;
  afterEach(() => tracker?.restore());

  it('counts a timeout until it fires, then forgets it', async () => {
    const host = makeHost();
    tracker = trackTimeouts(host);
    let fired = 0;
    host.setTimeout(() => (fired += 1), 5);
    expect(tracker.pending).toBe(1);
    await wait(30);
    expect(fired).toBe(1);
    expect(tracker.pending).toBe(0);
  });

  it('passes extra arguments through to the handler', async () => {
    const host = makeHost();
    tracker = trackTimeouts(host);
    const seen: unknown[] = [];
    host.setTimeout((a: unknown, b: unknown) => seen.push(a, b), 1, 'x', 2);
    await wait(20);
    expect(seen).toEqual(['x', 2]);
  });

  it('forgets a timeout the code cleared itself', () => {
    const host = makeHost();
    tracker = trackTimeouts(host);
    const id = host.setTimeout(() => {}, 1000);
    host.clearTimeout(id);
    expect(tracker.pending).toBe(0);
  });

  it('clears what is still pending, so a leaked callback never runs', async () => {
    const host = makeHost();
    tracker = trackTimeouts(host);
    let fired = 0;
    host.setTimeout(() => (fired += 1), 10);
    host.setTimeout(() => (fired += 1), 10);
    expect(tracker.clearPending()).toBe(2);
    expect(tracker.pending).toBe(0);
    await wait(40);
    expect(fired).toBe(0);
  });

  it('ignores a string handler instead of evaluating it', async () => {
    const host = makeHost();
    tracker = trackTimeouts(host);
    host.setTimeout('throw new Error("evaluated")' as unknown as () => void, 1);
    await wait(20);
    expect(tracker.pending).toBe(0);
  });

  it('keeps setTimeout promisifiable and restores the originals', async () => {
    const host = makeHost();
    const original = host.setTimeout;
    tracker = trackTimeouts(host);
    expect(host.setTimeout).not.toBe(original);
    await expect(promisify(host.setTimeout)(1, 'done')).resolves.toBe('done');
    tracker.restore();
    expect(host.setTimeout).toBe(original);
  });
});
