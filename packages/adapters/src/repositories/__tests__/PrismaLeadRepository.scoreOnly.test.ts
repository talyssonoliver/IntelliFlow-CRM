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
  it('updates only score and updatedAt, matching the normalised email (codex)', async () => {
    const $executeRaw = vi.fn().mockResolvedValue(1);
    const upsert = vi.fn();
    const repo = new PrismaLeadRepository({
      $executeRaw,
      lead: { upsert },
    } as unknown as PrismaClient);
    const l = lead();
    await repo.save(l, { scoreOnlyIfEmail: ' ADA@example.invalid ' });
    expect(upsert).not.toHaveBeenCalled();
    const sql = ($executeRaw.mock.calls[0]![0] as string[]).join('?');
    expect(sql).toMatch(/UPDATE leads SET score = \?, "updatedAt" = \?\s/);
    // A stored " Ada@Example.invalid " matches the address the lead was read with.
    expect(sql).toContain('AND dsar_normalise_email(email) = ?');
    expect($executeRaw.mock.calls[0]!.slice(1)).toEqual([
      l.score.value,
      l.updatedAt,
      l.id.value,
      'tenant-1',
      'ada@example.invalid',
    ]);
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
