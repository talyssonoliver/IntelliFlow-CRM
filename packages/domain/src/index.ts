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

// Future exports (to be implemented)
// export * from './intelligence/scoring/ScoringService';
