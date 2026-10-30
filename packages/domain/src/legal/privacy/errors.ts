import { DomainError } from '../../shared/Result';

/**
 * PG-203: processing is restricted for this person by a data request (Art 18 / Art 21).
 * Returned by AI scoring and other automated processing that a restriction stops.
 */
export class ProcessingRestrictedError extends DomainError {
  readonly code = 'PROCESSING_RESTRICTED';
  constructor() {
    super('Processing is restricted for this person (data request).');
  }
}
