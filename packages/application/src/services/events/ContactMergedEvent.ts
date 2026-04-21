import { DomainEvent } from '@intelliflow/domain';

const FIELDS_UPDATED_CAP = 50;

export interface ContactMergedEventPayload {
  primaryId: string;
  mergedContactId: string;
  tenantId: string;
  mergedBy: string;
  mergedAt: Date;
  fieldsUpdated: string[];
  truncated?: boolean;
}

export class ContactMergedEvent extends DomainEvent {
  static readonly EVENT_TYPE = 'contact.merged';
  readonly eventType = ContactMergedEvent.EVENT_TYPE;

  public readonly payload: ContactMergedEventPayload;

  constructor(input: ContactMergedEventPayload) {
    super();
    const fields = input.fieldsUpdated ?? [];
    const truncated = fields.length > FIELDS_UPDATED_CAP;
    this.payload = {
      primaryId: input.primaryId,
      mergedContactId: input.mergedContactId,
      tenantId: input.tenantId,
      mergedBy: input.mergedBy,
      mergedAt: input.mergedAt,
      fieldsUpdated: truncated ? fields.slice(0, FIELDS_UPDATED_CAP) : fields,
      ...(truncated ? { truncated: true } : {}),
    };
  }

  toPayload(): Record<string, unknown> {
    return {
      primaryId: this.payload.primaryId,
      mergedContactId: this.payload.mergedContactId,
      tenantId: this.payload.tenantId,
      mergedBy: this.payload.mergedBy,
      mergedAt: this.payload.mergedAt.toISOString(),
      fieldsUpdated: this.payload.fieldsUpdated,
      ...(this.payload.truncated ? { truncated: true } : {}),
    };
  }

  toJSON(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      occurredAt: this.occurredAt.toISOString(),
      payload: this.toPayload(),
    };
  }
}
