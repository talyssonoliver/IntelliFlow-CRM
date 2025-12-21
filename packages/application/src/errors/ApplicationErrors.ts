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
