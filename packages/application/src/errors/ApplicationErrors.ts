import { DomainError } from '@intelliflow/domain';

/**
 * Application layer error for persistence failures
 */
export class PersistenceError extends DomainError {
  readonly code = 'PERSISTENCE_ERROR';

  constructor(message: string) {
    super(message);
  }
}

/**
 * Application layer error for external service failures
 */
export class ExternalServiceError extends DomainError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';

  constructor(message: string) {
    super(message);
  }
}

/**
 * Application layer error for authorization failures
 */
export class AuthorizationError extends DomainError {
  readonly code = 'AUTHORIZATION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

/**
 * Application layer error for validation failures
 */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

/**
 * A qualification refused by the minimum-score business rule. It is still a
 * ValidationError (same code and message, so existing callers are unaffected);
 * `reason` lets a caller tell it from other validation refusals without parsing
 * the message, and carries the numbers for an audit trail.
 */
export class LeadScoreBelowMinimumError extends ValidationError {
  readonly reason = 'LEAD_SCORE_BELOW_MINIMUM';

  constructor(
    readonly score: number,
    readonly minScore: number
  ) {
    super(`Lead score ${score} is below minimum qualification threshold ${minScore}`);
  }
}

/**
 * #1218: AI scoring produced no usable score (the provider failed, or the model answered with
 * no confidence). The lead keeps its previous score and status. `reason` tells a caller this
 * apart from other validation failures without parsing the message.
 */
export class LeadScoringFailedError extends ValidationError {
  readonly reason = 'LEAD_SCORING_FAILED';

  constructor(readonly failure: 'NO_USABLE_SCORE' = 'NO_USABLE_SCORE') {
    super('AI scoring gave no usable score; the previous score was kept');
  }
}

/**
 * A task's record link refused because the record is gone, malformed, converted
 * or closed. Still a ValidationError (same code and message); `reason` lets a
 * caller tell it from a failed lookup or a failed save without parsing the message.
 */
export class TaskLinkRejectedError extends ValidationError {
  readonly reason = 'TASK_LINK_REJECTED';
}

/**
 * Application layer error for not found resources
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND_ERROR';

  constructor(message: string) {
    super(message);
  }
}
