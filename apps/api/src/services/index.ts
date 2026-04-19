/**
 * Services Layer - Domain Service Exports
 *
 * This module exports domain services that bridge the API layer
 * with the domain layer, applying domain logic to API operations.
 */

// Appointment Domain Service
export { AppointmentDomainService, appointmentDomainService } from './appointment-domain.service';

// Deadline Domain Service
export {
  DeadlineDomainService,
  deadlineDomainService,
  createDeadlineDomainService,
  type ComputeDeadlineInput,
  type CreateDeadlineFromRuleInput,
  type TimelineDeadline,
  type DeadlineSummary,
  type HolidayConfig,
} from './deadline-domain.service';
