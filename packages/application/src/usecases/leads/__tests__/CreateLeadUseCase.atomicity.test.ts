/**
 * DDD-002 — CreateLeadUseCase transactional integrity.
 *
 * Proves the aggregate save and the domain-event outbox write share ONE
 * transaction (same handle threaded to both) and that an event-publish failure
 * now PROPAGATES (the old swallow-and-log is gone), so a persisted lead can
 * never exist without its LeadCreated event (ADR-011 zero-lost-events).
 */
import { describe, it, expect, vi } from 'vitest';
import { CreateLeadUseCase, CreateLeadInput } from '../CreateLeadUseCase';
import type { LeadRepository } from '@intelliflow/domain';
import type { EventBusPort, TransactionPort } from '@intelliflow/application';

// Opaque sentinel transaction handle threaded by the fake TransactionPort.
const TX = { __tx: true } as unknown as Parameters<Parameters<TransactionPort['run']>[0]>[0];

const validInput: CreateLeadInput = { email: 'atomic@example.com', ownerId: 'owner-1' };

function setup(opts: { failSave?: boolean; failPublish?: boolean } = {}) {
  const leadRepository = {
    save: vi.fn(async () => {
      if (opts.failSave) throw new Error('save failed');
    }),
  } as unknown as LeadRepository;

  const eventBus = {
    publish: vi.fn(),
    publishAll: vi.fn(async () => {
      if (opts.failPublish) throw new Error('publish failed');
    }),
    subscribe: vi.fn(),
  } as unknown as EventBusPort;

  // Fake unit-of-work: runs the callback with the sentinel tx and lets any
  // thrown error propagate (mirrors a real transaction rolling back).
  const run = vi.fn((work: (tx: typeof TX) => Promise<unknown>) => work(TX));
  const transactionManager = { run } as unknown as TransactionPort;

  const useCase = new CreateLeadUseCase(leadRepository, eventBus, transactionManager);
  return { useCase, leadRepository, eventBus, run };
}

describe('CreateLeadUseCase — transactional integrity (DDD-002)', () => {
  it('saves the lead and publishes its events inside ONE transaction, same handle', async () => {
    const { useCase, leadRepository, eventBus, run } = setup();

    const result = await useCase.execute(validInput);

    expect(result.isSuccess).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);

    // save(lead, opts, tx) — the 3rd arg is the shared transaction handle
    expect(leadRepository.save).toHaveBeenCalledTimes(1);
    const saveArgs = (leadRepository.save as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(saveArgs[2]).toBe(TX);

    // publishAll(events, tx) — same handle, at least the LeadCreated event
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
    const pubArgs = (eventBus.publishAll as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pubArgs[1]).toBe(TX);
    expect(pubArgs[0].length).toBeGreaterThan(0);
  });

  it('FAILS (no swallow) when event publish throws — save rolls back with it', async () => {
    const { useCase, eventBus, leadRepository } = setup({ failPublish: true });

    const result = await useCase.execute(validInput);

    expect(result.isFailure).toBe(true);
    // Both ran inside the same transaction; the throw aborts the whole unit.
    expect(leadRepository.save).toHaveBeenCalledTimes(1);
    expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
  });

  it('FAILS when the aggregate save throws, without publishing any event', async () => {
    const { useCase, eventBus } = setup({ failSave: true });

    const result = await useCase.execute(validInput);

    expect(result.isFailure).toBe(true);
    expect(eventBus.publishAll).not.toHaveBeenCalled();
  });
});
