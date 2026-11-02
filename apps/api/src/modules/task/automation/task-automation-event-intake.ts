/**
 * Task automation event intake — PG-208 (ADR-084, owner ruling 2).
 *
 * Subscribes to the API's in-process event bus for the v1 trigger events. The
 * handler runs inside the publisher's call (LeadService publishes inside its
 * database transaction and lets handler errors propagate), so it NEVER throws
 * and NEVER awaits I/O: it copies the ids it needs from `toPayload()` into a
 * bounded in-memory buffer that the runner drains. Only event types with at
 * least one active rule are buffered (the runner refreshes that set each tick),
 * so one tenant's bulk activity cannot crowd out the buffer for nothing.
 */

import {
  effectiveTaskAutomationEvent,
  TASK_AUTOMATION_EVENT_TYPES,
  TASK_AUTOMATION_LIMITS,
  getTaskAutomationEvent,
} from '@intelliflow/domain';
import type { EventBusPort } from '@intelliflow/application';

export interface BufferedTaskAutomationEvent {
  eventId: string;
  eventType: string;
  recordId: string;
  /** lead.converted: the new contact / account (owner rulings 5 and 7). */
  contactId: string | null;
  accountId: string | null;
  /** opportunity.stage_changed: the stage moved to. */
  newStage: string | null;
  occurredAt: number;
  /** When the drain first saw it (missing-record grace). */
  firstSeenAt: number | null;
}

/** Bounded FIFO; on overflow the oldest event is dropped and counted. */
export class TaskAutomationEventBuffer {
  private items: BufferedTaskAutomationEvent[] = [];
  private droppedCount = 0;

  constructor(private readonly capacity: number = TASK_AUTOMATION_LIMITS.eventBufferCap) {}

  push(event: BufferedTaskAutomationEvent): void {
    if (this.items.length >= this.capacity) {
      this.items.shift();
      this.droppedCount++;
    }
    this.items.push(event);
  }

  /** Remove and return up to `max` events, oldest first. */
  take(max: number): BufferedTaskAutomationEvent[] {
    return this.items.splice(0, max);
  }

  /** Put events back at the front (record not committed yet). */
  requeue(events: BufferedTaskAutomationEvent[]): void {
    if (events.length === 0) return;
    this.items = [...events, ...this.items].slice(0, this.capacity);
  }

  get size(): number {
    return this.items.length;
  }

  get dropped(): number {
    return this.droppedCount;
  }
}

/**
 * Ids of contacts / accounts created by a lead conversion, remembered for a
 * while: their `contact.created` / `account.created` events never fire rules
 * (owner ruling 7). In memory, so a restart forgets them (ADR-084 accepted risk;
 * contacts are also recognised by `contacts.leadId`).
 */
export class ConversionCorrelation {
  private readonly ids = new Map<string, number>();

  constructor(private readonly ttlMs: number = TASK_AUTOMATION_LIMITS.conversionCorrelationMs) {}

  add(id: string | null | undefined, now: number): void {
    if (id) this.ids.set(id, now + this.ttlMs);
  }

  has(id: string, now: number): boolean {
    const until = this.ids.get(id);
    if (until === undefined) return false;
    if (until < now) {
      this.ids.delete(id);
      return false;
    }
    return true;
  }

  prune(now: number): void {
    for (const [id, until] of this.ids) if (until < now) this.ids.delete(id);
  }
}

interface PublishedEvent {
  eventId?: string;
  eventType: string;
  occurredAt?: Date;
  toPayload?: () => Record<string, unknown>;
}

/** The part of the application event bus the intake needs. */
export type EventSubscriber = Pick<EventBusPort, 'subscribe'>;

function asString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export interface TaskAutomationIntake {
  buffer: TaskAutomationEventBuffer;
  correlation: ConversionCorrelation;
  /** Called by the handler; event types outside the set are ignored. */
  isWatched: (eventType: string) => boolean;
  now?: () => number;
}

/**
 * A deal closed through a stage change publishes only `opportunity.stage_changed`;
 * the engine runs it as won / lost, so a won- or lost-only rule must keep it too.
 */
function isWatchedEvent(
  intake: TaskAutomationIntake,
  eventType: string,
  newStage: string | null
): boolean {
  if (intake.isWatched(eventType)) return true;
  const effective = effectiveTaskAutomationEvent(eventType, newStage);
  return effective !== null && effective !== eventType && intake.isWatched(effective);
}

/** Map one published domain event into the buffer. Never throws. */
export function bufferTaskAutomationEvent(
  intake: TaskAutomationIntake,
  event: PublishedEvent
): void {
  try {
    const definition = getTaskAutomationEvent(event.eventType);
    if (!definition) return;
    const payload = event.toPayload?.() ?? {};
    const now = intake.now?.() ?? Date.now();
    if (event.eventType === 'lead.converted') {
      intake.correlation.add(asString(payload.contactId), now);
      intake.correlation.add(asString(payload.accountId), now);
    }
    if (!isWatchedEvent(intake, event.eventType, asString(payload.newStage))) return;
    const recordId = asString(payload[definition.idField]);
    if (!recordId) return;
    intake.buffer.push({
      eventId: asString(event.eventId) ?? `${event.eventType}:${recordId}:${now}`,
      eventType: event.eventType,
      recordId,
      contactId: asString(payload.contactId),
      accountId: asString(payload.accountId),
      newStage: asString(payload.newStage),
      occurredAt: event.occurredAt instanceof Date ? event.occurredAt.getTime() : now,
      firstSeenAt: null,
    });
  } catch (err) {
    console.warn(
      '[task-automation] intake skipped an event:',
      err instanceof Error ? err.message : err
    );
  }
}

/** Subscribe every v1 trigger event (task events are never triggers — owner ruling 4). */
export async function registerTaskAutomationEventIntake(
  eventBus: EventSubscriber,
  intake: TaskAutomationIntake
): Promise<void> {
  for (const eventType of TASK_AUTOMATION_EVENT_TYPES) {
    await eventBus.subscribe(eventType, async (event) => {
      bufferTaskAutomationEvent(intake, event);
    });
  }
}
