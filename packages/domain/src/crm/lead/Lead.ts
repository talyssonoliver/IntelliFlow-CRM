import { AggregateRoot } from '../../shared/AggregateRoot';
import { Result, DomainError } from '../../shared/Result';
import { LeadId } from './LeadId';
import { Email } from './Email';
import { LeadScore } from './LeadScore';
import { PhoneNumber } from '../../shared/PhoneNumber';
import {
  LeadCreatedEvent,
  LeadScoredEvent,
  LeadStatusChangedEvent,
  LeadQualifiedEvent,
  LeadConvertedEvent,
} from './LeadEvents';

// Canonical enum values - single source of truth
export const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'NEGOTIATING',
  'UNQUALIFIED',
  'CONVERTED',
  'LOST',
] as const;

export const LEAD_SOURCES = [
  'WEBSITE',
  'REFERRAL',
  'SOCIAL',
  'EMAIL',
  'COLD_CALL',
  'EVENT',
  'OTHER',
  'BOOKING', // PG-203: leads created by the public booking page
] as const;

// Derive types from const arrays
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];

export class LeadAlreadyConvertedError extends DomainError {
  readonly code = 'LEAD_ALREADY_CONVERTED';
  constructor() {
    super('Lead has already been converted');
  }
}

export class LeadCannotBeQualifiedError extends DomainError {
  readonly code = 'LEAD_CANNOT_BE_QUALIFIED';
  constructor(status: LeadStatus) {
    super(`Lead with status ${status} cannot be qualified`);
  }
}

interface LeadProps {
  email: Email;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: PhoneNumber;
  source: LeadSource;
  status: LeadStatus;
  score: LeadScore;
  ownerId: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
  // Lead 360 fields
  location?: string;
  website?: string;
  avatarUrl?: string;
  lastContactedAt?: Date;
  estimatedValue?: number; // In cents
  tags?: string[];
  // BANT qualification fields (IFC-242) — first-class, distinct from estimatedValue
  budget?: string;
  authority?: string;
  need?: string;
  timeline?: string;
  annualRevenue?: string; // company revenue band, NOT a deal value
}

export interface CreateLeadProps {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string | PhoneNumber; // Accept both for flexibility
  source?: LeadSource;
  ownerId: string;
  tenantId: string;
  // Lead 360 fields
  location?: string;
  website?: string;
  avatarUrl?: string;
  lastContactedAt?: Date;
  estimatedValue?: number; // In cents
  tags?: string[];
  // BANT qualification fields (IFC-242)
  budget?: string;
  authority?: string;
  need?: string;
  timeline?: string;
  annualRevenue?: string; // company revenue band, NOT a deal value
}

/**
 * Lead Aggregate Root
 * Represents a potential customer in the CRM
 */
export class Lead extends AggregateRoot<LeadId> {
  private readonly props: LeadProps;

  private constructor(id: LeadId, props: LeadProps) {
    super(id);
    this.props = props;
  }

  // Getters
  get email(): Email {
    return this.props.email;
  }

  get firstName(): string | undefined {
    return this.props.firstName;
  }

  get lastName(): string | undefined {
    return this.props.lastName;
  }

  get fullName(): string {
    return [this.props.firstName, this.props.lastName].filter(Boolean).join(' ');
  }

  get company(): string | undefined {
    return this.props.company;
  }

  get title(): string | undefined {
    return this.props.title;
  }

  get phone(): PhoneNumber | undefined {
    return this.props.phone;
  }

  get source(): LeadSource {
    return this.props.source;
  }

  get status(): LeadStatus {
    return this.props.status;
  }

  get score(): LeadScore {
    return this.props.score;
  }

  get ownerId(): string {
    return this.props.ownerId;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  // Lead 360 fields
  get location(): string | undefined {
    return this.props.location;
  }

  get website(): string | undefined {
    return this.props.website;
  }

  get avatarUrl(): string | undefined {
    return this.props.avatarUrl;
  }

  get lastContactedAt(): Date | undefined {
    return this.props.lastContactedAt;
  }

  get estimatedValue(): number | undefined {
    return this.props.estimatedValue;
  }

  get tags(): string[] | undefined {
    return this.props.tags;
  }

  // BANT qualification fields (IFC-242)
  get budget(): string | undefined {
    return this.props.budget;
  }

  get authority(): string | undefined {
    return this.props.authority;
  }

  get need(): string | undefined {
    return this.props.need;
  }

  get timeline(): string | undefined {
    return this.props.timeline;
  }

  get annualRevenue(): string | undefined {
    return this.props.annualRevenue;
  }

  get isConverted(): boolean {
    return this.props.status === 'CONVERTED';
  }

  get isQualified(): boolean {
    return this.props.status === 'QUALIFIED';
  }

  // Factory method
  static create(props: CreateLeadProps): Result<Lead, DomainError> {
    const emailResult = Email.create(props.email);
    if (emailResult.isFailure) {
      return Result.fail(emailResult.error);
    }

    // Convert phone to PhoneNumber if string provided
    let phoneNumber: PhoneNumber | undefined = undefined;
    if (props.phone) {
      if (typeof props.phone === 'string') {
        const phoneResult = PhoneNumber.create(props.phone);
        if (phoneResult.isFailure) {
          return Result.fail(phoneResult.error);
        }
        phoneNumber = phoneResult.value;
      } else {
        // Already a PhoneNumber instance
        phoneNumber = props.phone;
      }
    }

    const now = new Date();
    const leadId = LeadId.generate();

    const lead = new Lead(leadId, {
      email: emailResult.value,
      firstName: props.firstName,
      lastName: props.lastName,
      company: props.company,
      title: props.title,
      phone: phoneNumber,
      source: props.source ?? 'WEBSITE',
      status: 'NEW',
      score: LeadScore.zero(),
      ownerId: props.ownerId,
      tenantId: props.tenantId,
      createdAt: now,
      updatedAt: now,
      // Lead 360 fields
      location: props.location,
      website: props.website,
      avatarUrl: props.avatarUrl,
      lastContactedAt: props.lastContactedAt,
      estimatedValue: props.estimatedValue,
      tags: props.tags,
      // BANT qualification fields (IFC-242)
      budget: props.budget,
      authority: props.authority,
      need: props.need,
      timeline: props.timeline,
      annualRevenue: props.annualRevenue,
    });

    lead.addDomainEvent(new LeadCreatedEvent(leadId, emailResult.value, lead.source, lead.ownerId));

    return Result.ok(lead);
  }

  // Reconstitute from persistence
  static reconstitute(
    id: LeadId,
    props: Omit<LeadProps, 'score'> & { score: { value: number; confidence: number } }
  ): Lead {
    const scoreResult = LeadScore.create(props.score.value, props.score.confidence);
    return new Lead(id, {
      ...props,
      score: scoreResult.isSuccess ? scoreResult.value : LeadScore.zero(),
    });
  }

  // Commands
  updateScore(value: number, confidence: number, modelVersion: string): Result<void, DomainError> {
    const scoreResult = LeadScore.create(value, confidence);
    if (scoreResult.isFailure) {
      return Result.fail(scoreResult.error);
    }

    const previousScore = this.props.score;
    this.props.score = scoreResult.value;
    this.props.updatedAt = new Date();

    this.addDomainEvent(
      new LeadScoredEvent(this.id, scoreResult.value, previousScore, modelVersion)
    );

    return Result.ok(undefined);
  }

  changeStatus(newStatus: LeadStatus, changedBy: string): Result<void, LeadAlreadyConvertedError> {
    if (this.isConverted) {
      return Result.fail(new LeadAlreadyConvertedError());
    }

    const previousStatus = this.props.status;
    this.props.status = newStatus;
    this.props.updatedAt = new Date();

    this.addDomainEvent(new LeadStatusChangedEvent(this.id, previousStatus, newStatus, changedBy));

    return Result.ok(undefined);
  }

  qualify(qualifiedBy: string, reason: string): Result<void, DomainError> {
    if (this.isConverted) {
      return Result.fail(new LeadAlreadyConvertedError());
    }

    if (this.props.status !== 'NEW' && this.props.status !== 'CONTACTED') {
      return Result.fail(new LeadCannotBeQualifiedError(this.props.status));
    }

    this.props.status = 'QUALIFIED';
    this.props.updatedAt = new Date();

    this.addDomainEvent(new LeadQualifiedEvent(this.id, qualifiedBy, reason));

    return Result.ok(undefined);
  }

  convert(
    contactId: string | null,
    accountId: string | null,
    convertedBy: string
  ): Result<void, LeadAlreadyConvertedError> {
    if (this.isConverted) {
      return Result.fail(new LeadAlreadyConvertedError());
    }

    this.props.status = 'CONVERTED';
    this.props.updatedAt = new Date();

    this.addDomainEvent(new LeadConvertedEvent(this.id, contactId, accountId, convertedBy));

    return Result.ok(undefined);
  }

  updateContactInfo(
    props: Partial<
      Pick<
        LeadProps,
        | 'title'
        | 'avatarUrl'
        | 'lastContactedAt'
        | 'tags'
        | 'budget'
        | 'authority'
        | 'need'
        | 'timeline'
        | 'annualRevenue'
      >
    > & {
      // IFC-412 (owner ruling 2026-10-12): these "required-looking" fields must
      // be explicitly clearable from the lead edit form. The domain's internal
      // "no value" representation is `undefined` (never `null` — see every
      // other getter/prop in this class), so an explicit `null` here is a
      // caller-facing signal, not a value we store as-is: `undefined`/omitted
      // leaves the field unchanged, `null` clears it (normalized to
      // `undefined` below), and any other value sets it.
      firstName?: string | null;
      lastName?: string | null;
      company?: string | null;
      phone?: LeadProps['phone'] | null;
      location?: string | null;
      website?: string | null;
      estimatedValue?: number | null;
    }
  ): void {
    // Only apply fields the caller actually provided (not undefined) — this is
    // what lets an untouched field survive a partial update. A provided `null`
    // is kept (not filtered out) and normalized to the domain's `undefined`
    // "absent" representation, which is what actually clears the field.
    const toApply = Object.entries(props)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, v === null ? undefined : v]);
    Object.assign(this.props, Object.fromEntries(toApply));
    this.props.updatedAt = new Date();
  }

  // Serialization
  toJSON(): Record<string, unknown> {
    return {
      id: this.id.value,
      email: this.email.value,
      firstName: this.firstName,
      lastName: this.lastName,
      company: this.company,
      title: this.title,
      phone: this.phone,
      source: this.source,
      status: this.status,
      score: this.score.toValue(),
      ownerId: this.ownerId,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    };
  }
}
