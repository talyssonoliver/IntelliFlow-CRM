/**
 * ConversionSnapshot Value Object
 *
 * FLOW-006: Lead to Contact Conversion Logic
 * Task: IFC-061
 *
 * Captures a complete snapshot of lead data at the moment of conversion.
 * This is used for:
 * - Audit trail (what data existed when conversion happened)
 * - Data integrity verification
 * - Historical reference
 */

import { Lead, LeadSource, ValueObject } from '@intelliflow/domain';

/**
 * Properties captured in the conversion snapshot
 */
export interface ConversionSnapshotProps {
  /** Original lead ID */
  leadId: string;
  /** Lead email at conversion time */
  email: string;
  /** Lead first name (null if not provided) */
  firstName: string | null;
  /** Lead last name (null if not provided) */
  lastName: string | null;
  /** Lead company (null if not provided) */
  company: string | null;
  /** Lead title (null if not provided) */
  title: string | null;
  /** Lead phone (null if not provided) */
  phone: string | null;
  /** Lead source */
  source: LeadSource;
  /** Lead score value at conversion */
  scoreValue: number;
  /** Lead score confidence at conversion */
  scoreConfidence: number;
  /** Tenant ID for multi-tenancy */
  tenantId: string;
  /** Owner ID */
  ownerId: string;
  /** Timestamp when snapshot was captured */
  capturedAt: Date;
}

/**
 * ConversionSnapshot Value Object
 *
 * Immutable snapshot of lead data at conversion time.
 * Used for audit purposes and data integrity verification.
 */
export class ConversionSnapshot extends ValueObject<ConversionSnapshotProps> {
  /**
   * Create a snapshot from a Lead aggregate
   * Captures all relevant lead data at this moment in time
   */
  static fromLead(lead: Lead): ConversionSnapshot {
    return new ConversionSnapshot({
      leadId: lead.id.value,
      email: lead.email.value,
      firstName: lead.firstName ?? null,
      lastName: lead.lastName ?? null,
      company: lead.company ?? null,
      title: lead.title ?? null,
      phone: lead.phone?.toValue() ?? null,
      source: lead.source,
      scoreValue: lead.score.value,
      scoreConfidence: lead.score.confidence,
      tenantId: lead.tenantId,
      ownerId: lead.ownerId,
      capturedAt: new Date(),
    });
  }

  // Getters for each property
  get leadId(): string {
    return this.props.leadId;
  }

  get email(): string {
    return this.props.email;
  }

  get firstName(): string | null {
    return this.props.firstName;
  }

  get lastName(): string | null {
    return this.props.lastName;
  }

  get company(): string | null {
    return this.props.company;
  }

  get title(): string | null {
    return this.props.title;
  }

  get phone(): string | null {
    return this.props.phone;
  }

  get source(): LeadSource {
    return this.props.source;
  }

  get scoreValue(): number {
    return this.props.scoreValue;
  }

  get scoreConfidence(): number {
    return this.props.scoreConfidence;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get capturedAt(): Date {
    return this.props.capturedAt;
  }

  /**
   * Serialize to plain object for storage (JSONB)
   */
  toValue(): Record<string, unknown> {
    return {
      leadId: this.props.leadId,
      email: this.props.email,
      firstName: this.props.firstName,
      lastName: this.props.lastName,
      company: this.props.company,
      title: this.props.title,
      phone: this.props.phone,
      source: this.props.source,
      scoreValue: this.props.scoreValue,
      scoreConfidence: this.props.scoreConfidence,
      tenantId: this.props.tenantId,
      ownerId: this.props.ownerId,
      capturedAt: this.props.capturedAt.toISOString(),
    };
  }

  /**
   * Reconstruct from stored JSON
   */
  static fromJSON(json: Record<string, unknown>): ConversionSnapshot {
    return new ConversionSnapshot({
      leadId: json.leadId as string,
      email: json.email as string,
      firstName: json.firstName as string | null,
      lastName: json.lastName as string | null,
      company: json.company as string | null,
      title: json.title as string | null,
      phone: json.phone as string | null,
      source: json.source as LeadSource,
      scoreValue: json.scoreValue as number,
      scoreConfidence: json.scoreConfidence as number,
      tenantId: json.tenantId as string,
      ownerId: json.ownerId as string,
      capturedAt: new Date(json.capturedAt as string),
    });
  }
}
