/**
 * PG-203 DSAR — a processing restriction stops AI scoring (owner Q18; spec D-AC-08).
 *
 * LeadService.scoreLead checks the restriction port before calling the AI service; the bulk
 * path goes through scoreLead. Services built without the port behave as before.
 */
import { describe, it, expect, vi } from 'vitest';
import { Lead, LeadIdentityChangedError, ProcessingRestrictedError } from '@intelliflow/domain';
import { LeadService } from '../LeadService';
import type { ProcessingRestrictionPort } from '../../ports/repositories/ProcessingRestrictionPort';

function makeLead() {
  const created = Lead.create({
    email: 'Ada@Example.invalid',
    firstName: 'Ada',
    lastName: 'Lovelace',
    source: 'WEBSITE',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
  });
  if (created.isFailure) throw created.error;
  return created.value;
}

function setup(restricted: boolean | undefined) {
  const lead = makeLead();
  const leadRepository: Record<string, any> = {
    findById: vi.fn().mockResolvedValue(lead),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const aiService: Record<string, any> = {
    scoreLead: vi.fn().mockResolvedValue({
      isFailure: true,
      isSuccess: false,
      error: new Error('stop after the AI call'),
    }),
  };
  const restrictions: Pick<ProcessingRestrictionPort, 'status' | 'followEmail'> = {
    status: vi
      .fn()
      .mockResolvedValue({ restricted: !!restricted, blocksMarketing: false, since: null }),
    followEmail: vi.fn(),
  };
  const args = [
    leadRepository as any,
    {} as any,
    {} as any,
    aiService as any,
    { publishAll: vi.fn() } as any,
    { run: vi.fn() } as any,
  ] as const;
  const service =
    restricted === undefined ? new LeadService(...args) : new LeadService(...args, restrictions);
  return { service, lead, aiService, restrictions };
}

describe('LeadService.scoreLead and processing restrictions', () => {
  it('refuses to score a restricted person without calling the AI service', async () => {
    const { service, lead, aiService, restrictions } = setup(true);
    const result = await service.scoreLead(lead.id.value);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ProcessingRestrictedError);
    expect(restrictions.status).toHaveBeenCalledWith('tenant-1', 'ada@example.invalid');
    expect(aiService.scoreLead).not.toHaveBeenCalled();
  });

  it('scores as before when the person is not restricted', async () => {
    const { service, lead, aiService } = setup(false);
    await service.scoreLead(lead.id.value);
    expect(aiService.scoreLead).toHaveBeenCalledTimes(1);
  });

  it('defaults to never restricted when built without the port (existing call sites)', async () => {
    const { service, lead, aiService } = setup(undefined);
    await service.scoreLead(lead.id.value);
    expect(aiService.scoreLead).toHaveBeenCalledTimes(1);
  });

  it('bulk scoring reports a restricted lead as failed and calls no AI for it', async () => {
    const { service, lead, aiService } = setup(true);
    const result = await service.bulkScoreLeads([lead.id.value]);
    expect(aiService.scoreLead).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).toContain('Processing is restricted for this person');
  });

  it('discards a result when the person was restricted during the AI call (codex)', async () => {
    const { service, lead, aiService, restrictions } = setup(false);
    const repo = (service as unknown as { leadRepository: Record<string, any> }).leadRepository;
    const tx = {};
    const publishAll = vi.fn();
    Object.assign(service as unknown as Record<string, unknown>, {
      transactionManager: { run: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) },
    });
    (service as unknown as { eventBus: { publishAll: unknown } }).eventBus.publishAll = publishAll;
    aiService.scoreLead.mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      value: { score: 70, confidence: 0.9, modelVersion: 'v1' },
    });
    (restrictions.status as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ restricted: false, blocksMarketing: false, since: null })
      .mockResolvedValueOnce({ restricted: true, blocksMarketing: false, since: new Date() });
    const result = await service.scoreLead(lead.id.value);
    expect(result.error).toBeInstanceOf(ProcessingRestrictedError);
    // The second check joins the write's transaction (and so takes the address lock there)
    // after the score-only write has locked the lead row (the worker's lock order, codex);
    // a restricted result throws, so that write rolls back and nothing is published.
    expect(restrictions.status).toHaveBeenLastCalledWith('tenant-1', 'ada@example.invalid', tx);
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.anything(),
      { scoreOnlyIfEmail: 'ada@example.invalid' },
      tx
    );
    expect(repo.save.mock.invocationCallOrder[0]).toBeLessThan(
      (restrictions.status as ReturnType<typeof vi.fn>).mock.invocationCallOrder[1]
    );
    expect(publishAll).not.toHaveBeenCalled();
  });

  it('writes only the score, and only for the email it scored; an erasure meanwhile wins (codex)', async () => {
    const { service, lead, aiService } = setup(false);
    const repo = (service as unknown as { leadRepository: Record<string, any> }).leadRepository;
    const tx = {};
    (service as unknown as { transactionManager: { run: unknown } }).transactionManager.run = vi.fn(
      async (fn: (t: unknown) => Promise<unknown>) => fn(tx)
    );
    aiService.scoreLead.mockResolvedValue({
      isFailure: false,
      isSuccess: true,
      value: { score: 50, confidence: 0.9, modelVersion: 'v1' },
    });
    repo.save.mockRejectedValueOnce(new LeadIdentityChangedError(lead.id.value));
    const result = await service.scoreLead(lead.id.value);
    expect(result.isFailure).toBe(true);
    expect(result.error.message).toContain('changed while it was being scored');
    expect(repo.save).toHaveBeenCalledWith(
      expect.anything(),
      { scoreOnlyIfEmail: 'ada@example.invalid' },
      tx
    );
    // The full snapshot (names, phone, company...) is never written by scoring.
    expect(repo.save.mock.calls.every((c: unknown[]) => c[1] !== undefined)).toBe(true);
  });

  it('never scores an erased lead, even with no restriction recorded (codex)', async () => {
    const erased = Lead.create({
      email: 'erased-l1@erased.invalid',
      source: 'WEBSITE',
      ownerId: 'owner-1',
      tenantId: 'tenant-1',
    });
    if (erased.isFailure) throw erased.error;
    const { service, aiService } = setup(undefined);
    const repo = (service as unknown as { leadRepository: Record<string, any> }).leadRepository;
    repo.findById.mockResolvedValue(erased.value);
    const result = await service.scoreLead(erased.value.id.value);
    expect(result.error).toBeInstanceOf(ProcessingRestrictedError);
    expect(aiService.scoreLead).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
