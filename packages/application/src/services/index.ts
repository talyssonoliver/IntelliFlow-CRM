/**
 * Domain Services
 *
 * These services orchestrate business logic across domain aggregates.
 * They enforce business rules, coordinate multi-aggregate operations,
 * and integrate with external services (AI, event bus, etc.).
 */

export * from './LeadService';
export * from './ContactService';
export * from './AccountService';
export * from './OpportunityService';
export * from './TaskService';
export * from './TicketService';
export * from './AnalyticsService';

// Event Handlers & Schedulers (IFC-158)
export * from './AppointmentIcsEventHandler';
export * from './ReminderSchedulerService';

// Notification Service (IFC-157)
export * from './NotificationService';
