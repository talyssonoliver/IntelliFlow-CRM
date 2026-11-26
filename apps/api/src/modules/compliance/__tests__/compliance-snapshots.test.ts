import { describe, expect, it } from 'vitest';
import { recordSnapshot, readHistory, type SnapshotDb } from '../compliance-snapshots';
import { FRAMEWORK_IDS, type Overview } from '../compliance-evidence';

type Row = { frameworkId: string; score: number | null };

/** An in-memory store with real transaction semantics: writes are kept only if the callback resolves. */
function store(failOnFramework?: string) {
  let committed = new Map<string, Row>();
  const db: SnapshotDb = {
    complianceSnapshot: {
      upsert: async () => ({}),
      findMany: async () =>
        [...committed.values()].map((r) => ({
          ...r,
          day: new Date('2026-11-26T00:00:00Z'),
          passing: 0,
          attention: 0,
          notMeasured: 0,
        })),
    },
    $transaction: async (fn) => {
      const pending = new Map(committed);
      const result = await fn({
        complianceSnapshot: {
          upsert: async (args: unknown) => {
            const { create } = args as { create: Row };
            if (create.frameworkId === failOnFramework) throw new Error('write failed');
            pending.set(create.frameworkId, {
              frameworkId: create.frameworkId,
              score: create.score,
            });
            return {};
          },
        },
      });
      committed = pending;
      return result;
    },
  };
  return { db, rows: () => [...committed.values()] };
}

function overview(score: number): Overview {
  return {
    frameworks: FRAMEWORK_IDS.map((id) => ({
      id,
      score,
      counts: { passing: 1, attention: 0, notMeasured: 0 },
    })),
  } as unknown as Overview;
}

const NOW = new Date('2026-11-26T10:00:00Z');

describe('recordSnapshot atomicity', () => {
  it('stores every framework row, marker last, when all writes succeed', async () => {
    const s = store();
    expect(await recordSnapshot(s.db, 't1', overview(50), NOW)).toBe(FRAMEWORK_IDS.length);
    expect(s.rows().map((r) => r.frameworkId)).toEqual([...FRAMEWORK_IDS]);
    const history = await readHistory(s.db, 't1', 90, NOW);
    expect(Object.keys(history)).toHaveLength(FRAMEWORK_IDS.length);
  });

  it('keeps the previous snapshot whole when a refresh fails part-way', async () => {
    const seeded = store();
    await recordSnapshot(seeded.db, 't1', overview(50), NOW);
    const before = seeded.rows();
    const failOnThird = FRAMEWORK_IDS[2];
    const originalTx = seeded.db.$transaction.bind(seeded.db);
    seeded.db.$transaction = (fn) =>
      originalTx((tx) =>
        fn({
          complianceSnapshot: {
            upsert: (args: unknown) => {
              if ((args as { create: Row }).create.frameworkId === failOnThird) {
                return Promise.reject(new Error('write failed'));
              }
              return tx.complianceSnapshot.upsert(args);
            },
          },
        })
      );
    await expect(recordSnapshot(seeded.db, 't1', overview(99), NOW)).rejects.toThrow(
      'write failed'
    );
    expect(seeded.rows()).toEqual(before);
    expect(seeded.rows().every((r) => r.score === 50)).toBe(true);
  });

  it('does not write the marker when an earlier framework write fails', async () => {
    const s = store(FRAMEWORK_IDS[0]);
    await expect(recordSnapshot(s.db, 't1', overview(70), NOW)).rejects.toThrow();
    expect(s.rows().some((r) => r.frameworkId === FRAMEWORK_IDS[FRAMEWORK_IDS.length - 1])).toBe(
      false
    );
  });
});
