/**
 * PG-203 — LeadService.createLeadInTransaction (ADR-083).
 *
 * The public booking flow creates a lead inside its own advisory-locked
 * transaction, so it needs the aggregate save AND the LeadCreated outbox write
 * on the caller's transaction (ADR-011 zero-lost-events), with no duplicate
 * pre-check and no transaction of its own. createLead keeps its behaviour.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { RepositoryTransaction } from '@intelliflow/domain';
import { LeadService } from '../LeadService';
import { PersistenceError, ValidationError } from '../../errors';

const TX = { marker: 'caller-tx' } as unknown as RepositoryTransaction;

function setup() {
  const leadRepository: Record<string, any> = {
    save: vi.fn().mockResolvedValue(undefined),
    existsByEmailInTenant: vi.fn().mockResolvedValue(false),
  };
  const eventBus: Record<string, any> = { publishAll: vi.fn().mockResolvedValue(undefined) };
  const transactionManager: Record<string, any> = {
    run: vi.fn((work: (tx: RepositoryTransaction) => Promise<unknown>) => work(TX)),
  };
  const service = new LeadService(
    leadRepository as any,
    {} as any,
    {} as any,
    {} as any,
    eventBus as any,
    transactionManager as any
  );
  return { service, leadRepository, eventBus, transactionManager };
}

const props = {
  email: 'ada@example.invalid',
  firstName: 'Ada',
  lastName: 'Lovelace',
  source: 'BOOKING' as const,
  ownerId: 'host-1',
  tenantId: 'tenant-1',
};

describe('LeadService.createLeadInTransaction', () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it('saves the lead and publishes LeadCreated on the caller transaction', async () => {
    const result = await ctx.service.createLeadInTransaction(props, TX);
    expect(result.isSuccess).toBe(true);
    const lead = result.value;
    expect(lead.source).toBe('BOOKING');
    expect(lead.ownerId).toBe('host-1');
    expect(ctx.leadRepository.save).toHaveBeenCalledWith(lead, undefined, TX);
    expect(ctx.eventBus.publishAll).toHaveBeenCalledTimes(1);
    const [events, tx] = ctx.eventBus.publishAll.mock.calls[0];
    expect(tx).toBe(TX);
    expect(events.map((e: { eventType: string }) => e.eventType)).toContain('lead.created');
    expect(lead.getDomainEvents()).toHaveLength(0); // cleared after publishing
  });

  it('runs no duplicate pre-check and opens no transaction of its own', async () => {
    await ctx.service.createLeadInTransaction(props, TX);
    expect(ctx.leadRepository.existsByEmailInTenant).not.toHaveBeenCalled();
    expect(ctx.transactionManager.run).not.toHaveBeenCalled();
  });

  it('fails without saving when the domain rejects the input', async () => {
    const result = await ctx.service.createLeadInTransaction(
      { ...props, email: 'not-an-email' },
      TX
    );
    expect(result.isFailure).toBe(true);
    expect(ctx.leadRepository.save).not.toHaveBeenCalled();
    expect(ctx.eventBus.publishAll).not.toHaveBeenCalled();
  });

  it('propagates persistence failures so the caller transaction rolls back', async () => {
    ctx.eventBus.publishAll.mockRejectedValueOnce(new Error('outbox down'));
    await expect(ctx.service.createLeadInTransaction(props, TX)).rejects.toThrow('outbox down');
  });
});

describe('LeadService.createLead (regression after delegation)', () => {
  it('still rejects a duplicate email before any write', async () => {
    const ctx = setup();
    ctx.leadRepository.existsByEmailInTenant.mockResolvedValueOnce(true);
    const result = await ctx.service.createLead(props);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(ValidationError);
    expect(ctx.leadRepository.save).not.toHaveBeenCalled();
  });

  it('still persists and publishes inside its own transaction', async () => {
    const ctx = setup();
    const result = await ctx.service.createLead(props);
    expect(result.isSuccess).toBe(true);
    expect(ctx.transactionManager.run).toHaveBeenCalledTimes(1);
    expect(ctx.leadRepository.save).toHaveBeenCalledWith(result.value, undefined, TX);
    expect(ctx.eventBus.publishAll).toHaveBeenCalledWith(expect.any(Array), TX);
  });

  it('still maps a failed transaction to PersistenceError', async () => {
    const ctx = setup();
    ctx.leadRepository.save.mockRejectedValueOnce(new Error('db down'));
    const result = await ctx.service.createLead(props);
    expect(result.isFailure).toBe(true);
    expect(result.error).toBeInstanceOf(PersistenceError);
  });
});
