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
    contactId: string,
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
    props: Partial<Pick<LeadProps, 'firstName' | 'lastName' | 'company' | 'title' | 'phone'>>
  ): void {
    Object.assign(this.props, props);
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
