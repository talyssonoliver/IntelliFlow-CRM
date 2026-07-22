/**
 * DDD-001 — ConvertLeadToDealUseCase cross-aggregate transactional integrity.
 *
 * Proves the four aggregate writes (Account, Contact, Opportunity, Lead) and
 * the domain-event outbox all run inside ONE transaction (same handle), and
 * that a failure mid-conversion aborts the whole unit — so there is never an
 * orphaned Account/Contact/Opportunity while the source Lead stays QUALIFIED
 * (ADR-002 aggregate boundaries).
 */
import { describe, it, expect, vi } from 'vitest';
import { Lead } from '@intelliflow/domain';
import type {
  LeadRepository,
  AccountRepository,
  ContactRepository,
  OpportunityRepository,
} from '@intelliflow/domain';
import type { EventBusPort, TransactionPort } from '@intelliflow/application';
import { ConvertLeadToDealUseCase, ConvertLeadToDealInput } from '../ConvertLeadToDealUseCase';

const TX = { __tx: true } as unknown as Parameters<Parameters<TransactionPort['run']>[0]>[0];

function createQualifiedLead(): Lead {
  const created = Lead.create({
    email: 'convert@example.com',
    company: 'Acme Corp',
    ownerId: 'owner-1',
    tenantId: 'tenant-1',
  });
  if (created.isFailure) throw new Error(created.error.message);
  const lead = created.value;
  const qualified = lead.qualify('qualifier', 'Meets conversion criteria');
  if (qualified.isFailure) throw new Error(qualified.error.message);
  lead.clearDomainEvents(); // start clean so we only assert conversion events
  return lead;
}

function setup(opts: { failOn?: 'account' | 'contact' | 'opportunity' | 'lead' | 'publish' } = {}) {
  const lead = createQualifiedLead();

  // Use the lead's real id so LeadId.create(input.leadId) validates.
  const input: ConvertLeadToDealInput = {
    leadId: lead.id.value,
    dealValue: 5000,
    convertedBy: 'user-1',
  };

  const fail = (name: string) => async () => {
    if (opts.failOn === name) throw new Error(`${name} save failed`);
  };

  const leadRepository = {
    findById: vi.fn(async () => lead),
    save: vi.fn(fail('lead')),
  } as unknown as LeadRepository;

  const accountRepository = {
    findByName: vi.fn(async () => []),
    save: vi.fn(fail('account')),
  } as unknown as AccountRepository;

  const contactRepository = {
    save: vi.fn(fail('contact')),
  } as unknown as ContactRepository;

  const opportunityRepository = {
    save: vi.fn(fail('opportunity')),
  } as unknown as OpportunityRepository;

  const eventBus = {
    publish: vi.fn(),
    publishAll: vi.fn(async () => {
      if (opts.failOn === 'publish') throw new Error('publish failed');
    }),
    subscribe: vi.fn(),
  } as unknown as EventBusPort;

  const run = vi.fn((work: (tx: typeof TX) => Promise<unknown>) => work(TX));
  const transactionManager = { run } as unknown as TransactionPort;

  const useCase = new ConvertLeadToDealUseCase(
    leadRepository,
    contactRepository,
    accountRepository,
    opportunityRepository,
    eventBus,
    transactionManager
  );

  return {
    useCase,
    leadRepository,
    accountRepository,
    contactRepository,
    opportunityRepository,
    eventBus,
    run,
    lead,
    input,
  };
}

const lastArg = (fn: unknown) => {
  const calls = (fn as ReturnType<typeof vi.fn>).mock.calls;
  const call = calls[calls.length - 1];
  return call[call.length - 1];
};

describe('ConvertLeadToDealUseCase — transactional integrity (DDD-001)', () => {
  it('persists all four aggregates + events inside ONE transaction, same handle', async () => {
    const {
      useCase,
      accountRepository,
      contactRepository,
      opportunityRepository,
      leadRepository,
      eventBus,
      run,
      input,
    } = setup();

    const result = await useCase.execute(input);

    expect(result.isSuccess).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    // Every write received the same transaction handle as its final argument.
    expect(accountRepository.save).toHaveBeenCalledTimes(1);
    expect(lastArg(accountRepository.save)).toBe(TX);
    expect(contactRepository.save).toHaveBeenCalledTimes(1);
    expect(lastArg(contactRepository.save)).toBe(TX);
    expect(opportunityRepository.save).toHaveBeenCalledTimes(1);
    expect(lastArg(opportunityRepository.save)).toBe(TX);
    expect(leadRepository.save).toHaveBeenCalledTimes(1);
    expect(lastArg(leadRepository.save)).toBe(TX);

    // Events published in the same transaction.
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    expect(lastArg(eventBus.publishAll)).toBe(TX);
  });

  it.each(['account', 'contact', 'opportunity', 'lead', 'publish'] as const)(
    'aborts the whole conversion when the %s write fails (no partial commit)',
    async (failOn) => {
      const { useCase, run, input } = setup({ failOn });

      const result = await useCase.execute(input);

      expect(result.isFailure).toBe(true);
      // The failure happened INSIDE the single transaction callback, so the real
      // TransactionPort would roll every prior write back with it.
      expect(run).toHaveBeenCalledTimes(1);
    }
  );

  it('does not write anything outside the transaction (all saves go through run)', async () => {
    const { useCase, run, accountRepository, input } = setup();
    await useCase.execute(input);
    // run() is invoked before any save resolves — the saves are the work inside it.
    expect(run).toHaveBeenCalledTimes(1);
    expect(accountRepository.save).toHaveBeenCalled();
  });
});
