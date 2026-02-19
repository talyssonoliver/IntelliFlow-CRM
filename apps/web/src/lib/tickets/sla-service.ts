/**
 * SLA Tracking Service (PG-137)
 *
 * Re-exports from the lib/tickets implementation.
 * The canonical implementation lives at apps/web/lib/tickets/sla-service.ts
 * because Next.js App Router colocates non-route lib files there.
 *
 * @module @/lib/tickets/sla-service
 */

export {
  SLATrackingService,
  slaTrackingService,
  DEFAULT_SLA_POLICY,
  type SLAPolicy,
  type Ticket,
  type SLATimerResult,
  type SLABreachAlert,
  type ExtendedTicketStatus,
} from '../../../lib/tickets/sla-service';

export type { SLAStatus, TicketPriority, TicketStatus } from '../../../lib/tickets/sla-service';
