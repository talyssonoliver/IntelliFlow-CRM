/**
 * Re-export NotificationBell as Notifications for backward compatibility.
 *
 * The header bell now uses tRPC notifications router (IFC-183)
 * instead of the old reminders-context.
 *
 * Task: PG-130 — Notifications Inbox Page
 */
// Direct import avoids barrel pollution — the @/components/notifications barrel
// includes NotificationSettingsSidebarNav which pulls in the entire sidebar chunk.
// PG-166: This change removes ~57KB of sidebar JS from the home page bundle.
export { NotificationBell as Notifications } from '@/components/notifications/NotificationBell';
