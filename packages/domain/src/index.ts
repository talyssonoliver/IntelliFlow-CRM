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

// Future exports (to be implemented)
// export * from './crm/contact/Contact';
// export * from './crm/account/Account';
// export * from './crm/opportunity/Opportunity';
// export * from './intelligence/scoring/ScoringService';
