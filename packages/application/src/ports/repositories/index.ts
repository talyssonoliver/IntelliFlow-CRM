/**
 * Repository Ports
 * These interfaces define contracts that adapters must implement
 */

export * from './LeadRepositoryPort';
export * from './ContactRepositoryPort';
export * from './AccountRepositoryPort';
export * from './OpportunityRepositoryPort';
export * from './TaskRepositoryPort';
export * from './CaseDocumentRepositoryPort';
export * from './AnalyticsRepositoryPort';
export * from './TicketRepositoryPort';
export * from './LeadConversionAuditRepositoryPort';
export * from './AIOutputReviewRepositoryPort';
export * from './ActivityFeedRepositoryPort';
export * from './BillingRepositoryPort';
export * from './ModuleAccessPort';

// Feedback Survey Repository Port (IFC-068)
export * from './FeedbackSurveyRepositoryPort';

// Public Feedback Repository Port (PG-126)
export * from './PublicFeedbackRepositoryPort';

// Setup Instalment Repository Port (IFC-314)
export * from './SetupInstalmentRepositoryPort';

// Stripe Subscription Repository Port (IFC-314)
export * from './StripeSubscriptionRepositoryPort';
