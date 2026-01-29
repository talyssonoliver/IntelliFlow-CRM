/**
 * LeadConversionAudit Entity
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Tracks lead-to-contact conversion for audit purposes.
 * Includes idempotency support and complete conversion snapshot.
 */

import { Entity } from '../../shared/Entity';

/**
 * Properties for LeadConversionAudit
 */
export interface LeadConversionAuditProps {
  /** Original lead ID */
  leadId: string;
  /** Created contact ID */
  contactId: string;
  /** Associated account ID (if any) */
  accountId: string | null;
  /** Tenant ID for multi-tenancy */
  tenantId: string;
  /** User who performed the conversion */
  convertedBy: string;
  /** Complete snapshot of lead data at conversion time */
  conversionSnapshot: Record<string, unknown>;
  /** Idempotency key to prevent duplicate conversions */
  idempotencyKey: string;
  /** When the conversion occurred */
  createdAt: Date;
}

/**
 * Input for creating a new audit record
 */
export interface CreateLeadConversionAuditInput {
  leadId: string;
  contactId: string;
  accountId: string | null;
  tenantId: string;
  convertedBy: string;
  conversionSnapshot: Record<string, unknown>;
  idempotencyKey?: string;
}

/**
 * LeadConversionAudit Entity
 *
 * Immutable audit record for lead-to-contact conversions.
 * Provides idempotency and complete audit trail.
 */
export class LeadConversionAudit extends Entity<string> {
  private readonly props: LeadConversionAuditProps;

  private constructor(id: string, props: LeadConversionAuditProps) {
    super(id);
    this.props = props;
  }

  /**
   * Create a new audit record
   */
  static create(input: CreateLeadConversionAuditInput): LeadConversionAudit {
    const id = crypto.randomUUID();
    const idempotencyKey = input.idempotencyKey ?? `${input.leadId}:${input.convertedBy}`;

    return new LeadConversionAudit(id, {
      leadId: input.leadId,
      contactId: input.contactId,
      accountId: input.accountId,
      tenantId: input.tenantId,
      convertedBy: input.convertedBy,
      conversionSnapshot: input.conversionSnapshot,
      idempotencyKey,
      createdAt: new Date(),
    });
  }

  /**
   * Reconstitute from persistence
   */
  static reconstitute(id: string, props: LeadConversionAuditProps): LeadConversionAudit {
    return new LeadConversionAudit(id, props);
  }

  // Getters
  get leadId(): string {
    return this.props.leadId;
  }

  get contactId(): string {
    return this.props.contactId;
  }

  get accountId(): string | null {
    return this.props.accountId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get convertedBy(): string {
    return this.props.convertedBy;
  }

  get conversionSnapshot(): Record<string, unknown> {
    return this.props.conversionSnapshot;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  /**
   * Convert to output format for use case response
   */
  toOutput(): {
    leadId: string;
    contactId: string;
    accountId: string | null;
    leadStatus: string;
    convertedBy: string;
    convertedAt: Date;
    conversionSnapshot: Record<string, unknown>;
  } {
    return {
      leadId: this.leadId,
      contactId: this.contactId,
      accountId: this.accountId,
      leadStatus: 'CONVERTED',
      convertedBy: this.convertedBy,
      convertedAt: this.createdAt,
      conversionSnapshot: this.conversionSnapshot,
    };
  }

  /**
   * Serialize for persistence
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      leadId: this.leadId,
      contactId: this.contactId,
      accountId: this.accountId,
      tenantId: this.tenantId,
      convertedBy: this.convertedBy,
      conversionSnapshot: this.conversionSnapshot,
      idempotencyKey: this.idempotencyKey,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

/**
 * Repository interface for LeadConversionAudit
 */
export interface LeadConversionAuditRepository {
  /**
   * Save an audit record
   * @param audit The audit record to save
   * @param tx Optional transaction context
   */
  save(audit: LeadConversionAudit, tx?: unknown): Promise<void>;

  /**
   * Find audit record by idempotency key
   * Returns null if no matching record exists
   */
  findByIdempotencyKey(key: string): Promise<LeadConversionAudit | null>;

  /**
   * Find audit record by lead ID and tenant
   */
  findByLeadId(leadId: string, tenantId: string): Promise<LeadConversionAudit | null>;
}
