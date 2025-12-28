// IntelliFlow CRM - Domain Layer
// Pure business logic - NO infrastructure dependencies

// Shared building blocks
export * from './shared/Entity';
export * from './shared/ValueObject';
export * from './shared/AggregateRoot';
export * from './shared/DomainEvent';
export * from './shared/Result';

// CRM Domain - Leads
export * from './crm/lead/Lead';
export * from './crm/lead/LeadId';
export * from './crm/lead/LeadScore';
export * from './crm/lead/Email';
export * from './crm/lead/LeadEvents';
export * from './crm/lead/LeadRepository';

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
export * from './legal/cases/Case';
export * from './legal/cases/CaseId';
export * from './legal/cases/CaseTaskId';
export * from './legal/cases/CaseTask';
export * from './legal/cases/CaseEvents';
export * from './legal/cases/CaseRepository';

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

// Future exports (to be implemented)
// export * from './intelligence/scoring/ScoringService';
