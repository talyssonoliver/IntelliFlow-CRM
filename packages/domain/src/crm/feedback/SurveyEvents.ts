/**
 * Survey Feedback Domain Events - IFC-068: Feedback Analytics Dashboard
 *
 * Domain events for customer survey feedback lifecycle.
 * Not to be confused with AI FeedbackEvents in ai/FeedbackEvents.ts
 *
 * @module @intelliflow/domain/crm/feedback/SurveyEvents
 */

import { DomainEvent } from '../../shared/DomainEvent';

/**
 * Event: Survey was sent to a contact
 * Transition: PENDING -> SENT
 */
export class SurveySentEvent extends DomainEvent {
  readonly eventType = 'crm.survey.sent';

  constructor(
    public readonly surveyId: string,
    public readonly contactId: string,
    public readonly surveyType: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      surveyId: this.surveyId,
      contactId: this.contactId,
      surveyType: this.surveyType,
      tenantId: this.tenantId,
    };
  }
}

/**
 * Event: Contact responded to a survey
 * Transition: SENT -> RESPONDED
 */
export class SurveyRespondedEvent extends DomainEvent {
  readonly eventType = 'crm.survey.responded';

  constructor(
    public readonly surveyId: string,
    public readonly contactId: string,
    public readonly surveyType: string,
    public readonly score: number | null,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      surveyId: this.surveyId,
      contactId: this.contactId,
      surveyType: this.surveyType,
      score: this.score,
      tenantId: this.tenantId,
    };
  }
}

/**
 * Event: Survey response was followed up on
 * Transition: RESPONDED -> FOLLOWED_UP
 */
export class SurveyFollowedUpEvent extends DomainEvent {
  readonly eventType = 'crm.survey.followed_up';

  constructor(
    public readonly surveyId: string,
    public readonly followUpBy: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      surveyId: this.surveyId,
      followUpBy: this.followUpBy,
      tenantId: this.tenantId,
    };
  }
}

/**
 * Event: Survey was closed
 * Transition: any -> CLOSED
 */
export class SurveyClosedEvent extends DomainEvent {
  readonly eventType = 'crm.survey.closed';

  constructor(
    public readonly surveyId: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      surveyId: this.surveyId,
      tenantId: this.tenantId,
    };
  }
}
