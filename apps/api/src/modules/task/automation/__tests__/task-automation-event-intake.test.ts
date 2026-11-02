/**
 * Task automation event intake (PG-208, ADR-084): buffers only, never throws,
 * and never makes the business write fail — even inside the publisher's call.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AccountCreatedEvent,
  AccountId,
  Email,
  LeadConvertedEvent,
  LeadCreatedEvent,
  LeadId,
  OpportunityId,
  OpportunityStageChangedEvent,
  TaskCreatedEvent,
  TaskId,
} from '@intelliflow/domain';
import { InMemoryEventBus } from '@intelliflow/adapters';
import {
  ConversionCorrelation,
  TaskAutomationEventBuffer,
  bufferTaskAutomationEvent,
  registerTaskAutomationEventIntake,
  type TaskAutomationIntake,
} from '../task-automation-event-intake';

const NOW = 1_800_000_000_000;

function intake(overrides: Partial<TaskAutomationIntake> = {}): TaskAutomationIntake {
  return {
    buffer: new TaskAutomationEventBuffer(),
    correlation: new ConversionCorrelation(),
    isWatched: () => true,
    now: () => NOW,
    ...overrides,
  };
}

const email = Email.create('ada@example.invalid').value;

describe('bufferTaskAutomationEvent', () => {
  it('buffers the record id from toPayload()', () => {
    const target = intake();
    const leadId = LeadId.generate();
    bufferTaskAutomationEvent(target, new LeadCreatedEvent(leadId, email, 'WEBSITE', 'owner-1'));
    const [buffered] = target.buffer.take(10);
    expect(buffered).toMatchObject({
      eventType: 'lead.created',
      recordId: leadId.value,
      firstSeenAt: null,
    });
    expect(typeof buffered.eventId).toBe('string');
  });

  it('keeps the new stage of a stage change', () => {
    const target = intake();
    const id = OpportunityId.generate();
    bufferTaskAutomationEvent(
      target,
      new OpportunityStageChangedEvent(id, 'PROSPECTING', 'PROPOSAL', 'owner-1')
    );
    expect(target.buffer.take(1)[0]).toMatchObject({ recordId: id.value, newStage: 'PROPOSAL' });
  });

  it('keeps a closing stage change when only won / lost rules are active', () => {
    const watched = new Set(['opportunity.won']);
    const target = intake({ isWatched: (type) => watched.has(type) });
    const id = OpportunityId.generate();
    bufferTaskAutomationEvent(
      target,
      new OpportunityStageChangedEvent(id, 'NEGOTIATION', 'CLOSED_WON', 'owner-1')
    );
    bufferTaskAutomationEvent(
      target,
      new OpportunityStageChangedEvent(id, 'NEGOTIATION', 'CLOSED_LOST', 'owner-1')
    );
    bufferTaskAutomationEvent(
      target,
      new OpportunityStageChangedEvent(id, 'PROSPECTING', 'PROPOSAL', 'owner-1')
    );
    expect(target.buffer.take(10).map((e) => e.newStage)).toEqual(['CLOSED_WON']);
  });

  it('remembers conversion-born contacts and accounts even when lead.converted is not watched', () => {
    const target = intake({ isWatched: () => false });
    bufferTaskAutomationEvent(
      target,
      new LeadConvertedEvent(LeadId.generate(), 'contact-1', 'account-1', 'owner-1')
    );
    expect(target.buffer.size).toBe(0);
    expect(target.correlation.has('contact-1', NOW)).toBe(true);
    expect(target.correlation.has('account-1', NOW)).toBe(true);
  });

  it('ignores unwatched types, task events and events without an id', () => {
    const target = intake({ isWatched: (type) => type !== 'account.created' });
    bufferTaskAutomationEvent(
      target,
      new AccountCreatedEvent(AccountId.generate(), 'Acme', 'owner-1')
    );
    bufferTaskAutomationEvent(
      target,
      new TaskCreatedEvent(TaskId.generate(), 'Call', 'MEDIUM', 'owner-1')
    );
    bufferTaskAutomationEvent(target, {
      eventType: 'lead.created',
      toPayload: () => ({ leadId: '' }),
    });
    expect(target.buffer.size).toBe(0);
  });

  it('never throws on a malformed event', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const target = intake();
    expect(() =>
      bufferTaskAutomationEvent(target, {
        eventType: 'lead.created',
        toPayload: () => {
          throw new Error('broken');
        },
      })
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('TaskAutomationEventBuffer', () => {
  const event = (n: number) => ({
    eventId: `e${n}`,
    eventType: 'lead.created',
    recordId: `r${n}`,
    contactId: null,
    accountId: null,
    newStage: null,
    occurredAt: n,
    firstSeenAt: null,
  });

  it('drops the oldest event when full and counts it', () => {
    const buffer = new TaskAutomationEventBuffer(2);
    buffer.push(event(1));
    buffer.push(event(2));
    buffer.push(event(3));
    expect(buffer.dropped).toBe(1);
    expect(buffer.take(5).map((e) => e.eventId)).toEqual(['e2', 'e3']);
  });

  it('requeues events at the front without exceeding capacity', () => {
    const buffer = new TaskAutomationEventBuffer(2);
    buffer.push(event(2));
    buffer.requeue([event(1)]);
    buffer.requeue([]);
    expect(buffer.take(5).map((e) => e.eventId)).toEqual(['e1', 'e2']);
  });
});

describe('ConversionCorrelation', () => {
  it('forgets ids after the TTL and on prune', () => {
    const correlation = new ConversionCorrelation(1000);
    correlation.add('c1', NOW);
    correlation.add(null, NOW);
    expect(correlation.has('c1', NOW + 999)).toBe(true);
    expect(correlation.has('c1', NOW + 1001)).toBe(false);
    correlation.add('c2', NOW);
    correlation.prune(NOW + 2000);
    expect(correlation.has('c2', NOW + 1)).toBe(false);
  });
});

describe('registerTaskAutomationEventIntake', () => {
  it('subscribes the nine v1 events and never task events', async () => {
    const subscribe = vi.fn().mockResolvedValue(undefined);
    await registerTaskAutomationEventIntake({ subscribe }, intake());
    const types = subscribe.mock.calls.map((call) => call[0]);
    expect(types).toHaveLength(9);
    expect(types.some((t: string) => t.startsWith('task.'))).toBe(false);
  });

  it('lets the business write succeed even when the buffer itself fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const bus = new InMemoryEventBus();
    const target = intake();
    vi.spyOn(target.buffer, 'push').mockImplementation(() => {
      throw new Error('buffer exploded');
    });
    await registerTaskAutomationEventIntake(bus, target);

    // Same shape as LeadService: save + publish inside one transaction callback.
    const transaction = async (work: () => Promise<void>) => work();
    await expect(
      transaction(async () => {
        await bus.publishAll([
          new LeadCreatedEvent(LeadId.generate(), email, 'WEBSITE', 'owner-1'),
        ]);
      })
    ).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
