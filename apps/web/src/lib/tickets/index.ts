/**
 * Tickets Module Barrel (PG-137)
 *
 * Re-exports from the lib/tickets implementation.
 * The canonical implementation lives at apps/web/lib/tickets/index.ts.
 *
 * @module @/lib/tickets
 */

export {
  // SLA Service
  SLATrackingService,
  slaTrackingService,
  DEFAULT_SLA_POLICY,
  type SLAStatus,
  type TicketPriority,
  type TicketStatus,
  type SLAPolicy,
  type Ticket,
  type SLATimerResult,
  type SLABreachAlert,
  // SLA Badge Components
  SLATimerBadge,
  SLAStatusBadge,
  SLAProgressBar,
  SLAIndicatorDot,
  SLAQuickView,
  // SLA Notification System
  SLANotificationManager,
  slaNotificationManager,
  useSLANotifications,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationConfig,
  type SLANotification,
} from '../../../lib/tickets';
