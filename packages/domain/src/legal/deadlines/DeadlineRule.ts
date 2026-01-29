import { ValueObject } from '../../shared/ValueObject';
import { Result, DomainError } from '../../shared/Result';

/**
 * Type of days to count for deadline calculation
 */
export type DayCountType = 'CALENDAR' | 'BUSINESS';

/**
 * Deadline trigger type - what event starts the deadline countdown
 */
export type DeadlineTrigger =
  | 'CASE_OPENED'
  | 'CASE_FILED'
  | 'DOCUMENT_RECEIVED'
  | 'HEARING_SCHEDULED'
  | 'MOTION_FILED'
  | 'DISCOVERY_SERVED'
  | 'CUSTOM';

/**
 * Jurisdiction for deadline rules
 */
export type Jurisdiction = 'US_FEDERAL' | 'UK' | 'EU' | 'BRAZIL' | 'CUSTOM';

/**
 * Error when deadline rule is invalid
 */
export class InvalidDeadlineRuleError extends DomainError {
  readonly code = 'INVALID_DEADLINE_RULE';
  constructor(message: string) {
    super(`Invalid deadline rule: ${message}`);
  }
}

/**
 * DeadlineRule Value Object Properties
 */
interface DeadlineRuleProps {
  name: string;
  description: string;
  daysCount: number;
  dayCountType: DayCountType;
  trigger: DeadlineTrigger;
  jurisdiction: Jurisdiction;
  excludeHolidays: boolean;
  includeEndDay: boolean;
}

/**
 * DeadlineRule Value Object
 * Defines how a deadline should be calculated
 * Examples:
 * - "5 business days from filing"
 * - "30 calendar days from case opened"
 * - "14 days from document received, excluding holidays"
 */
export class DeadlineRule extends ValueObject<DeadlineRuleProps> {
  private constructor(props: DeadlineRuleProps) {
    super(props);
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string {
    return this.props.description;
  }

  get daysCount(): number {
    return this.props.daysCount;
  }

  get dayCountType(): DayCountType {
    return this.props.dayCountType;
  }

  get trigger(): DeadlineTrigger {
    return this.props.trigger;
  }

  get jurisdiction(): Jurisdiction {
    return this.props.jurisdiction;
  }

  get excludeHolidays(): boolean {
    return this.props.excludeHolidays;
  }

  get includeEndDay(): boolean {
    return this.props.includeEndDay;
  }

  /**
   * Create a new DeadlineRule
   */
  static create(props: {
    name: string;
    description?: string;
    daysCount: number;
    dayCountType: DayCountType;
    trigger: DeadlineTrigger;
    jurisdiction?: Jurisdiction;
    excludeHolidays?: boolean;
    includeEndDay?: boolean;
  }): Result<DeadlineRule, DomainError> {
    if (!props.name || props.name.trim().length === 0) {
      return Result.fail(new InvalidDeadlineRuleError('Name is required'));
    }

    if (props.daysCount < 0) {
      return Result.fail(new InvalidDeadlineRuleError('Days count must be non-negative'));
    }

    if (props.daysCount > 365 * 10) {
      return Result.fail(new InvalidDeadlineRuleError('Days count exceeds maximum (3650 days)'));
    }

    return Result.ok(
      new DeadlineRule({
        name: props.name.trim(),
        description: props.description?.trim() ?? '',
        daysCount: props.daysCount,
        dayCountType: props.dayCountType,
        trigger: props.trigger,
        jurisdiction: props.jurisdiction ?? 'CUSTOM',
        excludeHolidays: props.excludeHolidays ?? false,
        includeEndDay: props.includeEndDay ?? true,
      })
    );
  }

  /**
   * Common deadline rules for US Federal Courts
   */
  static usFederalResponseToComplaint(): DeadlineRule {
    return DeadlineRule.create({
      name: 'Response to Complaint',
      description: '21 days to respond to a complaint under FRCP Rule 12',
      daysCount: 21,
      dayCountType: 'CALENDAR',
      trigger: 'DOCUMENT_RECEIVED',
      jurisdiction: 'US_FEDERAL',
      excludeHolidays: false,
      includeEndDay: true,
    }).value;
  }

  static usFederalDiscoveryResponse(): DeadlineRule {
    return DeadlineRule.create({
      name: 'Discovery Response',
      description: '30 days to respond to discovery requests under FRCP Rule 33/34',
      daysCount: 30,
      dayCountType: 'CALENDAR',
      trigger: 'DISCOVERY_SERVED',
      jurisdiction: 'US_FEDERAL',
      excludeHolidays: false,
      includeEndDay: true,
    }).value;
  }

  static usFederalMotionResponse(): DeadlineRule {
    return DeadlineRule.create({
      name: 'Motion Response',
      description: '14 days to respond to most motions under FRCP Rule 6',
      daysCount: 14,
      dayCountType: 'CALENDAR',
      trigger: 'MOTION_FILED',
      jurisdiction: 'US_FEDERAL',
      excludeHolidays: false,
      includeEndDay: true,
    }).value;
  }

  /**
   * Common deadline rules for UK Courts
   */
  static ukAcknowledgementOfService(): DeadlineRule {
    return DeadlineRule.create({
      name: 'Acknowledgement of Service',
      description: '14 days to file acknowledgement of service in UK courts',
      daysCount: 14,
      dayCountType: 'CALENDAR',
      trigger: 'DOCUMENT_RECEIVED',
      jurisdiction: 'UK',
      excludeHolidays: false,
      includeEndDay: true,
    }).value;
  }

  static ukDefenceDeadline(): DeadlineRule {
    return DeadlineRule.create({
      name: 'Defence Filing',
      description: '28 days to file a defence in UK courts (after acknowledgement)',
      daysCount: 28,
      dayCountType: 'CALENDAR',
      trigger: 'DOCUMENT_RECEIVED',
      jurisdiction: 'UK',
      excludeHolidays: false,
      includeEndDay: true,
    }).value;
  }

  /**
   * Custom business days rule
   */
  static businessDays(name: string, days: number, trigger: DeadlineTrigger): DeadlineRule {
    return DeadlineRule.create({
      name,
      description: `${days} business days from ${trigger.toLowerCase().replace('_', ' ')}`,
      daysCount: days,
      dayCountType: 'BUSINESS',
      trigger,
      excludeHolidays: true,
      includeEndDay: true,
    }).value;
  }

  /**
   * Custom calendar days rule
   */
  static calendarDays(name: string, days: number, trigger: DeadlineTrigger): DeadlineRule {
    return DeadlineRule.create({
      name,
      description: `${days} calendar days from ${trigger.toLowerCase().replace('_', ' ')}`,
      daysCount: days,
      dayCountType: 'CALENDAR',
      trigger,
      excludeHolidays: false,
      includeEndDay: true,
    }).value;
  }

  toValue(): DeadlineRuleProps {
    return { ...this.props };
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      daysCount: this.daysCount,
      dayCountType: this.dayCountType,
      trigger: this.trigger,
      jurisdiction: this.jurisdiction,
      excludeHolidays: this.excludeHolidays,
      includeEndDay: this.includeEndDay,
    };
  }
}
