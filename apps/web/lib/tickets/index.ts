/**
 * Tickets Module - IFC-093
 *
 * SLA Tracking and Notification System for IntelliFlow CRM
 *
 * @implements FLOW-011 (Ticket creation flow)
 * @implements FLOW-013 (SLA management flow)
 */

// SLA Service - Core tracking logic
export {
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
} from './sla-service';

// SLA Badge Components
export {
  SLATimerBadge,
  SLAStatusBadge,
  SLAProgressBar,
  SLAIndicatorDot,
  SLAQuickView,
} from './sla-badge';

// SLA Notification System
export {
  SLANotificationManager,
  slaNotificationManager,
  useSLANotifications,
  type NotificationChannel,
  type NotificationPriority,
  type NotificationConfig,
  type SLANotification,
} from './sla-notifications';
