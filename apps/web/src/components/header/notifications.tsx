/**
 * Re-export NotificationBell as Notifications for backward compatibility.
 *
 * The header bell now uses tRPC notifications router (IFC-183)
 * instead of the old reminders-context.
 *
 * Task: PG-130 — Notifications Inbox Page
 */
export { NotificationBell as Notifications } from '@/components/notifications';
