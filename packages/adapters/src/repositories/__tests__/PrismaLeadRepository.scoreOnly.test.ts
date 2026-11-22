/**
 * PG-203 DSAR — a scoring result is written only for the person it was computed for.
 *
 * `save(lead, { scoreOnlyIfEmail })` writes the score alone, and only while the persisted
 * email still matches, so a result returning after an erasure cannot restore personal data.
 */
import { describe, it, expect, vi } from 'vitest';
import { Lead, LeadIdentityChangedError } from '@intelliflow/domain';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaLeadRepository } from '../PrismaLeadRepository';

function lead() {
  const created = Lead.create({
    email: 'ada@example.invalid',
    firstName: 'Ada',
    source: 'WEBSITE',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
  } as never);
  if (created.isFailure) throw created.error;
  return created.value;
}

describe('PrismaLeadRepository.save scoreOnlyIfEmail', () => {
  it('updates only the score fields, matching the normalised email (codex)', async () => {
    const $executeRaw = vi.fn().mockResolvedValue(1);
    const upsert = vi.fn();
    const repo = new PrismaLeadRepository({
      $executeRaw,
      lead: { upsert },
    } as unknown as PrismaClient);
    const l = lead();
    l.updateScore(64, 0.55, 'model-1');
    await repo.save(l, { scoreOnlyIfEmail: ' ADA@example.invalid ' });
    expect(upsert).not.toHaveBeenCalled();
    const sql = ($executeRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toMatch(
      /UPDATE leads SET score = \?, "updatedAt" = \?,\s+"scoringStatus" = \?::"LeadScoringStatus", "scoredAt" = \?,\s+"scoreConfidence" = \?\s/
    );
    // A stored " Ada@Example.invalid " matches the address the lead was read with.
    expect(sql).toContain('AND dsar_normalise_email(email) = ?');
    expect($executeRaw.mock.calls[0]!.slice(1)).toEqual([
      l.score.value,
      l.updatedAt,
      'SCORED',
      l.updatedAt,
      // Stored beside the score (register #49).
      0.55,
      l.id.value,
      'tenant-1',
      'ada@example.invalid',
    ]);
  });

  it('stores the confidence of a low-confidence score as it is, not rounded up to 1', async () => {
    const $executeRaw = vi.fn().mockResolvedValue(1);
    const repo = new PrismaLeadRepository({ $executeRaw } as unknown as PrismaClient);
    const l = lead();
    l.updateScore(12, 0.4, 'model-1');
    await repo.save(l, { scoreOnlyIfEmail: 'ada@example.invalid', scoringStatus: 'NEEDS_REVIEW' });
    const values = $executeRaw.mock.calls[0]!.slice(1);
    expect(values[0]).toBe(12);
    expect(values[2]).toBe('NEEDS_REVIEW');
    expect(values[4]).toBe(0.4);
  });

  it('throws LeadIdentityChangedError when the email no longer matches (erased meanwhile)', async () => {
    const repo = new PrismaLeadRepository({
      $executeRaw: vi.fn().mockResolvedValue(0),
    } as unknown as PrismaClient);
    await expect(
      repo.save(lead(), { scoreOnlyIfEmail: 'ada@example.invalid' })
    ).rejects.toBeInstanceOf(LeadIdentityChangedError);
  });
});

describe('PrismaLeadRepository.markScoringFailed (#1218)', () => {
  it('marks FAILED only while the email and updatedAt are still the ones read (codex)', async () => {
    const $executeRaw = vi.fn().mockResolvedValue(1);
    const updateMany = vi.fn();
    const repo = new PrismaLeadRepository({
      $executeRaw,
      lead: { updateMany },
    } as unknown as PrismaClient);
    const l = lead();
    const readAt = new Date('2026-11-07T00:00:00.000Z');

    await repo.markScoringFailed(l.id, 'tenant-1', {
      email: ' ADA@example.invalid ',
      updatedAt: readAt,
    });

    expect(updateMany).not.toHaveBeenCalled();
    const sql = ($executeRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toMatch(/UPDATE leads SET "scoringStatus" = 'FAILED'::"LeadScoringStatus"\s+WHERE/);
    // Neither the score, the status nor updatedAt is written.
    expect(sql).not.toMatch(/score =|"status"|"updatedAt" = \?,/);
    expect(sql).toContain('AND dsar_normalise_email(email) = ?');
    expect(sql).toContain('AND "updatedAt" = ?');
    expect($executeRaw.mock.calls[0]!.slice(1)).toEqual([
      l.id.value,
      'tenant-1',
      'ada@example.invalid',
      readAt,
    ]);
  });

  it('does nothing and does not throw when a newer write changed the row', async () => {
    const repo = new PrismaLeadRepository({
      $executeRaw: vi.fn().mockResolvedValue(0),
    } as unknown as PrismaClient);
    const l = lead();
    await expect(
      repo.markScoringFailed(l.id, 'tenant-1', {
        email: 'ada@example.invalid',
        updatedAt: new Date(),
      })
    ).resolves.toBeUndefined();
  });
});

describe('PrismaLeadRepository reads the stored score confidence (register #49)', () => {
  const record = (scoreConfidence: number | null) => ({
    id: '11111111-1111-4111-8111-111111111111',
    email: 'ada@example.invalid',
    firstName: 'Ada',
    lastName: null,
    company: null,
    title: null,
    phone: null,
    source: 'WEBSITE',
    status: 'NEW',
    score: 20,
    scoreConfidence,
    location: null,
    website: null,
    avatarUrl: null,
    estimatedValue: null,
    lastContactedAt: null,
    tags: [],
    budget: null,
    authority: null,
    need: null,
    timeline: null,
    annualRevenue: null,
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    updatedAt: new Date('2026-11-02T00:00:00.000Z'),
  });
  const readWith = async (scoreConfidence: number | null) => {
    const findUnique = vi.fn().mockResolvedValue(record(scoreConfidence));
    const repo = new PrismaLeadRepository({ lead: { findUnique } } as unknown as PrismaClient);
    const found = await repo.findById({ value: '11111111-1111-4111-8111-111111111111' } as never);
    expect(found).not.toBeNull();
    return found!;
  };

  it('hands the stored confidence to the lead', async () => {
    expect((await readWith(0.4)).score.confidence).toBe(0.4);
  });

  it('treats a lead scored before the column existed (NULL) as confidence 1', async () => {
    expect((await readWith(null)).score.confidence).toBe(1);
  });
});
