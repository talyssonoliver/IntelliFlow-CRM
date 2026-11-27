/**
 * Tenant-owned models the workspace export deliberately does NOT write, each with the reason.
 *
 * The export is "a standalone copy of the data your workspace owns" (agreement clause 5). A model
 * with a `tenantId` column is either in EXPORT_ENTITIES (entities.ts, plus the users and
 * memberships files) or here. `__tests__/entity-coverage.test.ts` fails when a tenant model is in
 * neither, when it is in both, or when this list names a model that no longer exists, so a new
 * tenant table cannot be forgotten: whoever adds it decides.
 */

const CREDENTIAL = 'credential, token or secret store: never leaves the platform';
const AI_DERIVED =
  'AI-generated or derived data (scores, insights, drafts): not the customer records';
const AUDIT = 'audit, security or event log of the platform: not the customer records';
const METRIC = 'computed metric or usage counter, rebuilt from the exported records';
const BILLING = 'billing or plan record: the invoices are in the customer payment provider account';
const PLUMBING = 'platform delivery plumbing (queues, retries, receipts), not customer content';

export const EXCLUDED_MODELS: Readonly<Record<string, string>> = {
  // Credentials and tokens
  APIKey: CREDENTIAL,
  EmailMailbox: `${CREDENTIAL} (mailbox passwords and OAuth refresh tokens)`,
  EmailOAuthState: CREDENTIAL,
  Session: CREDENTIAL,
  UserMfaSettings: CREDENTIAL,
  WebhookEndpoint: `${CREDENTIAL} (webhook signing secrets)`,
  TenantAIProviderKey: `${CREDENTIAL} (the workspace's own AI provider keys)`,
  PartnerLoginGrant: `${CREDENTIAL} (operator staff login links)`,
  CustomActionHandler: 'executable handler configuration that can carry endpoints and secrets',
  DsarRequest: `${CREDENTIAL} (privacy request verification tokens) and anti-abuse hashes`,
  BookingAttempt: 'anti-abuse record holding hashed visitor email and IP, not a customer record',

  // AI derived
  AccountAIInsight: AI_DERIVED,
  AccountHealthScore: AI_DERIVED,
  AIInsight: AI_DERIVED,
  AIOutputReview: AI_DERIVED,
  AIScore: AI_DERIVED,
  CaseAIInsight: AI_DERIVED,
  ContactAIInsight: AI_DERIVED,
  LeadAIInsight: AI_DERIVED,
  TicketAIInsight: AI_DERIVED,
  AutoResponseDraft: AI_DERIVED,
  ContactReplyDraft: AI_DERIVED,
  AgentAction: AI_DERIVED,
  ChainRun: AI_DERIVED,
  ChainVersion: AI_DERIVED,
  ToolCallRecord: AI_DERIVED,
  AIMonitoringEvent: AI_DERIVED,
  Experiment: AI_DERIVED,
  TenantAIConfig: 'AI model and provider configuration of the platform',
  TenantMemoryPolicy: 'AI memory configuration of the platform',
  TenantToolEnablement: 'AI tool enablement of the platform',
  ZepEpisodeAudit: AI_DERIVED,
  ZepEpisodeUsage: AI_DERIVED,
  ConversationRecord:
    'private AI assistant conversations of individual users: like personal mail, left to each person',
  MessageRecord:
    'messages of the private AI assistant conversations of individual users (see ConversationRecord)',

  // Audit, security and event logs
  AuditLog: AUDIT,
  AuditLogEntry: AUDIT,
  SecurityEvent: AUDIT,
  CaseDocumentAudit: AUDIT,
  DocumentAccessLog: AUDIT,
  TenantMembershipAudit: AUDIT,
  RoutingAudit: AUDIT,
  LeadConversionAudit: AUDIT,
  EscalationHistory: AUDIT,
  DomainEvent: AUDIT,
  BusinessRuleExecution: AUDIT,
  TaskAutomationRun: AUDIT,
  WorkflowExecution: AUDIT,
  ReportExecution: AUDIT,
  ComplianceSnapshot: AUDIT,
  ProcessingRestriction: 'privacy-request processing flag of the platform',
  DsarStoredObject:
    'erasure bookkeeping (files queued for deletion or kept); it is about files that were erased, not customer content',
  WebhookDelivery: AUDIT,

  // Computed metrics and usage
  APIUsageRecord: METRIC,
  DealsWonMetric: METRIC,
  GrowthMetric: METRIC,
  PerformanceMetric: METRIC,
  PipelineSnapshot: METRIC,
  SalesPerformance: METRIC,
  TrafficSource: METRIC,
  TenantUsageCounter: METRIC,
  TenantQuotaOverride: 'plan quota set by the operator',
  HelpArticleAnalyticsDedup: METRIC,
  HelpArticleSearchNoResultDaily: METRIC,
  HelpArticleViewDaily: METRIC,
  SLABreach: METRIC,
  SLANotification: METRIC,

  // Billing, plan and legal acceptance
  StripeSubscription: BILLING,
  SetupInstalment: BILLING,
  PortalPmDelivery: BILLING,
  TenantModule: 'plan module switches set by the operator',
  TermsAcceptance: 'record of the platform terms the workspace accepted',
  WorkspaceExportRequest: 'the export requests themselves',

  // Delivery plumbing and platform access control
  EmailBounceReceipt: PLUMBING,
  Notification: PLUMBING,
  NotificationDLQ: PLUMBING,
  UserPermission: 'platform access-control grants; each user role is in users.csv',
  UserRoleAssignment: 'platform access-control grants; each user role is in users.csv',
};
