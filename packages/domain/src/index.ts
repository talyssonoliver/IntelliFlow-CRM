// IntelliFlow CRM - Domain Layer
// Pure business logic - NO infrastructure dependencies

// Shared building blocks
export * from './shared/Entity';
export * from './shared/ValueObject';
export * from './shared/AggregateRoot';
export * from './shared/DomainEvent';
export * from './shared/Result';

// Common Value Objects
export * from './shared/Money';
export * from './shared/PhoneNumber';
export * from './shared/WebsiteUrl';
export * from './shared/DateRange';
export * from './shared/Percentage';

// CRM Domain - Leads
export * from './crm/lead/Lead';
export * from './crm/lead/LeadId';
export * from './crm/lead/LeadScore';
export * from './crm/lead/Email';
export * from './crm/lead/LeadEvents';
export * from './crm/lead/LeadRepository';
export * from './crm/lead/LeadConversionAudit';
export * from './crm/lead/LeadActivityConstants';

// CRM Domain - Contacts
export * from './crm/contact/Contact';
export * from './crm/contact/ContactId';
export * from './crm/contact/ContactEvents';
export * from './crm/contact/ContactRepository';

// CRM Domain - Accounts
export * from './crm/account/Account';
export * from './crm/account/AccountId';
export * from './crm/account/AccountEvents';
export * from './crm/account/AccountRepository';

// CRM Domain - Opportunities
export * from './crm/opportunity/Opportunity';
export * from './crm/opportunity/OpportunityId';
export * from './crm/opportunity/OpportunityEvents';
export * from './crm/opportunity/OpportunityRepository';

// CRM Domain - Tasks
export * from './crm/task/Task';
export * from './crm/task/TaskId';
export * from './crm/task/TaskEvents';
export * from './crm/task/TaskRepository';

// Legal Domain - Cases/Matters
export * from './legal/cases/case';
export * from './legal/cases/case-document';
export * from './legal/cases/DocumentIngestionEvents';
export * from './legal/cases/CaseId';
export * from './legal/cases/CaseTaskId';
export * from './legal/cases/CaseTask';
export * from './legal/cases/CaseEvents';
export * from './legal/cases/CaseRepository';

// Workflow Events (extends CaseEvents with workflow-specific events)
export * from './events/case-events';

// Legal Domain - Appointments
export * from './legal/appointments/Appointment';
export * from './legal/appointments/AppointmentId';
export * from './legal/appointments/AppointmentEvents';
export * from './legal/appointments/AppointmentRepository';
export * from './legal/appointments/TimeSlot';
export * from './legal/appointments/Recurrence';
export * from './legal/appointments/Buffer';
export * from './legal/appointments/ConflictDetector';

// Legal Domain - Deadlines
export * from './legal/deadlines/DeadlineId';
export * from './legal/deadlines/DeadlineRule';
export * from './legal/deadlines/Deadline';
export * from './legal/deadlines/DeadlineEvents';
export * from './legal/deadlines/HolidayCalendar';
export * from './legal/deadlines/deadline-engine';

// Support Domain - Tickets
export * from './support/TicketConstants';

// Notifications Domain
export * from './notifications';

// AI Domain - Constants
export * from './ai/AIConstants';

// AI Domain - Feedback Events
export * from './ai/FeedbackEvents';

// AI Domain - Output Review (IFC-128)
export * from './ai/review';

// AI Domain - Conversation Records (IFC-148)
export * from './ai/conversation-record';

// Auth Domain - Constants
export * from './auth/AuthConstants';

// Config Domain - Constants
export * from './config/ConfigConstants';

// Timeline Domain - Constants
export * from './timeline/TimelineConstants';

// Platform Domain - IDP Constants (IFC-078)
export * from './platform';

// Auto-Response Domain (IFC-029)
export * from './autoresponse';

// Intelligence Domain (IFC-095)
export * from './intelligence';

// Security Domain - AI Security Event Types (IFC-125)
export * from './security/AISecurityEventTypes';

// Activity Feed Domain (IFC-069)
export * from './activity-feed';

// CRM Domain - Billing (IFC-198)
export * from './crm/billing';
