/**
 * IntelliFlow CRM - Database Seed Script
 *
 * This script populates the database with sample data matching the frontend UI mockups.
 * It is idempotent - can be run multiple times without creating duplicates.
 *
 * Usage:
 *   pnpm run db:seed
 *
 * Data Sources:
 * - Lead data from: apps/web/src/app/leads/(list)/page.tsx
 * - Contact data from: apps/web/src/app/contacts/(list)/page.tsx
 * - Deal data from: apps/web/src/app/deals/page.tsx and apps/web/src/app/deals/[id]/page.tsx
 * - Ticket data from: apps/web/src/app/tickets/page.tsx
 * - Dashboard metrics from: apps/web/src/components/dashboard/widgets/*
 */

import {
  Prisma,
  PrismaClient,
  UserRole,
  LeadSource,
  LeadStatus,
  OpportunityStage,
  TaskPriority,
  TaskStatus,
  EventStatus,
  TicketStatus,
  TicketPriority,
  SLAStatus,
  FileType,
  ActivityType,
  AgentActionStatus,
  TicketActivityType,
  TicketChannel,
  ContactActivityType,
  Sentiment,
  ChurnRisk,
  CalendarEventType,
  // New enums for flow coverage
  EmailStatus,
  ChatChannel,
  ChatStatus,
  CallStatus,
  DocumentStatus,
  FeedbackType,
  FeedbackStatus,
  RenewalStatus,
  AgentStatus,
  WorkflowStatus,
  InsightStatus,
  HealthStatus,
  AlertStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// =============================================================================
// Deterministic IDs for idempotency
// =============================================================================

const SEED_IDS = {
  // User IDs match actual UUIDs in Supabase cloud database
  users: {
    admin: '00000000-0000-4000-8000-000000000011',
    manager: '00000000-0000-4000-8000-000000000012',
    sarahJohnson: '00000000-0000-4000-8000-000000000013',
    mikeDavis: '00000000-0000-4000-8000-000000000014',
    emilyDavis: '00000000-0000-4000-8000-000000000015',
    jamesWilson: '00000000-0000-4000-8000-000000000016',
    alexMorgan: '00000000-0000-4000-8000-000000000017',
    sarahJenkins: '00000000-0000-4000-8000-000000000018',
    mikeRoss: '00000000-0000-4000-8000-000000000019',
    davidKim: '00000000-0000-4000-8000-00000000001a',
    janeDoe: '00000000-0000-4000-8000-00000000001b',
  },
  leads: {
    sarahMiller: 'seed-lead-sarah-miller',
    davidChen: 'seed-lead-david-chen',
    amandaSmith: 'seed-lead-amanda-smith',
    jamesWilson: 'seed-lead-james-wilson',
    elenaRodriguez: 'seed-lead-elena-rodriguez',
  },
  contacts: {
    sarahMiller: 'seed-contact-sarah-miller',
    davidChen: 'seed-contact-david-chen',
    amandaSmith: 'seed-contact-amanda-smith',
    jamesWilson: 'seed-contact-james-wilson',
    elenaRodriguez: 'seed-contact-elena-rodriguez',
    johnSmith: 'seed-contact-john-smith',
    emilyChen: 'seed-contact-emily-chen',
    michaelBrown: 'seed-contact-michael-brown',
    lisaWang: 'seed-contact-lisa-wang',
    robertFox: 'seed-contact-robert-fox',
  },
  accounts: {
    techCorp: 'seed-account-techcorp',
    designCo: 'seed-account-designco',
    smithConsulting: 'seed-account-smith-consulting',
    globalSoft: 'seed-account-globalsoft',
    finTech: 'seed-account-fintech',
    acmeCorp: 'seed-account-acme',
    techStart: 'seed-account-techstart',
    globalTech: 'seed-account-globaltech',
    dataCorp: 'seed-account-datacorp',
    innovateCo: 'seed-account-innovateco',
    megaCorp: 'seed-account-megacorp',
    startupXYZ: 'seed-account-startupxyz',
    devTools: 'seed-account-devtools',
  },
  opportunities: {
    enterpriseLicenseAcme: 'seed-opp-enterprise-acme',
    annualSubscriptionTechStart: 'seed-opp-annual-techstart',
    customIntegrationGlobalTech: 'seed-opp-custom-globaltech',
    platformMigrationDataCorp: 'seed-opp-platform-datacorp',
    consultingInnovateCo: 'seed-opp-consulting-innovateco',
    enterpriseSuiteMegaCorp: 'seed-opp-enterprise-megacorp',
    teamLicenseStartupXYZ: 'seed-opp-team-startupxyz',
    apiAccessDevTools: 'seed-opp-api-devtools',
    acmeCorpSoftwareLicense: 'seed-opp-acme-software',
    // Additional opportunities for dashboard demo
    closedMay1: 'seed-opp-closed-may-1',
    closedMay2: 'seed-opp-closed-may-2',
    closedJun1: 'seed-opp-closed-jun-1',
    closedJun2: 'seed-opp-closed-jun-2',
    closedJul1: 'seed-opp-closed-jul-1',
    closedAug1: 'seed-opp-closed-aug-1',
    closedAug2: 'seed-opp-closed-aug-2',
    closedSep1: 'seed-opp-closed-sep-1',
    closedOct1: 'seed-opp-closed-oct-1',
    closedOct2: 'seed-opp-closed-oct-2',
    qualificationDeal1: 'seed-opp-qual-1',
    qualificationDeal2: 'seed-opp-qual-2',
    proposalDeal1: 'seed-opp-prop-1',
    proposalDeal2: 'seed-opp-prop-2',
    proposalDeal3: 'seed-opp-prop-3',
  },
  tickets: {
    systemOutage: 'seed-ticket-system-outage',
    loginFailure: 'seed-ticket-login-failure',
    darkModeRequest: 'seed-ticket-dark-mode',
    billingInquiry: 'seed-ticket-billing',
    api500Error: 'seed-ticket-api-500',
    dashboardPerformance: 'seed-ticket-dashboard-perf',
  },
  slaPolicy: {
    default: 'seed-sla-policy-default',
    premium: 'seed-sla-policy-premium',
  },
  tasks: {
    callSarah: 'seed-task-call-sarah',
    followUpTechCorp: 'seed-task-followup-techcorp',
    prepareQ3Report: 'seed-task-q3-report',
    callAcmeCorp: 'seed-task-call-acme',
    reviewQ3Report: 'seed-task-review-q3',
    sendContract: 'seed-task-send-contract',
    scheduleTechReview: 'seed-task-schedule-tech',
  },
  // Supplementary Data IDs
  dealProducts: {
    enterpriseLicense: 'seed-product-enterprise-license',
    implementation: 'seed-product-implementation',
  },
  dealFiles: {
    acmeMsa: 'seed-file-acme-msa',
    requirementsDoc: 'seed-file-requirements-doc',
  },
  dealActivities: {
    agentAdvance: 'seed-activity-agent-advance',
    emailProposal: 'seed-activity-email-proposal',
    agentMeeting: 'seed-activity-agent-meeting',
    callRobert: 'seed-activity-call-robert',
    stageChange: 'seed-activity-stage-change',
  },
  ticketActivities: {
    customerMessage: 'seed-tkt-activity-customer-msg',
    systemPriority: 'seed-tkt-activity-system-priority',
    agentReply: 'seed-tkt-activity-agent-reply',
    priorityChange: 'seed-tkt-activity-priority-change',
    internalNote: 'seed-tkt-activity-internal-note',
    slaBreach: 'seed-tkt-activity-sla-breach',
  },
  ticketAttachments: {
    errorLogs: 'seed-tkt-attach-error-logs',
    screenshot: 'seed-tkt-attach-screenshot',
    devopsAnalysis: 'seed-tkt-attach-devops-analysis',
  },
  // New supplementary data IDs
  agentActions: {
    leadUpdate: 'seed-agent-action-lead-update',
    emailDraft: 'seed-agent-action-email-draft',
    dealStageChange: 'seed-agent-action-deal-stage',
    taskCreate: 'seed-agent-action-task-create',
  },
  contactActivities: {
    emailOpened: 'seed-contact-act-email-opened',
    meetingCompleted: 'seed-contact-act-meeting',
    dealStageUpdated: 'seed-contact-act-deal-stage',
    callLogged: 'seed-contact-act-call',
    whatsappMessage: 'seed-contact-act-whatsapp',
    documentSigned: 'seed-contact-act-document',
    ticketResolved: 'seed-contact-act-ticket',
    noteAdded: 'seed-contact-act-note',
    emailSent: 'seed-contact-act-email-sent',
    meetingScheduled: 'seed-contact-act-meeting-scheduled',
  },
  dashboardActivities: {
    aliceActivity: 'seed-dashboard-act-alice',
    bobActivity: 'seed-dashboard-act-bob',
  },
  // Additional users and contacts for the new data
  additionalUsers: {
    aliceSmith: 'seed-user-alice-smith',
    bobJones: 'seed-user-bob-jones',
  },
  additionalContacts: {
    sarahJenkins: 'seed-contact-sarah-jenkins',
  },
  additionalAccounts: {
    techFlowInc: 'seed-account-techflow',
  },
  // New comprehensive UI data IDs
  contactNotes: {
    securityFeatures: 'seed-note-security-features',
    budgetApproved: 'seed-note-budget-approved',
  },
  contactAIInsights: {
    sarahJenkins: 'seed-ai-insight-sarah-jenkins',
  },
  calendarEvents: {
    q3Review: 'seed-event-q3-review',
    productDemoTechCorp: 'seed-event-product-demo',
    followUpCallSarah: 'seed-event-followup-sarah',
    proposalDeadline: 'seed-event-proposal-deadline',
  },
  teamMessages: {
    sarahClosedDeal: 'seed-msg-sarah-closed',
    mikeGreatWork: 'seed-msg-mike-great',
    emilyMeetingNotes: 'seed-msg-emily-notes',
  },
  pipelineSnapshots: {
    qualification: 'seed-pipeline-qualification',
    proposal: 'seed-pipeline-proposal',
    negotiation: 'seed-pipeline-negotiation',
    closedWon: 'seed-pipeline-closed-won',
  },
  trafficSources: {
    direct: 'seed-traffic-direct',
    organic: 'seed-traffic-organic',
    referral: 'seed-traffic-referral',
    social: 'seed-traffic-social',
  },
  growthMetrics: {
    jan: 'seed-growth-jan',
    feb: 'seed-growth-feb',
    mar: 'seed-growth-mar',
    apr: 'seed-growth-apr',
    may: 'seed-growth-may',
    jun: 'seed-growth-jun',
    jul: 'seed-growth-jul',
    aug: 'seed-growth-aug',
    sep: 'seed-growth-sep',
    oct: 'seed-growth-oct',
    nov: 'seed-growth-nov',
    dec: 'seed-growth-dec',
  },
  dealsWonMetrics: {
    jul: 'seed-deals-won-jul',
    aug: 'seed-deals-won-aug',
    sep: 'seed-deals-won-sep',
    oct: 'seed-deals-won-oct',
    nov: 'seed-deals-won-nov',
    dec: 'seed-deals-won-dec',
  },
  ticketNextSteps: {
    verifyDbFix: 'seed-step-verify-db',
    confirmResolution: 'seed-step-confirm-resolution',
    documentRootCause: 'seed-step-document-root',
  },
  relatedTickets: {
    slowDashboard: 'seed-related-slow-dashboard',
    databaseTimeout: 'seed-related-db-timeout',
    apiLatency: 'seed-related-api-latency',
  },
  ticketAIInsights: {
    systemOutage: 'seed-ticket-ai-insight-outage',
  },
  salesPerformance: {
    sarahJohnson: 'seed-perf-sarah-johnson',
    mikeChen: 'seed-perf-mike-chen',
    emilyDavis: 'seed-perf-emily-davis',
    jamesWilson: 'seed-perf-james-wilson',
  },
  dashboardTasks: {
    callAcme: 'seed-dash-task-call-acme',
    reviewQ3: 'seed-dash-task-review-q3',
    emailFollowup: 'seed-dash-task-email-followup',
  },
  contactDeals: {
    enterpriseLicense: 'seed-contact-deal-enterprise',
    professionalServices: 'seed-contact-deal-services',
    supportRenewal: 'seed-contact-deal-renewal',
  },
  contactTasks: {
    followUpContract: 'seed-contact-task-followup',
    scheduleTechDemo: 'seed-contact-task-demo',
    sendProposal: 'seed-contact-task-proposal',
  },
  // =========================================================================
  // NEW FLOW COVERAGE IDs (FLOW-001 to FLOW-038)
  // =========================================================================
  workspaces: {
    intelliflow: 'seed-workspace-intelliflow',
    demo: 'seed-workspace-demo',
  },
  teams: {
    sales: 'seed-team-sales',
    support: 'seed-team-support',
    engineering: 'seed-team-engineering',
  },
  teamMembers: {
    sarahSales: 'seed-team-member-sarah-sales',
    mikeSales: 'seed-team-member-mike-sales',
    emilySupport: 'seed-team-member-emily-support',
  },
  emailTemplates: {
    welcome: 'seed-email-template-welcome',
    followUp: 'seed-email-template-followup',
    proposal: 'seed-email-template-proposal',
  },
  emailRecords: {
    welcomeSarah: 'seed-email-welcome-sarah',
    proposalAcme: 'seed-email-proposal-acme',
    followUpDavid: 'seed-email-followup-david',
  },
  chatConversations: {
    supportChat1: 'seed-chat-conv-support-1',
    whatsappInquiry: 'seed-chat-conv-whatsapp',
    slackIntegration: 'seed-chat-conv-slack',
  },
  chatMessages: {
    msg1: 'seed-chat-msg-1',
    msg2: 'seed-chat-msg-2',
    msg3: 'seed-chat-msg-3',
  },
  callRecords: {
    discoverySarah: 'seed-call-discovery-sarah',
    demoTechCorp: 'seed-call-demo-techcorp',
    supportFollowup: 'seed-call-support-followup',
  },
  documents: {
    proposalAcme: 'seed-doc-proposal-acme',
    contract2024: 'seed-doc-contract-2024',
    requirementsSpec: 'seed-doc-requirements',
  },
  caseDocuments: {
    employmentAgreement: 'seed-casedoc-employment-001',
    ndaTechCorp: 'seed-casedoc-nda-techcorp',
    motionToDismiss: 'seed-casedoc-motion-dismiss',
    evidenceEmailLog: 'seed-casedoc-evidence-email',
    serviceAgreement: 'seed-casedoc-service-cloud',
  },
  feedbackSurveys: {
    npsSarah: 'seed-feedback-nps-sarah',
    csatDavid: 'seed-feedback-csat-david',
    cesMike: 'seed-feedback-ces-mike',
  },
  dealRenewals: {
    acmeRenewal: 'seed-renewal-acme',
    techCorpRenewal: 'seed-renewal-techcorp',
  },
  accountHealthScores: {
    acmeHealth: 'seed-health-acme',
    techCorpHealth: 'seed-health-techcorp',
    globalSoftHealth: 'seed-health-globalsoft',
  },
  agentSkills: {
    sarahTechnical: 'seed-skill-sarah-technical',
    sarahNegotiation: 'seed-skill-sarah-negotiation',
    mikeSupport: 'seed-skill-mike-support',
  },
  agentAvailability: {
    sarahAvailable: 'seed-avail-sarah',
    mikeAvailable: 'seed-avail-mike',
    emilyAvailable: 'seed-avail-emily',
  },
  routingRules: {
    enterpriseDeals: 'seed-routing-enterprise',
    technicalSupport: 'seed-routing-technical',
    urgentEscalation: 'seed-routing-urgent',
  },
  ticketCategories: {
    billing: 'seed-category-billing',
    technical: 'seed-category-technical',
    featureRequest: 'seed-category-feature',
    general: 'seed-category-general',
  },
  slaBreaches: {
    responseBreachOutage: 'seed-breach-response-outage',
    resolutionBreachLogin: 'seed-breach-resolution-login',
  },
  escalationHistory: {
    outageEscalation: 'seed-escalation-outage',
    billingEscalation: 'seed-escalation-billing',
  },
  workflowDefinitions: {
    leadQualification: 'seed-workflow-lead-qualification',
    dealApproval: 'seed-workflow-deal-approval',
    ticketRouting: 'seed-workflow-ticket-routing',
  },
  workflowExecutions: {
    leadQual1: 'seed-wf-exec-lead-1',
    dealApproval1: 'seed-wf-exec-deal-1',
  },
  businessRules: {
    discountApproval: 'seed-rule-discount-approval',
    autoAssignment: 'seed-rule-auto-assignment',
    escalationTrigger: 'seed-rule-escalation',
  },
  dashboardConfigs: {
    salesDashboard: 'seed-dashboard-sales',
    supportDashboard: 'seed-dashboard-support',
    executiveDashboard: 'seed-dashboard-executive',
  },
  kpiDefinitions: {
    revenueTarget: 'seed-kpi-revenue-target',
    ticketResolution: 'seed-kpi-ticket-resolution',
    customerSatisfaction: 'seed-kpi-csat',
  },
  reportDefinitions: {
    salesPipeline: 'seed-report-sales-pipeline',
    supportMetrics: 'seed-report-support-metrics',
    revenueAnalysis: 'seed-report-revenue',
  },
  aiInsights: {
    dealRiskAcme: 'seed-ai-insight-deal-risk-acme',
    churnRiskTechCorp: 'seed-ai-insight-churn-techcorp',
    upsellOpportunity: 'seed-ai-insight-upsell',
  },
  healthChecks: {
    apiGateway: 'seed-health-check-api',
    database: 'seed-health-check-db',
    aiWorker: 'seed-health-check-ai',
  },
  alertIncidents: {
    highLatency: 'seed-alert-high-latency',
    errorSpike: 'seed-alert-error-spike',
  },
  performanceMetrics: {
    apiLatency: 'seed-perf-api-latency',
    dbQueryTime: 'seed-perf-db-query',
    aiResponseTime: 'seed-perf-ai-response',
  },
  webhookEndpoints: {
    slackNotifications: 'seed-webhook-slack',
    zapierIntegration: 'seed-webhook-zapier',
    customCRM: 'seed-webhook-custom-crm',
  },
  apiKeys: {
    mobileApp: 'seed-apikey-mobile-app',
    integration: 'seed-apikey-integration',
    internal: 'seed-apikey-internal',
  },
  apiVersions: {
    v1: 'seed-api-version-v1',
    v2: 'seed-api-version-v2',
  },
};

// Export SEED_IDS for use in tests
export { SEED_IDS };

// =============================================================================
// Cleanup Functions
// =============================================================================

async function cleanDatabase() {
  console.log('🧹 Cleaning existing seed data...');

  // Delete in correct order to respect foreign key constraints

  // =========================================================================
  // NEW FLOW COVERAGE MODELS (clean first - most dependent)
  // =========================================================================

  // API & Webhooks (leaf tables)
  await prisma.aPIUsageRecord.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.aPIKey.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.aPIVersion.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.webhookDelivery.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.webhookEndpoint.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Monitoring & Performance
  await prisma.performanceMetric.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.alertIncident.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.healthCheck.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // AI Insights
  await prisma.aIInsight.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Reports & Dashboards
  await prisma.reportExecution.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.reportSchedule.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.reportDefinition.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.kPIDefinition.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.dashboardConfig.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Workflow & Business Rules
  await prisma.businessRuleExecution.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.businessRule.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.workflowExecution.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.workflowDefinition.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Ticket Categories & SLA Breaches
  await prisma.escalationHistory.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.sLABreach.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.ticketCategory.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Agent Skills & Routing
  await prisma.routingAudit.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.routingRule.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.agentAvailability.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.agentSkill.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Deal Renewals & Health
  await prisma.accountHealthScore.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.dealRenewal.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Customer Feedback
  await prisma.feedbackSurvey.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Documents
  await prisma.documentShare.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.documentAccessLog.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.document.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Case Documents (IFC-152)
  await prisma.caseDocumentAudit.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.caseDocumentACL.deleteMany({
    where: { document_id: { startsWith: 'seed-casedoc-' } },
  });
  await prisma.caseDocument.deleteMany({
    where: { id: { startsWith: 'seed-casedoc-' } },
  });

  // Calls
  await prisma.callRecord.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Chat
  await prisma.chatMessage.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.chatConversation.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Email
  await prisma.emailAttachment.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.emailRecord.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.emailTemplate.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // Teams & Workspaces
  await prisma.teamMember.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.team.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.workspaceMember.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.workspace.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  // =========================================================================
  // ORIGINAL MODELS
  // =========================================================================

  // First: Agent actions
  await prisma.agentAction.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  // Contact activities
  await prisma.contactActivity.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  // New UI data models
  await prisma.contactNote.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.contactAIInsight.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.calendarEvent.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.teamMessage.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.pipelineSnapshot.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.trafficSource.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.growthMetric.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.dealsWonMetric.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.salesPerformance.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  // Ticket-related child tables
  await prisma.ticketNextStep.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.relatedTicket.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.ticketAIInsight.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.ticketAttachment.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.ticketActivity.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.sLANotification.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.ticket.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.sLAPolicy.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.aIScore.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.auditLog.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.domainEvent.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.task.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  // Deal-related child tables
  await prisma.dealProduct.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.dealFile.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.activityEvent.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.opportunity.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.contact.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.lead.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.account.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  console.log('✅ Existing seed data cleaned');
}

// =============================================================================
// Seed Functions
// =============================================================================

/**
 * RBAC Permission Matrix
 * Defines default permissions for each role
 * Based on apps/api/src/security/rbac.ts DEFAULT_PERMISSIONS
 */
type PermissionAction = 'read' | 'write' | 'delete' | 'export' | 'manage' | 'admin';
type ResourceType = 'lead' | 'contact' | 'account' | 'opportunity' | 'task' | 'user' | 'ai_score' | 'appointment' | 'system';
type RoleName = 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'USER' | 'VIEWER';

const RBAC_ROLE_LEVELS: Record<RoleName, number> = {
  ADMIN: 100,
  MANAGER: 75,
  SALES_REP: 50,
  USER: 25,
  VIEWER: 10,
};

const RBAC_DEFAULT_PERMISSIONS: Record<RoleName, Record<ResourceType, PermissionAction[]>> = {
  ADMIN: {
    lead: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    contact: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    account: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    opportunity: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    task: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    user: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    ai_score: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    appointment: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    system: ['read', 'write', 'admin'],
  },
  MANAGER: {
    lead: ['read', 'write', 'delete', 'export', 'manage'],
    contact: ['read', 'write', 'delete', 'export', 'manage'],
    account: ['read', 'write', 'delete', 'export', 'manage'],
    opportunity: ['read', 'write', 'delete', 'export', 'manage'],
    task: ['read', 'write', 'delete', 'export', 'manage'],
    user: ['read', 'manage'],
    ai_score: ['read', 'write', 'manage'],
    appointment: ['read', 'write', 'delete', 'export', 'manage'],
    system: ['read'],
  },
  SALES_REP: {
    lead: ['read', 'write', 'delete', 'export'],
    contact: ['read', 'write', 'delete', 'export'],
    account: ['read', 'write', 'export'],
    opportunity: ['read', 'write', 'delete', 'export'],
    task: ['read', 'write', 'delete'],
    user: ['read'],
    ai_score: ['read', 'write'],
    appointment: ['read', 'write', 'delete'],
    system: [],
  },
  USER: {
    lead: ['read', 'write'],
    contact: ['read', 'write'],
    account: ['read'],
    opportunity: ['read', 'write'],
    task: ['read', 'write'],
    user: ['read'],
    ai_score: ['read'],
    appointment: ['read', 'write'],
    system: [],
  },
  VIEWER: {
    lead: ['read'],
    contact: ['read'],
    account: ['read'],
    opportunity: ['read'],
    task: ['read'],
    user: ['read'],
    ai_score: ['read'],
    appointment: ['read'],
    system: [],
  },
};

async function seedRBACPermissions() {
  console.log('🔐 Seeding RBAC permissions...');

  // Collect all unique permissions from the matrix
  const permissionSet = new Set<string>();
  const permissions: Array<{ name: string; resource: string; action: string; description: string }> = [];

  for (const [resources] of Object.entries(RBAC_DEFAULT_PERMISSIONS)) {
    for (const [resource, actions] of Object.entries(resources)) {
      for (const action of actions) {
        const permissionName = `${resource}:${action}`;
        if (!permissionSet.has(permissionName)) {
          permissionSet.add(permissionName);
          permissions.push({
            name: permissionName,
            resource,
            action,
            description: `Allow ${action} operations on ${resource}`,
          });
        }
      }
    }
  }

  // Upsert all permissions
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: permission,
      create: permission,
    });
  }

  console.log(`✅ Created ${permissions.length} permissions`);
  return permissions;
}

async function seedRBACRoles() {
  console.log('👤 Seeding RBAC roles...');

  const roles: Array<{ name: string; description: string; level: number; isSystem: boolean }> = [
    {
      name: 'ADMIN',
      description: 'Full system access with all permissions',
      level: RBAC_ROLE_LEVELS.ADMIN,
      isSystem: true,
    },
    {
      name: 'MANAGER',
      description: 'Team management and full CRM access',
      level: RBAC_ROLE_LEVELS.MANAGER,
      isSystem: true,
    },
    {
      name: 'SALES_REP',
      description: 'Full CRM access for own records',
      level: RBAC_ROLE_LEVELS.SALES_REP,
      isSystem: true,
    },
    {
      name: 'USER',
      description: 'Basic read access with limited write permissions',
      level: RBAC_ROLE_LEVELS.USER,
      isSystem: true,
    },
    {
      name: 'VIEWER',
      description: 'Read-only access to all records',
      level: RBAC_ROLE_LEVELS.VIEWER,
      isSystem: true,
    },
  ];

  for (const role of roles) {
    await prisma.rBACRole.upsert({
      where: { name: role.name },
      update: role,
      create: role,
    });
  }

  console.log(`✅ Created ${roles.length} RBAC roles`);
  return roles;
}

async function seedRBACRolePermissions() {
  console.log('🔗 Seeding role-permission mappings...');

  let mappingCount = 0;

  for (const [roleName, resources] of Object.entries(RBAC_DEFAULT_PERMISSIONS)) {
    // Get the role from database
    const role = await prisma.rBACRole.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      console.warn(`⚠️  Role ${roleName} not found, skipping permissions`);
      continue;
    }

    // Map all permissions for this role
    for (const [resource, actions] of Object.entries(resources)) {
      for (const action of actions) {
        const permissionName = `${resource}:${action}`;

        // Get the permission from database
        const permission = await prisma.permission.findUnique({
          where: { name: permissionName },
        });

        if (!permission) {
          console.warn(`⚠️  Permission ${permissionName} not found, skipping`);
          continue;
        }

        // Create role-permission mapping
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: { granted: true },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            granted: true,
          },
        });

        mappingCount++;
      }
    }
  }

  console.log(`✅ Created ${mappingCount} role-permission mappings`);
}

async function seedUsers(tenantId: string) {
  console.log('👥 Seeding users...');

  const users = [
    {
      id: SEED_IDS.users.admin,
      email: 'admin@intelliflow.dev',
      name: 'Admin User',
      role: UserRole.ADMIN,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
      tenantId,
    },
    {
      id: SEED_IDS.users.manager,
      email: 'alex@intelliflow.dev',
      name: 'Alex Thompson',
      role: UserRole.MANAGER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
      tenantId,
    },
    // Top Performers from Dashboard widgets
    {
      id: SEED_IDS.users.sarahJohnson,
      email: 'sarah.johnson@intelliflow.dev',
      name: 'Sarah Johnson',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
      tenantId,
    },
    {
      id: SEED_IDS.users.mikeDavis,
      email: 'mike.davis@intelliflow.dev',
      name: 'Mike Davis',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
      tenantId,
    },
    {
      id: SEED_IDS.users.emilyDavis,
      email: 'emily.davis@intelliflow.dev',
      name: 'Emily Davis',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily',
      tenantId,
    },
    {
      id: SEED_IDS.users.jamesWilson,
      email: 'james.wilson@intelliflow.dev',
      name: 'James Wilson',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=james',
      tenantId,
    },
    // Support Team
    {
      id: SEED_IDS.users.alexMorgan,
      email: 'alex.morgan@intelliflow.dev',
      name: 'Alex Morgan',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alexm',
      tenantId,
    },
    {
      id: SEED_IDS.users.sarahJenkins,
      email: 'sarah.jenkins@intelliflow.dev',
      name: 'Sarah Jenkins',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarahj',
      tenantId,
    },
    {
      id: SEED_IDS.users.mikeRoss,
      email: 'mike.ross@intelliflow.dev',
      name: 'Mike Ross',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=miker',
      tenantId,
    },
    {
      id: SEED_IDS.users.davidKim,
      email: 'david.kim@intelliflow.dev',
      name: 'David Kim',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=davidk',
      tenantId,
    },
    // Deal owner from detail page
    {
      id: SEED_IDS.users.janeDoe,
      email: 'jane.doe@intelliflow.dev',
      name: 'Jane Doe',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=janed',
      tenantId,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        ...user,
      },
      create: {
        ...user,
      },
    });
  }

  console.log(`✅ Created ${users.length} users`);
  return users;
}

async function seedAccounts(tenantId: string) {
  console.log('🏢 Seeding accounts...');

  const accounts = [
    // From Leads/Contacts pages
    {
      id: SEED_IDS.accounts.techCorp,
      name: 'TechCorp',
      website: 'https://techcorp.example.com',
      industry: 'Software',
      employees: 500,
      revenue: 50000000,
      description: 'Leading enterprise software provider',
      ownerId: SEED_IDS.users.sarahJohnson,tenantId,
    },
    {
      id: SEED_IDS.accounts.designCo,
      name: 'DesignCo',
      website: 'https://designco.example.com',
      industry: 'Creative Agency',
      employees: 50,
      revenue: 5000000,
      description: 'Award-winning design agency',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,   },
    {
      id: SEED_IDS.accounts.smithConsulting,
      name: 'Smith Consulting',
      website: 'https://smithconsulting.example.com',
      industry: 'Consulting',
      employees: 25,
      revenue: 2500000,
      description: 'Boutique consulting firm',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.accounts.globalSoft,
      name: 'GlobalSoft',
      website: 'https://globalsoft.example.com',
      industry: 'Enterprise',
      employees: 2000,
      revenue: 200000000,
      description: 'Global enterprise software solutions',
      ownerId: SEED_IDS.users.jamesWilson,     tenantId,   },
    {
      id: SEED_IDS.accounts.finTech,
      name: 'FinTech IO',
      website: 'https://fintech.io',
      industry: 'Finance',
      employees: 150,
      revenue: 15000000,
      description: 'Modern financial technology solutions',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,   },
    // From Deals page
    {
      id: SEED_IDS.accounts.acmeCorp,
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      industry: 'Technology',
      employees: 1000,
      revenue: 100000000,
      description: 'Enterprise technology solutions',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.accounts.techStart,
      name: 'TechStart Inc',
      website: 'https://techstart.example.com',
      industry: 'SaaS',
      employees: 30,
      revenue: 3000000,
      description: 'Fast-growing SaaS startup',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.accounts.globalTech,
      name: 'GlobalTech Solutions',
      website: 'https://globaltech.example.com',
      industry: 'IT Services',
      employees: 500,
      revenue: 75000000,
      description: 'Global IT services provider',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,   },
    {
      id: SEED_IDS.accounts.dataCorp,
      name: 'DataCorp Analytics',
      website: 'https://datacorp.example.com',
      industry: 'Data Analytics',
      employees: 200,
      revenue: 25000000,
      description: 'Data analytics and BI solutions',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.accounts.innovateCo,
      name: 'InnovateCo',
      website: 'https://innovateco.example.com',
      industry: 'Innovation Consulting',
      employees: 75,
      revenue: 10000000,
      description: 'Innovation and transformation consulting',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,   },
    {
      id: SEED_IDS.accounts.megaCorp,
      name: 'MegaCorp Industries',
      website: 'https://megacorp.example.com',
      industry: 'Manufacturing',
      employees: 5000,
      revenue: 500000000,
      description: 'Global manufacturing leader',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.accounts.startupXYZ,
      name: 'StartupXYZ',
      website: 'https://startupxyz.example.com',
      industry: 'Technology',
      employees: 15,
      revenue: 500000,
      description: 'Early-stage tech startup',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,   },
    {
      id: SEED_IDS.accounts.devTools,
      name: 'DevTools Inc',
      website: 'https://devtools.example.com',
      industry: 'Developer Tools',
      employees: 45,
      revenue: 4000000,
      description: 'Developer productivity tools',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
  ];

  for (const account of accounts) {
    await prisma.account.upsert({
      where: { id: account.id },
      update: account,
      create: account,
    });
  }

  console.log(`✅ Created ${accounts.length} accounts`);
  return accounts;
}

async function seedLeads(tenantId: string) {
  console.log('🎯 Seeding leads...');

  // Data from apps/web/src/app/leads/(list)/page.tsx
  const leads = [
    {
      id: SEED_IDS.leads.sarahMiller,
      email: 'sarah@techcorp.com',
      firstName: 'Sarah',
      lastName: 'Miller',
      company: 'TechCorp',
      title: 'CTO',
      phone: '+1 (555) 123-4567',
      source: LeadSource.WEBSITE,
      status: LeadStatus.QUALIFIED,
      score: 85,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId
    },
    {
      id: SEED_IDS.leads.davidChen,
      email: 'd.chen@designco.com',
      firstName: 'David',
      lastName: 'Chen',
      company: 'DesignCo',
      title: 'Manager',
      phone: '+1 (555) 987-6543',
      source: LeadSource.REFERRAL,
      status: LeadStatus.NEW,
      score: 42,
      ownerId: SEED_IDS.users.mikeDavis,     tenantId
    },
    {
      id: SEED_IDS.leads.amandaSmith,
      email: 'amanda@gmail.com',
      firstName: 'Amanda',
      lastName: 'Smith',
      company: 'Freelance',
      title: null,
      phone: '+1 (555) 321-7890',
      source: LeadSource.SOCIAL,
      status: LeadStatus.UNQUALIFIED,
      score: 15,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId
    },
    {
      id: SEED_IDS.leads.jamesWilson,
      email: 'j.wilson@globalsoft.com',
      firstName: 'James',
      lastName: 'Wilson',
      company: 'GlobalSoft',
      title: 'VP Sales',
      phone: '+1 (555) 456-7890',
      source: LeadSource.EVENT,
      // Note: 'NEGOTIATING' in UI maps to LeadStatus - using CONTACTED as closest match
      status: LeadStatus.CONTACTED,
      score: 92,
      ownerId: SEED_IDS.users.jamesWilson,     tenantId
    },
    {
      id: SEED_IDS.leads.elenaRodriguez,
      email: 'elena@fintech.io',
      firstName: 'Elena',
      lastName: 'Rodriguez',
      company: 'FinTech',
      title: 'Product Manager',
      phone: '+1 (555) 555-0199',
      source: LeadSource.EMAIL,
      status: LeadStatus.CONTACTED,
      score: 55,
      ownerId: SEED_IDS.users.mikeDavis,     tenantId
    },
  ];

  for (const lead of leads) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: lead,
      create: lead,
    });
  }

  console.log(`✅ Created ${leads.length} leads`);
  return leads;
}

async function seedContacts(tenantId: string) {
  console.log('📇 Seeding contacts...');

  // Data from apps/web/src/app/contacts/(list)/page.tsx and deals pages
  const contacts = [
    // From Contacts list page
    {
      id: SEED_IDS.contacts.sarahMiller,
      email: 'sarah@techcorp.com',
      firstName: 'Sarah',
      lastName: 'Miller',
      title: 'CTO',
      phone: '+1 (555) 123-4567',
      department: 'Technology',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.techCorp
    },
    {
      id: SEED_IDS.contacts.davidChen,
      email: 'd.chen@designco.com',
      firstName: 'David',
      lastName: 'Chen',
      title: 'Manager',
      phone: '+1 (555) 987-6543',
      department: 'Creative',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,     accountId: SEED_IDS.accounts.designCo
    },
    {
      id: SEED_IDS.contacts.amandaSmith,
      email: 'amanda@smithconsulting.com',
      firstName: 'Amanda',
      lastName: 'Smith',
      title: 'Freelance Consultant',
      phone: '+1 (555) 321-7890',
      department: 'Consulting',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.smithConsulting
    },
    {
      id: SEED_IDS.contacts.jamesWilson,
      email: 'j.wilson@globalsoft.com',
      firstName: 'James',
      lastName: 'Wilson',
      title: 'VP Sales',
      phone: '+1 (555) 456-7890',
      department: 'Sales',
      ownerId: SEED_IDS.users.jamesWilson,     tenantId,     accountId: SEED_IDS.accounts.globalSoft
    },
    {
      id: SEED_IDS.contacts.elenaRodriguez,
      email: 'elena@fintech.io',
      firstName: 'Elena',
      lastName: 'Rodriguez',
      title: 'Product Manager',
      phone: '+1 (555) 555-0199',
      department: 'Product',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,     accountId: SEED_IDS.accounts.finTech
    },
    // From Deals page - contacts linked to deals
    {
      id: SEED_IDS.contacts.johnSmith,
      email: 'john.smith@acme.com',
      firstName: 'John',
      lastName: 'Smith',
      title: 'Procurement Manager',
      phone: '+1 (555) 100-2001',
      department: 'Procurement',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.acmeCorp
    },
    {
      id: SEED_IDS.contacts.emilyChen,
      email: 'emily.chen@techstart.com',
      firstName: 'Emily',
      lastName: 'Chen',
      title: 'CEO',
      phone: '+1 (555) 100-2002',
      department: 'Executive',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.techStart
    },
    {
      id: SEED_IDS.contacts.michaelBrown,
      email: 'michael.brown@globaltech.com',
      firstName: 'Michael',
      lastName: 'Brown',
      title: 'IT Director',
      phone: '+1 (555) 100-2003',
      department: 'IT',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,     accountId: SEED_IDS.accounts.globalTech
    },
    {
      id: SEED_IDS.contacts.lisaWang,
      email: 'lisa.wang@datacorp.com',
      firstName: 'Lisa',
      lastName: 'Wang',
      title: 'CIO',
      phone: '+1 (555) 100-2004',
      department: 'IT',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.dataCorp
    },
    // From Deal detail page
    {
      id: SEED_IDS.contacts.robertFox,
      email: 'robert.fox@acme.com',
      firstName: 'Robert',
      lastName: 'Fox',
      title: 'CTO',
      phone: '+1 (555) 100-2005',
      department: 'Technology',
      ownerId: SEED_IDS.users.janeDoe,     tenantId,     accountId: SEED_IDS.accounts.acmeCorp
    },
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: contact,
      create: contact,
    });
  }

  console.log(`✅ Created ${contacts.length} contacts`);
  return contacts;
}

async function seedOpportunities(tenantId: string) {
  console.log('💰 Seeding opportunities (deals)...');

  // Data from apps/web/src/app/deals/page.tsx
  const opportunities = [
    {
      id: SEED_IDS.opportunities.enterpriseLicenseAcme,
      name: 'Enterprise License - Acme Corp',
      value: 75000,
      stage: OpportunityStage.QUALIFICATION,
      probability: 20,
      expectedCloseDate: new Date('2025-02-15'),
      description: 'Enterprise license for Acme Corporation',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.acmeCorp,
      contactId: SEED_IDS.contacts.johnSmith,
    },
    {
      id: SEED_IDS.opportunities.annualSubscriptionTechStart,
      name: 'Annual Subscription - TechStart',
      value: 24000,
      stage: OpportunityStage.QUALIFICATION,
      probability: 25,
      expectedCloseDate: new Date('2025-01-30'),
      description: 'Annual subscription for TechStart Inc',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.techStart,
      contactId: SEED_IDS.contacts.emilyChen,
    },
    {
      id: SEED_IDS.opportunities.customIntegrationGlobalTech,
      name: 'Custom Integration - GlobalTech',
      value: 120000,
      stage: OpportunityStage.NEEDS_ANALYSIS,
      probability: 40,
      expectedCloseDate: new Date('2025-03-01'),
      description: 'Custom integration project for GlobalTech Solutions',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,     accountId: SEED_IDS.accounts.globalTech,
      contactId: SEED_IDS.contacts.michaelBrown,
    },
    {
      id: SEED_IDS.opportunities.platformMigrationDataCorp,
      name: 'Platform Migration - DataCorp',
      value: 85000,
      stage: OpportunityStage.PROPOSAL,
      probability: 60,
      expectedCloseDate: new Date('2025-02-28'),
      description: 'Platform migration for DataCorp Analytics',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.dataCorp,
      contactId: SEED_IDS.contacts.lisaWang,
    },
    {
      id: SEED_IDS.opportunities.consultingInnovateCo,
      name: 'Consulting Package - InnovateCo',
      value: 45000,
      stage: OpportunityStage.PROPOSAL,
      probability: 55,
      expectedCloseDate: new Date('2025-02-10'),
      description: 'Consulting engagement for InnovateCo',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,     accountId: SEED_IDS.accounts.innovateCo,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.enterpriseSuiteMegaCorp,
      name: 'Enterprise Suite - MegaCorp',
      value: 250000,
      stage: OpportunityStage.NEGOTIATION,
      probability: 75,
      expectedCloseDate: new Date('2025-01-31'),
      description: 'Full enterprise suite for MegaCorp Industries',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.megaCorp,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.teamLicenseStartupXYZ,
      name: 'Team License - StartupXYZ',
      value: 12000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-12-20'),
      description: 'Team license for StartupXYZ',
      closedAt: new Date('2024-12-20'),
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,     accountId: SEED_IDS.accounts.startupXYZ,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.apiAccessDevTools,
      name: 'API Access - DevTools',
      value: 18000,
      stage: OpportunityStage.CLOSED_LOST,
      probability: 0,
      expectedCloseDate: new Date('2024-12-15'),
      description: 'API access subscription for DevTools Inc',
      closedAt: new Date('2024-12-15'),
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     accountId: SEED_IDS.accounts.devTools,
      contactId: null,
    },
    // From Deal detail page - Acme Corp Software License
    {
      id: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      name: 'Acme Corp Software License',
      value: 125000,
      stage: OpportunityStage.PROPOSAL,
      probability: 60,
      expectedCloseDate: new Date('2025-01-24'),
      description: 'Enterprise License (100 Seats) + Implementation (Standard Package)',
      ownerId: SEED_IDS.users.janeDoe,
      tenantId,
      accountId: SEED_IDS.accounts.acmeCorp,
      contactId: SEED_IDS.contacts.robertFox,
    },
    // =========================================================================
    // HISTORICAL CLOSED DEALS FOR TREND CHART (Last 6 months)
    // =========================================================================
    // May 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedMay1,
      name: 'Professional Services - May Deal 1',
      value: 15000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-05-15'),
      description: 'Consulting services package',
      closedAt: new Date('2024-05-15'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.techCorp,
      contactId: SEED_IDS.contacts.sarahMiller,
    },
    {
      id: SEED_IDS.opportunities.closedMay2,
      name: 'Team License - May Deal 2',
      value: 8000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-05-22'),
      description: 'Team subscription',
      closedAt: new Date('2024-05-22'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.designCo,
      contactId: SEED_IDS.contacts.davidChen,
    },
    // June 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedJun1,
      name: 'Enterprise Setup - June Deal 1',
      value: 25000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-06-10'),
      description: 'Enterprise implementation',
      closedAt: new Date('2024-06-10'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.globalSoft,
      contactId: SEED_IDS.contacts.jamesWilson,
    },
    {
      id: SEED_IDS.opportunities.closedJun2,
      name: 'Annual Subscription - June Deal 2',
      value: 12000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-06-25'),
      description: 'Annual renewal',
      closedAt: new Date('2024-06-25'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.finTech,
      contactId: SEED_IDS.contacts.elenaRodriguez,
    },
    // July 2024 - 1 deal
    {
      id: SEED_IDS.opportunities.closedJul1,
      name: 'Integration Package - July Deal',
      value: 18000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-07-18'),
      description: 'Custom integration',
      closedAt: new Date('2024-07-18'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.innovateCo,
      contactId: null,
    },
    // August 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedAug1,
      name: 'Enterprise License - August Deal 1',
      value: 45000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-08-12'),
      description: 'Enterprise license package',
      closedAt: new Date('2024-08-12'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.megaCorp,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.closedAug2,
      name: 'Professional Services - August Deal 2',
      value: 22000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-08-28'),
      description: 'Consulting engagement',
      closedAt: new Date('2024-08-28'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.dataCorp,
      contactId: SEED_IDS.contacts.lisaWang,
    },
    // September 2024 - 1 deal
    {
      id: SEED_IDS.opportunities.closedSep1,
      name: 'Platform Migration - September Deal',
      value: 35000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-09-20'),
      description: 'Platform upgrade and migration',
      closedAt: new Date('2024-09-20'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.globalTech,
      contactId: SEED_IDS.contacts.michaelBrown,
    },
    // October 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedOct1,
      name: 'Enterprise Suite - October Deal 1',
      value: 55000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-10-15'),
      description: 'Complete enterprise solution',
      closedAt: new Date('2024-10-15'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.acmeCorp,
      contactId: SEED_IDS.contacts.johnSmith,
    },
    {
      id: SEED_IDS.opportunities.closedOct2,
      name: 'Custom Development - October Deal 2',
      value: 28000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-10-28'),
      description: 'Custom feature development',
      closedAt: new Date('2024-10-28'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.techStart,
      contactId: SEED_IDS.contacts.emilyChen,
    },
    // =========================================================================
    // ADDITIONAL ACTIVE DEALS FOR PIPELINE VARIETY
    // =========================================================================
    // More Qualification stage
    {
      id: SEED_IDS.opportunities.qualificationDeal1,
      name: 'Starter Package - Prospect Alpha',
      value: 5000,
      stage: OpportunityStage.QUALIFICATION,
      probability: 15,
      expectedCloseDate: new Date('2025-03-15'),
      description: 'Small business starter package',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.startupXYZ,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.qualificationDeal2,
      name: 'Trial to Paid - Prospect Beta',
      value: 8500,
      stage: OpportunityStage.QUALIFICATION,
      probability: 20,
      expectedCloseDate: new Date('2025-03-20'),
      description: 'Converting trial user to paid',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.devTools,
      contactId: null,
    },
    // More Proposal stage
    {
      id: SEED_IDS.opportunities.proposalDeal1,
      name: 'Mid-Market Solution - Company C',
      value: 35000,
      stage: OpportunityStage.PROPOSAL,
      probability: 50,
      expectedCloseDate: new Date('2025-02-28'),
      description: 'Mid-market CRM solution',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.techCorp,
      contactId: SEED_IDS.contacts.sarahMiller,
    },
    {
      id: SEED_IDS.opportunities.proposalDeal2,
      name: 'Integration Services - Company D',
      value: 18000,
      stage: OpportunityStage.PROPOSAL,
      probability: 45,
      expectedCloseDate: new Date('2025-03-05'),
      description: 'Third-party integration services',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.designCo,
      contactId: SEED_IDS.contacts.davidChen,
    },
    {
      id: SEED_IDS.opportunities.proposalDeal3,
      name: 'Annual Renewal - Company E',
      value: 22000,
      stage: OpportunityStage.PROPOSAL,
      probability: 65,
      expectedCloseDate: new Date('2025-02-15'),
      description: 'Annual subscription renewal with expansion',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.finTech,
      contactId: SEED_IDS.contacts.elenaRodriguez,
    },
  ];

  for (const opportunity of opportunities) {
    await prisma.opportunity.upsert({
      where: { id: opportunity.id },
      update: opportunity,
      create: opportunity,
    });
  }

  console.log(`✅ Created ${opportunities.length} opportunities`);
  return opportunities;
}

async function seedSLAPolicies(tenantId: string) {
  console.log('📋 Seeding SLA policies...');

  const policies = [
    {
      id: SEED_IDS.slaPolicy.default,
      name: 'Standard SLA',
      description: 'Default SLA policy for standard support tickets',
      tenantId,
      criticalResponseMinutes: 15,
      highResponseMinutes: 60,
      mediumResponseMinutes: 240,
      lowResponseMinutes: 480,
      criticalResolutionMinutes: 120,
      highResolutionMinutes: 480,
      mediumResolutionMinutes: 1440,
      lowResolutionMinutes: 4320,
      warningThresholdPercent: 25,
      isDefault: true,
      isActive: true,
    },
    {
      id: SEED_IDS.slaPolicy.premium,
      name: 'Premium SLA',
      description: 'Premium SLA policy for enterprise customers',
      tenantId,
      criticalResponseMinutes: 5,
      highResponseMinutes: 30,
      mediumResponseMinutes: 120,
      lowResponseMinutes: 240,
      criticalResolutionMinutes: 60,
      highResolutionMinutes: 240,
      mediumResolutionMinutes: 720,
      lowResolutionMinutes: 2160,
      warningThresholdPercent: 30,
      isDefault: false,
      isActive: true,
    },
  ];

  for (const policy of policies) {
    await prisma.sLAPolicy.upsert({
      where: { id: policy.id },
      update: policy,
      create: policy,
    });
  }

  console.log(`✅ Created ${policies.length} SLA policies`);
  return policies;
}

async function seedTickets(tenantId: string) {
  console.log('🎫 Seeding tickets...');

  const now = new Date();

  // Data from apps/web/src/app/tickets/page.tsx
  const tickets = [
    {
      id: SEED_IDS.tickets.systemOutage,
      ticketNumber: 'T-10924',
      subject: 'System Outage: West Region',
      description: 'Multiple customers reporting connectivity issues',
      status: TicketStatus.OPEN,
      priority: TicketPriority.CRITICAL,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      slaStatus: SLAStatus.BREACHED,
      slaBreachedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      contactName: 'Robert Chen',
      contactEmail: 'r.chen@acmecorp.com',
      assigneeId: SEED_IDS.users.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.loginFailure,
      ticketNumber: 'T-10921',
      subject: 'Login Failure for Enterprise Account',
      description: 'SSO authentication failing for GlobalTech',
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.HIGH,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      slaStatus: SLAStatus.AT_RISK,
      slaResolutionDue: new Date(now.getTime() + 45 * 60 * 1000), // 45 minutes from now
      contactName: 'David Kim',
      contactEmail: 'd.kim@globaltech.com',
      assigneeId: SEED_IDS.users.mikeRoss,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.darkModeRequest,
      ticketNumber: 'T-10899',
      subject: 'Feature Request: Dark Mode',
      description: 'Customer requesting dark mode for dashboard',
      status: TicketStatus.OPEN,
      priority: TicketPriority.LOW,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      slaStatus: SLAStatus.ON_TRACK,
      slaResolutionDue: new Date(now.getTime() + 22 * 60 * 60 * 1000), // 22 hours from now
      contactName: 'Amanda Wilson',
      contactEmail: 'a.wilson@startup.io',
      assigneeId: null,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.billingInquiry,
      ticketNumber: 'T-10887',
      subject: 'Billing Inquiry - Nov Invoice',
      description: 'Question about charges on November invoice',
      status: TicketStatus.WAITING_ON_CUSTOMER,
      priority: TicketPriority.MEDIUM,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      slaStatus: SLAStatus.ON_TRACK,
      slaResolutionDue: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 4 hours from now
      contactName: 'Elena Rodriguez',
      contactEmail: 'elena@fintech.io',
      assigneeId: SEED_IDS.users.davidKim,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.api500Error,
      ticketNumber: 'T-10755',
      subject: 'Integration API 500 Error',
      description: 'REST API returning 500 errors on POST requests',
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.CRITICAL,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      slaStatus: SLAStatus.BREACHED,
      slaBreachedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
      contactName: 'James Wilson',
      contactEmail: 'j.wilson@techstart.com',
      assigneeId: SEED_IDS.users.alexMorgan,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.dashboardPerformance,
      ticketNumber: 'T-10742',
      subject: 'Dashboard Performance Issues',
      description: 'Slow loading times during peak hours',
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      slaStatus: SLAStatus.AT_RISK,
      slaResolutionDue: new Date(now.getTime() + 28 * 60 * 1000), // 28 minutes from now
      contactName: 'Michael Brown',
      contactEmail: 'm.brown@enterprise.com',
      assigneeId: SEED_IDS.users.sarahJenkins,
      tenantId,
    },
  ];

  for (const ticket of tickets) {
    await prisma.ticket.upsert({
      where: { id: ticket.id },
      update: ticket,
      create: ticket,
    });
  }

  console.log(`✅ Created ${tickets.length} tickets`);
  return tickets;
}

async function seedTasks(tenantId: string) {
  console.log('📋 Seeding tasks...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const oct24 = new Date(2025, 9, 24); // Oct 24, 2025
  const jan20 = new Date(2025, 0, 20); // Jan 20, 2025

  // Data from Dashboard widgets and Deal detail page
  const tasks = [
    // From UpcomingTasksWidget
    {
      id: SEED_IDS.tasks.callSarah,
      title: 'Call Sarah re: contract',
      description: 'Discuss contract terms for the TechCorp deal',
      dueDate: today,
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     contactId: SEED_IDS.contacts.sarahMiller,
    },
    {
      id: SEED_IDS.tasks.followUpTechCorp,
      title: 'Follow up with TechCorp',
      description: 'Send updated proposal after meeting',
      dueDate: tomorrow,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     opportunityId: SEED_IDS.opportunities.enterpriseLicenseAcme,
    },
    {
      id: SEED_IDS.tasks.prepareQ3Report,
      title: 'Prepare Q3 Report',
      description: 'Compile Q3 sales and performance metrics',
      dueDate: oct24,
      priority: TaskPriority.LOW,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.manager,     tenantId,   },
    // From PendingTasksWidget
    {
      id: SEED_IDS.tasks.callAcmeCorp,
      title: 'Call with Acme Corp',
      description: 'Scheduled call at 2:00 PM',
      dueDate: today,
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      ownerId: SEED_IDS.users.janeDoe,     tenantId,     opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.tasks.reviewQ3Report,
      title: 'Review Q3 Report',
      description: 'Review and approve Q3 report at 10:00 AM',
      dueDate: tomorrow,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.manager,     tenantId,   },
    // From Deal detail page - Next Steps
    {
      id: SEED_IDS.tasks.sendContract,
      title: 'Send revised contract',
      description: 'Send updated contract to Acme Corp',
      dueDate: tomorrow,
      priority: TaskPriority.URGENT,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.janeDoe,     tenantId,     opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.tasks.scheduleTechReview,
      title: 'Schedule tech review',
      description: 'Arrange technical review meeting with Acme Corp team',
      dueDate: jan20,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.janeDoe,     tenantId,     opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }

  console.log(`✅ Created ${tasks.length} tasks`);
  return tasks;
}

async function seedAIScores() {
  console.log('🤖 Seeding AI scores...');

  const aiScores = [
    {
      id: 'seed-ai-score-sarah-miller',
      score: 85,
      confidence: 0.92,
      factors: {
        title_score: 30, // CTO - high decision maker
        company_size_score: 25, // 500 employees - good fit
        engagement_score: 20, // Qualified status
        budget_fit_score: 10,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.sarahMiller,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-david-chen',
      score: 42,
      confidence: 0.78,
      factors: {
        title_score: 15, // Manager - mid-level
        company_size_score: 10, // 50 employees - smaller
        engagement_score: 10, // New status
        budget_fit_score: 7,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.davidChen,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-amanda-smith',
      score: 15,
      confidence: 0.65,
      factors: {
        title_score: 5, // Freelance - low
        company_size_score: 2, // Very small
        engagement_score: 5, // Unqualified
        budget_fit_score: 3,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.amandaSmith,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-james-wilson',
      score: 92,
      confidence: 0.96,
      factors: {
        title_score: 35, // VP Sales - key decision maker
        company_size_score: 30, // 2000 employees - enterprise
        engagement_score: 20, // Active negotiation
        budget_fit_score: 7,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.jamesWilson,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-elena-rodriguez',
      score: 55,
      confidence: 0.82,
      factors: {
        title_score: 20, // Product Manager - influential
        company_size_score: 15, // 150 employees - mid-size
        engagement_score: 12, // Contacted
        budget_fit_score: 8,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.elenaRodriguez,
      scoredById: SEED_IDS.users.admin,
    },
  ];

  for (const aiScore of aiScores) {
    await prisma.aIScore.upsert({
      where: { id: aiScore.id },
      update: aiScore,
      create: aiScore,
    });
  }

  console.log(`✅ Created ${aiScores.length} AI scores`);
  return aiScores;
}

async function seedAuditLogs(tenantId: string) {
  console.log('📝 Seeding audit logs...');

  // NOSONAR: Hardcoded private IPs (192.168.x.x) are safe here - this is mock seed data
  // for development/testing only. These are RFC 1918 private addresses, not real user IPs.
  const auditLogs = [
    {
      id: 'seed-audit-001',
      action: 'CREATE',
      entityType: 'Lead',
      entityId: SEED_IDS.leads.sarahMiller,
      oldValue: Prisma.JsonNull,
      newValue: { status: LeadStatus.QUALIFIED, score: 85 },
      ipAddress: '192.168.1.100', // NOSONAR - mock seed data
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: 'seed-audit-002',
      action: 'CREATE',
      entityType: 'Opportunity',
      entityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      oldValue: Prisma.JsonNull,
      newValue: { stage: OpportunityStage.PROPOSAL, value: 125000 },
      ipAddress: '192.168.1.101', // NOSONAR - mock seed data
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      userId: SEED_IDS.users.janeDoe,
      tenantId,
    },
    {
      id: 'seed-audit-003',
      action: 'UPDATE',
      entityType: 'Opportunity',
      entityId: SEED_IDS.opportunities.teamLicenseStartupXYZ,
      oldValue: { stage: OpportunityStage.NEGOTIATION },
      newValue: { stage: OpportunityStage.CLOSED_WON },
      ipAddress: '192.168.1.102', // NOSONAR - mock seed data
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
  ];

  for (const auditLog of auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: auditLog.id },
      update: auditLog,
      create: auditLog,
    });
  }

  console.log(`✅ Created ${auditLogs.length} audit logs`);
  return auditLogs;
}

async function seedDomainEvents() {
  console.log('📤 Seeding domain events...');

  const domainEvents = [
    {
      id: 'seed-event-001',
      eventType: 'LeadScored',
      aggregateType: 'Lead',
      aggregateId: SEED_IDS.leads.jamesWilson,
      payload: {
        score: 92,
        confidence: 0.96,
        modelVersion: 'v1.0.0',
      },
      metadata: { scoredById: SEED_IDS.users.admin },
      status: EventStatus.PROCESSED,
      processedAt: new Date(),
    },
    {
      id: 'seed-event-002',
      eventType: 'OpportunityStageChanged',
      aggregateType: 'Opportunity',
      aggregateId: SEED_IDS.opportunities.teamLicenseStartupXYZ,
      payload: {
        previousStage: OpportunityStage.NEGOTIATION,
        newStage: OpportunityStage.CLOSED_WON,
        value: 12000,
      },
      metadata: { userId: SEED_IDS.users.mikeDavis },
      status: EventStatus.PROCESSED,
      processedAt: new Date(),
    },
    {
      id: 'seed-event-003',
      eventType: 'TicketSLABreached',
      aggregateType: 'Ticket',
      aggregateId: SEED_IDS.tickets.systemOutage,
      payload: {
        ticketNumber: 'T-10924',
        priority: TicketPriority.CRITICAL,
        breachedAt: new Date(),
      },
      metadata: { systemGenerated: true },
      status: EventStatus.PENDING,
    },
  ];

  for (const event of domainEvents) {
    await prisma.domainEvent.upsert({
      where: { id: event.id },
      update: event,
      create: event,
    });
  }

  console.log(`✅ Created ${domainEvents.length} domain events`);
  return domainEvents;
}

// =============================================================================
// Supplementary Data Seed Functions
// =============================================================================

async function seedDealProducts() {
  console.log('📦 Seeding deal products...');

  // Data from apps/web/src/app/deals/[id]/page.tsx lines 138-141
  const products = [
    {
      id: SEED_IDS.dealProducts.enterpriseLicense,
      name: 'Enterprise License',
      description: 'Qty: 100 Seats',
      quantity: 100,
      unitPrice: 1000,
      totalPrice: 100000,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.dealProducts.implementation,
      name: 'Implementation',
      description: 'Standard Package',
      quantity: 1,
      unitPrice: 25000,
      totalPrice: 25000,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
  ];

  for (const product of products) {
    await prisma.dealProduct.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }

  console.log(`✅ Created ${products.length} deal products`);
  return products;
}

async function seedDealFiles() {
  console.log('📁 Seeding deal files...');

  // Data from apps/web/src/app/deals/[id]/page.tsx lines 146-149
  const files = [
    {
      id: SEED_IDS.dealFiles.acmeMsa,
      name: 'Acme_MSA_v3.pdf',
      size: '2.4 MB',
      sizeBytes: 2516582,
      fileType: FileType.PDF,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      uploadedById: SEED_IDS.users.janeDoe,
      uploadedAt: new Date('2024-12-15'),
    },
    {
      id: SEED_IDS.dealFiles.requirementsDoc,
      name: 'Requirements_Doc.docx',
      size: '1.1 MB',
      sizeBytes: 1153434,
      fileType: FileType.DOCX,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      uploadedById: SEED_IDS.users.janeDoe,
      uploadedAt: new Date('2024-12-10'),
    },
  ];

  for (const file of files) {
    await prisma.dealFile.upsert({
      where: { id: file.id },
      update: file,
      create: file,
    });
  }

  console.log(`✅ Created ${files.length} deal files`);
  return files;
}

async function seedDealActivities() {
  console.log('📋 Seeding deal activities...');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Data from apps/web/src/app/deals/[id]/page.tsx lines 152-202
  const activities = [
    {
      id: SEED_IDS.dealActivities.agentAdvance,
      type: ActivityType.AGENT_ACTION,
      title: 'AI: Advance deal to negotiation stage',
      description: 'Pipeline Intelligence Agent detected positive signals from recent communication',
      timestamp: new Date(now.getTime() - 30 * 60 * 1000), // 11:30 AM today
      dateLabel: 'today',
      agentActionId: 'action-3',
      agentName: 'Pipeline Intelligence Agent',
      confidenceScore: 92,
      agentStatus: AgentActionStatus.PENDING_APPROVAL,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
    },
    {
      id: SEED_IDS.dealActivities.emailProposal,
      type: ActivityType.EMAIL,
      title: 'Email Sent: Proposal V2',
      description: 'Attached the updated pricing model as discussed in the meeting.',
      timestamp: new Date(now.getTime() - 78 * 60 * 1000), // 10:42 AM today
      dateLabel: 'today',
      attachmentName: 'Proposal_Acme_v2.pdf',
      attachmentType: 'pdf',
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
    },
    {
      id: SEED_IDS.dealActivities.agentMeeting,
      type: ActivityType.AGENT_ACTION,
      title: 'AI: Schedule follow-up meeting',
      description: 'Task Automation Agent identified optimal meeting time based on calendars',
      timestamp: new Date(now.getTime() - 165 * 60 * 1000), // 9:15 AM today
      dateLabel: 'today',
      agentActionId: 'action-4',
      agentName: 'Task Automation Agent',
      confidenceScore: 78,
      agentStatus: AgentActionStatus.APPROVED,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
    },
    {
      id: SEED_IDS.dealActivities.callRobert,
      type: ActivityType.CALL,
      title: 'Call with Robert Fox',
      description: 'Discussed timeline for implementation. They are keen to start by Nov 1st. Need to adjust contract start date.',
      timestamp: new Date(yesterday.getTime() + 14 * 60 * 60 * 1000 + 15 * 60 * 1000), // 2:15 PM yesterday
      dateLabel: 'yesterday',
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
    },
    {
      id: SEED_IDS.dealActivities.stageChange,
      type: ActivityType.STAGE_CHANGE,
      title: 'Stage Changed',
      timestamp: new Date(yesterday.getTime() + 9 * 60 * 60 * 1000 + 30 * 60 * 1000), // 9:30 AM yesterday
      dateLabel: 'yesterday',
      stageFrom: 'Qualification',
      stageTo: 'Proposal',
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
    },
  ];

  for (const activity of activities) {
    await prisma.activityEvent.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${activities.length} deal activities`);
  return activities;
}

async function seedTicketActivities() {
  console.log('💬 Seeding ticket activities...');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Data from apps/web/src/app/tickets/[id]/page.tsx lines 134-180
  const activities = [
    {
      id: SEED_IDS.ticketActivities.customerMessage,
      type: TicketActivityType.CUSTOMER_MESSAGE,
      content: "Hi Support,\n\nOur team in the West Region is reporting consistent 503 errors when trying to load the main dashboard. This started about 30 minutes ago. We've tried clearing cache and different browsers but the issue persists.\n\nPlease investigate ASAP as this is blocking our daily reporting.\n\nRegards,\nDavid",
      timestamp: new Date(yesterday.getTime() + 16 * 60 * 60 * 1000 + 30 * 60 * 1000), // Yesterday 4:30 PM
      isInternal: false,
      authorName: 'David Kim',
      authorRole: 'Customer',
      authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
      channel: TicketChannel.EMAIL,
      ticketId: SEED_IDS.tickets.systemOutage,
    },
    {
      id: SEED_IDS.ticketActivities.systemPriority,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'automatically assigned priority',
      timestamp: new Date(yesterday.getTime() + 16 * 60 * 60 * 1000 + 30 * 60 * 1000),
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'priority_assigned',
      systemEventData: { newPriority: 'High' },
      ticketId: SEED_IDS.tickets.systemOutage,
    },
    {
      id: SEED_IDS.ticketActivities.agentReply,
      type: TicketActivityType.AGENT_REPLY,
      content: "Hello David,\n\nThanks for reaching out. I'm looking into this immediately. We are checking our load balancers for the West region.\n\nI've escalated this to our DevOps team.",
      timestamp: new Date(yesterday.getTime() + 16 * 60 * 60 * 1000 + 45 * 60 * 1000), // Yesterday 4:45 PM
      isInternal: false,
      authorName: 'Sarah Jenkins',
      authorRole: 'Support Agent',
      authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.systemOutage,
    },
    {
      id: SEED_IDS.ticketActivities.priorityChange,
      type: TicketActivityType.STATUS_CHANGE,
      content: 'changed priority to',
      timestamp: new Date(yesterday.getTime() + 17 * 60 * 60 * 1000), // Yesterday 5:00 PM
      isInternal: true,
      authorName: 'Sarah Jenkins',
      authorRole: 'Support Agent',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'priority_change',
      systemEventData: { newPriority: 'Critical' },
      ticketId: SEED_IDS.tickets.systemOutage,
    },
    {
      id: SEED_IDS.ticketActivities.internalNote,
      type: TicketActivityType.INTERNAL_NOTE,
      content: 'We identified a degraded shard in the DB cluster. Replication lag is high. Creating a fix now.',
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000), // Today 9:15 AM (3 hours ago)
      isInternal: true,
      authorName: 'Mike Ross (DevOps)',
      authorRole: 'DevOps',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.systemOutage,
    },
    {
      id: SEED_IDS.ticketActivities.slaBreach,
      type: TicketActivityType.SLA_ALERT,
      content: 'Resolution time exceeded by 2 hours',
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'sla_breach',
      ticketId: SEED_IDS.tickets.systemOutage,
    },
  ];

  for (const activity of activities) {
    await prisma.ticketActivity.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${activities.length} ticket activities`);
  return activities;
}

async function seedTicketAttachments() {
  console.log('📎 Seeding ticket attachments...');

  // Data from apps/web/src/app/tickets/[id]/page.tsx lines 789-791
  const attachments = [
    {
      id: SEED_IDS.ticketAttachments.errorLogs,
      name: 'error-logs-west-region.pdf',
      size: '2.4 MB',
      sizeBytes: 2516582,
      fileType: FileType.PDF,
      ticketId: SEED_IDS.tickets.systemOutage,
      uploadedById: SEED_IDS.users.davidKim,
    },
    {
      id: SEED_IDS.ticketAttachments.screenshot,
      name: 'screenshot-503-error.png',
      size: '1.1 MB',
      sizeBytes: 1153434,
      fileType: FileType.IMAGE,
      ticketId: SEED_IDS.tickets.systemOutage,
      uploadedById: SEED_IDS.users.davidKim,
    },
    {
      id: SEED_IDS.ticketAttachments.devopsAnalysis,
      name: 'devops-analysis.docx',
      size: '856 KB',
      sizeBytes: 876544,
      fileType: FileType.DOCX,
      ticketId: SEED_IDS.tickets.systemOutage,
      uploadedById: SEED_IDS.users.mikeRoss,
    },
  ];

  for (const attachment of attachments) {
    await prisma.ticketAttachment.upsert({
      where: { id: attachment.id },
      update: attachment,
      create: attachment,
    });
  }

  console.log(`✅ Created ${attachments.length} ticket attachments`);
  return attachments;
}

// =============================================================================
// Additional Data Seed Functions (from agent-approvals, contacts detail, dashboard)
// =============================================================================

async function seedAdditionalUsersAndAccounts(tenantId: string) {
  console.log('👥 Seeding additional users and accounts...');

  // Additional users from dashboard widgets
  const additionalUsers = [
    {
      id: SEED_IDS.additionalUsers.aliceSmith,
      email: 'alice.smith@intelliflow.dev',
      name: 'Alice Smith',
      role: UserRole.SALES_REP,
      tenantId,
    },
    {
      id: SEED_IDS.additionalUsers.bobJones,
      email: 'bob.jones@intelliflow.dev',
      name: 'Bob Jones',
      role: UserRole.SALES_REP,
      tenantId,
    },
  ];

  for (const user of additionalUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        ...user,
      },
      create: {
        ...user,
      },
    });
  }

  // Additional account: TechFlow Inc. (from contact detail page)
  const techFlowAccount = {
    id: SEED_IDS.additionalAccounts.techFlowInc,
    name: 'TechFlow Inc.',
    industry: 'Technology',
    website: 'https://techflow.com',
    ownerId: SEED_IDS.users.alexMorgan, // Assign to Alex Morgan (sales rep)
    tenantId,
  };

  await prisma.account.upsert({
    where: { id: techFlowAccount.id },
    update: techFlowAccount,
    create: techFlowAccount,
  });

  // Additional contact: Sarah Jenkins (from contact detail page)
  const sarahJenkinsContact = {
    id: SEED_IDS.additionalContacts.sarahJenkins,
    email: 'sarah.j@techflow.com',
    firstName: 'Sarah',
    lastName: 'Jenkins',
    title: 'VP of Marketing',
    phone: '+1 (555) 012-3456',
    department: 'Marketing',
    ownerId: SEED_IDS.users.alexMorgan,     tenantId,   accountId: SEED_IDS.additionalAccounts.techFlowInc,
  };

  await prisma.contact.upsert({
    where: { id: sarahJenkinsContact.id },
    update: sarahJenkinsContact,
    create: sarahJenkinsContact,
  });

  console.log('✅ Created 2 additional users, 1 account, 1 contact');
}

async function seedAgentActions() {
  console.log('🤖 Seeding agent actions...');

  const now = new Date();

  // Data from apps/web/src/app/agent-approvals/preview/page.tsx lines 45-154
  const agentActions = [
    {
      id: SEED_IDS.agentActions.leadUpdate,
      actionType: 'lead_update',
      description: 'Update lead score and status based on engagement analysis',
      aiReasoning: 'Lead opened 5 emails (100% open rate), visited pricing page 3 times, and downloaded enterprise whitepaper. Company size (500+ employees) matches ideal customer profile.',
      confidenceScore: 85,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'lead-123',
      entityType: 'lead',
      entityName: 'John Smith - Acme Corp',
      previousState: {
        score: 45,
        status: 'New',
        nextFollowUp: null,
        notes: 'Initial inquiry via website form',
      },
      proposedState: {
        score: 72,
        status: 'Qualified',
        nextFollowUp: '2025-01-05',
        notes: 'Initial inquiry via website form. AI Analysis: High engagement, enterprise company, decision-maker role.',
      },
      agentId: 'scoring-agent-v1',
      agentName: 'Lead Scoring Agent',
      createdAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
      expiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000), // 23 hours from now
    },
    {
      id: SEED_IDS.agentActions.emailDraft,
      actionType: 'email_draft',
      description: 'Send personalized follow-up email based on demo engagement',
      aiReasoning: 'Contact attended 45-minute demo, asked 8 questions about API integrations, and requested pricing information. Optimal follow-up timing is 5 days post-demo based on historical conversion data.',
      confidenceScore: 78,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'contact-456',
      entityType: 'contact',
      entityName: 'Sarah Johnson - TechStart Inc',
      previousState: {
        lastContactedAt: '2024-12-20',
        emailsSent: 2,
      },
      proposedState: {
        lastContactedAt: '2025-01-02',
        emailsSent: 3,
        pendingEmail: {
          subject: 'Quick follow-up on your IntelliFlow demo',
          body: 'Hi Sarah, I wanted to follow up on our demo last week...',
        },
      },
      agentId: 'outreach-agent-v1',
      agentName: 'Outreach Agent',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      expiresAt: new Date(now.getTime() + 22 * 60 * 60 * 1000),
    },
    {
      id: SEED_IDS.agentActions.dealStageChange,
      actionType: 'deal_stage_change',
      description: 'Advance deal to negotiation stage with updated probability',
      aiReasoning: "Prospect verbally agreed to terms in last meeting (sentiment analysis: positive). Legal team CC'd on latest email suggests contract review in progress. Similar deals at this stage have 75% close rate.",
      confidenceScore: 92,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'deal-789',
      entityType: 'deal',
      entityName: 'Enterprise License - GlobalTech',
      previousState: {
        stage: 'PROPOSAL',
        probability: 60,
        value: 85000,
      },
      proposedState: {
        stage: 'NEGOTIATION',
        probability: 75,
        value: 92000,
        notes: 'Verbal agreement on terms. Awaiting legal review.',
      },
      agentId: 'pipeline-agent-v1',
      agentName: 'Pipeline Intelligence Agent',
      createdAt: new Date(now.getTime() - 15 * 60 * 1000), // 15 min ago
      expiresAt: new Date(now.getTime() + 23.5 * 60 * 60 * 1000),
    },
    {
      id: SEED_IDS.agentActions.taskCreate,
      actionType: 'task_create',
      description: 'Create follow-up task for high-intent lead',
      aiReasoning: 'Lead visited pricing page 5 times in last 24 hours and spent 12 minutes on comparison chart. Urgency signals suggest ready for sales conversation.',
      confidenceScore: 68,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'lead-124',
      entityType: 'lead',
      entityName: 'Mike Chen - StartupXYZ',
      previousState: {
        tasks: [],
      },
      proposedState: {
        tasks: [
          {
            title: 'Schedule discovery call',
            dueDate: '2025-01-03',
            priority: 'high',
            assignee: 'current_user',
          },
        ],
      },
      agentId: 'task-agent-v1',
      agentName: 'Task Automation Agent',
      createdAt: new Date(now.getTime() - 45 * 60 * 1000), // 45 min ago
      expiresAt: new Date(now.getTime() + 22.5 * 60 * 60 * 1000),
    },
  ];

  for (const action of agentActions) {
    await prisma.agentAction.upsert({
      where: { id: action.id },
      update: action,
      create: action,
    });
  }

  console.log(`✅ Created ${agentActions.length} agent actions`);
  return agentActions;
}

async function seedContactActivities() {
  console.log('📱 Seeding contact activities...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx lines 99-235
  const activities = [
    {
      id: SEED_IDS.contactActivities.emailOpened,
      type: ContactActivityType.EMAIL,
      title: 'Email Opened',
      description: 'Proposal Follow-up - Q3 Software',
      timestamp: new Date('2024-12-20T14:00:00Z'),
      userName: 'System',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        subject: 'Proposal Follow-up - Q3 Software',
        preview: 'Hi Sarah, Following up on our conversation about the Q3 software implementation...',
        openCount: 3,
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.meetingCompleted,
      type: ContactActivityType.MEETING,
      title: 'Meeting Completed',
      description: 'Q3 Requirements Review - 45 min',
      timestamp: new Date('2024-12-19T15:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        attendees: ['Sarah Jenkins', 'Alex Morgan', 'Mike Chen'],
        location: 'Zoom',
        notes: 'Discussed API integration requirements. Sarah confirmed budget approval for Q1.',
        duration: '45 min',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.dealStageUpdated,
      type: ContactActivityType.DEAL,
      title: 'Deal Stage Updated',
      description: 'Moved from Qualification → Negotiation',
      timestamp: new Date('2024-12-19T10:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.POSITIVE,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.callLogged,
      type: ContactActivityType.CALL,
      title: 'Call Logged',
      description: 'Discussed requirements for custom API integration',
      timestamp: new Date('2024-12-18T10:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        duration: '15 min',
        outcome: 'connected',
        recordingUrl: '/recordings/call-123.mp3',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.whatsappMessage,
      type: ContactActivityType.CHAT,
      title: 'WhatsApp Message',
      description: 'Quick follow-up on pricing question',
      timestamp: new Date('2024-12-17T16:30:00Z'),
      userName: 'Sarah Jenkins',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        channel: 'whatsapp',
        messageCount: 5,
        preview: 'Thanks for the quick response! The pricing looks good...',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.documentSigned,
      type: ContactActivityType.DOCUMENT,
      title: 'Document Signed',
      description: 'NDA Agreement signed',
      timestamp: new Date('2024-12-16T11:00:00Z'),
      userName: 'Sarah Jenkins',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        fileName: 'NDA_TechFlow_2024.pdf',
        fileSize: '245 KB',
        fileType: 'pdf',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.ticketResolved,
      type: ContactActivityType.TICKET,
      title: 'Ticket Resolved',
      description: 'Integration API question resolved',
      timestamp: new Date('2024-12-15T14:00:00Z'),
      userName: 'Support Team',
      sentiment: Sentiment.NEUTRAL,
      metadata: {
        ticketId: 'TKT-1234',
        status: 'Resolved',
        priority: 'Medium',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.noteAdded,
      type: ContactActivityType.NOTE,
      title: 'Note Added',
      description: 'Sarah mentioned they are evaluating 2 other competitors',
      timestamp: new Date('2024-12-15T16:30:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.emailSent,
      type: ContactActivityType.EMAIL,
      title: 'Email Sent',
      description: 'Enterprise License Proposal',
      timestamp: new Date('2024-12-14T09:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      metadata: {
        subject: 'Enterprise License Proposal - TechFlow Inc.',
        preview: 'Dear Sarah, Thank you for your interest in our Enterprise solution...',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactActivities.meetingScheduled,
      type: ContactActivityType.MEETING,
      title: 'Meeting Scheduled',
      description: 'Initial Discovery Call',
      timestamp: new Date('2024-12-10T10:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      metadata: {
        attendees: ['Sarah Jenkins', 'Alex Morgan'],
        location: 'Google Meet',
        duration: '30 min',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
  ];

  for (const activity of activities) {
    await prisma.contactActivity.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${activities.length} contact activities`);
  return activities;
}

async function seedDashboardActivities() {
  console.log('📊 Seeding dashboard recent activities...');

  // Data from apps/web/src/components/dashboard/widgets/RecentActivityWidget.tsx
  // These are ActivityEvent records for the dashboard widget
  const now = new Date();

  const dashboardActivities = [
    {
      id: SEED_IDS.dashboardActivities.aliceActivity,
      type: ActivityType.STAGE_CHANGE,
      title: 'Created new deal',
      description: 'Tech Solutions Bundle',
      timestamp: new Date(now.getTime() - 2 * 60 * 1000), // 2 minutes ago
      dateLabel: 'today',
      userId: SEED_IDS.additionalUsers.aliceSmith,
    },
    {
      id: SEED_IDS.dashboardActivities.bobActivity,
      type: ActivityType.NOTE,
      title: 'Updated status',
      description: 'Project Alpha',
      timestamp: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      dateLabel: 'today',
      userId: SEED_IDS.additionalUsers.bobJones,
    },
  ];

  for (const activity of dashboardActivities) {
    await prisma.activityEvent.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${dashboardActivities.length} dashboard activities`);
  return dashboardActivities;
}

// =============================================================================
// NEW COMPREHENSIVE UI DATA SEED FUNCTIONS
// =============================================================================

async function seedContactNotes() {
  console.log('📝 Seeding contact notes...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockNotes)
  const notes = [
    {
      id: SEED_IDS.contactNotes.securityFeatures,
      content: 'Very interested in our enterprise security features. Needs SOC2 compliance documentation.',
      author: 'Alex Morgan',
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      createdAt: new Date('2024-12-15T16:30:00Z'),
    },
    {
      id: SEED_IDS.contactNotes.budgetApproved,
      content: 'Budget approved for Q1. Decision expected by end of January.',
      author: 'Sarah Jenkins',
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      createdAt: new Date('2024-12-10T11:00:00Z'),
    },
  ];

  for (const note of notes) {
    await prisma.contactNote.upsert({
      where: { id: note.id },
      update: note,
      create: note,
    });
  }

  console.log(`✅ Created ${notes.length} contact notes`);
}

async function seedContactAIInsights() {
  console.log('🤖 Seeding contact AI insights...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockAIInsights)
  const insight = {
    id: SEED_IDS.contactAIInsights.sarahJenkins,
    contactId: SEED_IDS.additionalContacts.sarahJenkins,
    conversionProbability: 85,
    lifetimeValue: 24500000, // $245,000 in cents
    churnRisk: ChurnRisk.LOW,
    nextBestAction: 'Schedule a meeting to discuss contract terms',
    sentiment: 'Positive',
    engagementScore: 85,
    recommendations: [
      'Contact has high engagement - good time to propose upsell',
      'Decision maker role identified - include in executive communications',
      'Optimal contact time: Tuesday-Thursday, 10am-2pm PST',
    ],
    sentimentTrend: 'improving',
    lastEngagementDays: 2,
  };

  await prisma.contactAIInsight.upsert({
    where: { id: insight.id },
    update: insight,
    create: insight,
  });

  console.log('✅ Created 1 contact AI insight');
}

async function seedCalendarEvents(tenantId: string) {
  console.log('📅 Seeding calendar events...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Data from multiple sources:
  // - apps/web/src/app/contacts/[id]/page.tsx (mockUpcoming)
  // - apps/web/src/components/dashboard/widgets/UpcomingEventsWidget.tsx (events)
  const events = [
    // From mockUpcoming (contact page)
    {
      id: SEED_IDS.calendarEvents.q3Review,
      title: 'Q3 Review',
      description: 'Quarterly review meeting with Sarah Jenkins',
      startTime: new Date(today.getTime() + 14 * 60 * 60 * 1000), // 2 PM today
      endTime: new Date(today.getTime() + 15 * 60 * 60 * 1000), // 3 PM today
      location: 'Zoom',
      eventType: CalendarEventType.MEETING,
      attendees: [
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face',
      ],
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,   },
    // From UpcomingEventsWidget
    {
      id: SEED_IDS.calendarEvents.productDemoTechCorp,
      title: 'Product Demo - TechCorp',
      description: 'Product demonstration for TechCorp team',
      startTime: new Date(today.getTime() + 15 * 60 * 60 * 1000), // 3 PM today
      endTime: new Date(today.getTime() + 16 * 60 * 60 * 1000),
      location: 'Conference Room A',
      eventType: CalendarEventType.MEETING,
      contactId: SEED_IDS.contacts.sarahMiller,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.calendarEvents.followUpCallSarah,
      title: 'Follow-up Call - Sarah',
      description: 'Follow-up call with Sarah regarding proposal',
      startTime: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 10.5 * 60 * 60 * 1000), // Tomorrow 10:30 AM
      endTime: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 11 * 60 * 60 * 1000),
      eventType: CalendarEventType.CALL,
      contactId: SEED_IDS.contacts.sarahMiller,
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,   },
    {
      id: SEED_IDS.calendarEvents.proposalDeadline,
      title: 'Proposal Deadline',
      description: 'Deadline to submit TechCorp proposal',
      startTime: new Date('2024-10-28T17:00:00Z'),
      eventType: CalendarEventType.DEADLINE,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
  ];

  for (const event of events) {
    await prisma.calendarEvent.upsert({
      where: { id: event.id },
      update: event,
      create: event,
    });
  }

  console.log(`✅ Created ${events.length} calendar events`);
}

async function seedTeamMessages() {
  console.log('💬 Seeding team messages...');

  const now = new Date();

  // Data from apps/web/src/components/dashboard/widgets/TeamChatWidget.tsx
  const messages = [
    {
      id: SEED_IDS.teamMessages.sarahClosedDeal,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah',
      userAvatar: 'S',
      message: 'Just closed the deal with TechCorp!',
      channel: 'general',
      createdAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes ago
    },
    {
      id: SEED_IDS.teamMessages.mikeGreatWork,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike',
      userAvatar: 'M',
      message: 'Great work team!',
      channel: 'general',
      createdAt: new Date(now.getTime() - 12 * 60 * 1000), // 12 minutes ago
    },
    {
      id: SEED_IDS.teamMessages.emilyMeetingNotes,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily',
      userAvatar: 'E',
      message: 'Meeting notes uploaded',
      channel: 'general',
      createdAt: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
    },
  ];

  for (const msg of messages) {
    await prisma.teamMessage.upsert({
      where: { id: msg.id },
      update: msg,
      create: msg,
    });
  }

  console.log(`✅ Created ${messages.length} team messages`);
}

async function seedPipelineSnapshots() {
  console.log('📊 Seeding pipeline snapshots...');

  const snapshotDate = new Date();

  // Data from apps/web/src/components/dashboard/widgets/PipelineWidget.tsx
  const stages = [
    {
      id: SEED_IDS.pipelineSnapshots.qualification,
      stage: 'Qualification',
      value: 1240000, // $12,400 in cents
      dealCount: 8,
      percentage: 15,
      color: 'bg-ds-primary',
      snapshotDate,
    },
    {
      id: SEED_IDS.pipelineSnapshots.proposal,
      stage: 'Proposal',
      value: 3420000, // $34,200 in cents
      dealCount: 12,
      percentage: 40,
      color: 'bg-indigo-500',
      snapshotDate,
    },
    {
      id: SEED_IDS.pipelineSnapshots.negotiation,
      stage: 'Negotiation',
      value: 12000000, // $120,000 in cents
      dealCount: 4,
      percentage: 25,
      color: 'bg-amber-500',
      snapshotDate,
    },
    {
      id: SEED_IDS.pipelineSnapshots.closedWon,
      stage: 'Closed Won',
      value: 4000000, // $40,000 in cents
      dealCount: 2,
      percentage: 20,
      color: 'bg-green-500',
      snapshotDate,
    },
  ];

  for (const stage of stages) {
    await prisma.pipelineSnapshot.upsert({
      where: { id: stage.id },
      update: stage,
      create: stage,
    });
  }

  console.log(`✅ Created ${stages.length} pipeline snapshots`);
}

async function seedTrafficSources() {
  console.log('📈 Seeding traffic sources...');

  const snapshotDate = new Date();

  // Data from apps/web/src/components/dashboard/widgets/TrafficSourcesWidget.tsx
  const sources = [
    {
      id: SEED_IDS.trafficSources.direct,
      name: 'Direct',
      percentage: 35,
      color: 'bg-ds-primary',
      snapshotDate,
    },
    {
      id: SEED_IDS.trafficSources.organic,
      name: 'Organic',
      percentage: 28,
      color: 'bg-emerald-500',
      snapshotDate,
    },
    {
      id: SEED_IDS.trafficSources.referral,
      name: 'Referral',
      percentage: 22,
      color: 'bg-amber-500',
      snapshotDate,
    },
    {
      id: SEED_IDS.trafficSources.social,
      name: 'Social',
      percentage: 15,
      color: 'bg-violet-500',
      snapshotDate,
    },
  ];

  for (const source of sources) {
    await prisma.trafficSource.upsert({
      where: { id: source.id },
      update: source,
      create: source,
    });
  }

  console.log(`✅ Created ${sources.length} traffic sources`);
}

async function seedGrowthMetrics() {
  console.log('📈 Seeding growth metrics...');

  const currentYear = new Date().getFullYear();

  // Data from apps/web/src/components/dashboard/widgets/GrowthTrendsWidget.tsx
  const dataPoints = [20, 35, 28, 45, 42, 55, 48, 62, 58, 72, 68, 85];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIds = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const metrics = months.map((month, index) => ({
    id: SEED_IDS.growthMetrics[monthIds[index] as keyof typeof SEED_IDS.growthMetrics],
    month,
    year: currentYear,
    value: dataPoints[index],
    metricType: 'revenue',
  }));

  for (const metric of metrics) {
    await prisma.growthMetric.upsert({
      where: { id: metric.id },
      update: metric,
      create: metric,
    });
  }

  console.log(`✅ Created ${metrics.length} growth metrics`);
}

async function seedDealsWonMetrics() {
  console.log('📊 Seeding deals won metrics...');

  const currentYear = new Date().getFullYear();

  // Data from apps/web/src/components/dashboard/widgets/DealsWonWidget.tsx
  const chartData = [
    { month: 'Jul', value: 45 },
    { month: 'Aug', value: 65 },
    { month: 'Sep', value: 55 },
    { month: 'Oct', value: 70 },
    { month: 'Nov', value: 80 },
    { month: 'Dec', value: 95 },
  ];
  const monthIds = ['jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const metrics = chartData.map((data, index) => ({
    id: SEED_IDS.dealsWonMetrics[monthIds[index] as keyof typeof SEED_IDS.dealsWonMetrics],
    month: data.month,
    year: currentYear,
    value: data.value,
  }));

  for (const metric of metrics) {
    await prisma.dealsWonMetric.upsert({
      where: { id: metric.id },
      update: metric,
      create: metric,
    });
  }

  console.log(`✅ Created ${metrics.length} deals won metrics`);
}

async function seedTicketNextSteps() {
  console.log('📋 Seeding ticket next steps...');

  // Data from apps/web/src/app/tickets/[id]/page.tsx (SAMPLE_TICKET.nextSteps)
  const steps = [
    {
      id: SEED_IDS.ticketNextSteps.verifyDbFix,
      ticketId: SEED_IDS.tickets.systemOutage,
      title: 'Verify DB cluster fix deployment',
      dueDate: 'Due in 1 hour',
      completed: false,
    },
    {
      id: SEED_IDS.ticketNextSteps.confirmResolution,
      ticketId: SEED_IDS.tickets.systemOutage,
      title: 'Confirm with customer resolution',
      dueDate: 'Due Today',
      completed: false,
    },
    {
      id: SEED_IDS.ticketNextSteps.documentRootCause,
      ticketId: SEED_IDS.tickets.systemOutage,
      title: 'Document root cause for knowledge base',
      dueDate: 'Tomorrow',
      completed: false,
    },
  ];

  for (const step of steps) {
    await prisma.ticketNextStep.upsert({
      where: { id: step.id },
      update: step,
      create: step,
    });
  }

  console.log(`✅ Created ${steps.length} ticket next steps`);
}

async function seedRelatedTickets() {
  console.log('🔗 Seeding related tickets...');

  // Data from apps/web/src/app/tickets/[id]/page.tsx (SAMPLE_TICKET.relatedTickets)
  const related = [
    {
      id: SEED_IDS.relatedTickets.slowDashboard,
      ticketId: SEED_IDS.tickets.systemOutage,
      relatedId: 'T-10890',
      relatedSubject: 'Slow dashboard loading - East Region',
      relatedStatus: TicketStatus.RESOLVED,
      similarity: 85,
    },
    {
      id: SEED_IDS.relatedTickets.databaseTimeout,
      ticketId: SEED_IDS.tickets.systemOutage,
      relatedId: 'T-10756',
      relatedSubject: 'Database timeout errors',
      relatedStatus: TicketStatus.RESOLVED,
      similarity: 72,
    },
    {
      id: SEED_IDS.relatedTickets.apiLatency,
      ticketId: SEED_IDS.tickets.systemOutage,
      relatedId: 'T-10923',
      relatedSubject: 'API latency issues',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 68,
    },
  ];

  for (const ticket of related) {
    await prisma.relatedTicket.upsert({
      where: { id: ticket.id },
      update: ticket,
      create: ticket,
    });
  }

  console.log(`✅ Created ${related.length} related tickets`);
}

async function seedTicketAIInsights() {
  console.log('🤖 Seeding ticket AI insights...');

  // Data from apps/web/src/app/tickets/[id]/page.tsx (SAMPLE_TICKET.aiInsights)
  const insight = {
    id: SEED_IDS.ticketAIInsights.systemOutage,
    ticketId: SEED_IDS.tickets.systemOutage,
    suggestedSolutions: [
      'Check DB cluster replication status - similar to T-10756',
      'Verify load balancer health checks for West region',
      'Review recent deployment changes in the last 24 hours',
    ],
    sentiment: 'negative',
    predictedResolutionTime: '2-4 hours',
    similarResolvedTickets: 8,
    escalationRisk: 'high',
  };

  await prisma.ticketAIInsight.upsert({
    where: { id: insight.id },
    update: insight,
    create: insight,
  });

  console.log('✅ Created 1 ticket AI insight');
}

async function seedSalesPerformance() {
  console.log('🏆 Seeding sales performance...');

  const snapshotDate = new Date();

  // Data from apps/web/src/components/dashboard/widgets/TopPerformersWidget.tsx
  const performers = [
    {
      id: SEED_IDS.salesPerformance.sarahJohnson,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      userAvatar: 'SJ',
      dealCount: 12,
      revenue: 4520000, // $45,200 in cents
      rank: 1,
      period: 'monthly',
      snapshotDate,
    },
    {
      id: SEED_IDS.salesPerformance.mikeChen,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike Chen',
      userAvatar: 'MC',
      dealCount: 10,
      revenue: 3850000, // $38,500 in cents
      rank: 2,
      period: 'monthly',
      snapshotDate,
    },
    {
      id: SEED_IDS.salesPerformance.emilyDavis,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily Davis',
      userAvatar: 'ED',
      dealCount: 8,
      revenue: 3210000, // $32,100 in cents
      rank: 3,
      period: 'monthly',
      snapshotDate,
    },
    {
      id: SEED_IDS.salesPerformance.jamesWilson,
      userId: SEED_IDS.users.jamesWilson,
      userName: 'James Wilson',
      userAvatar: 'JW',
      dealCount: 7,
      revenue: 2890000, // $28,900 in cents
      rank: 4,
      period: 'monthly',
      snapshotDate,
    },
  ];

  for (const perf of performers) {
    await prisma.salesPerformance.upsert({
      where: { id: perf.id },
      update: perf,
      create: perf,
    });
  }

  console.log(`✅ Created ${performers.length} sales performance records`);
}

async function seedDashboardTasks(tenantId: string) {
  console.log('✅ Seeding dashboard tasks...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Data from apps/web/src/components/dashboard/widgets/PendingTasksWidget.tsx
  const tasks = [
    {
      id: SEED_IDS.dashboardTasks.callAcme,
      title: 'Call with Acme Corp',
      description: 'Discuss Q4 renewal',
      dueDate: new Date(today.getTime() + 14 * 60 * 60 * 1000), // Today 2 PM
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.dashboardTasks.reviewQ3,
      title: 'Review Q3 Report',
      description: 'Review and prepare comments',
      dueDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000), // Tomorrow 10 AM
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,   },
    {
      id: SEED_IDS.dashboardTasks.emailFollowup,
      title: 'Email follow-up: Sarah',
      description: 'Follow up on proposal',
      dueDate: new Date(today.getTime() - 24 * 60 * 60 * 1000), // Yesterday (overdue)
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,   },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }

  console.log(`✅ Created ${tasks.length} dashboard tasks`);
}

async function seedContactDeals(tenantId: string) {
  console.log('💼 Seeding contact deals...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockDeals)
  // These deals are associated with Sarah Jenkins contact
  const deals = [
    {
      id: SEED_IDS.contactDeals.enterpriseLicense,
      name: 'Enterprise License - Q1 2025',
      value: 7500000, // $75,000 in cents
      stage: OpportunityStage.NEGOTIATION,
      probability: 75,
      expectedCloseDate: new Date('2025-01-31'),
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,     contactId: SEED_IDS.additionalContacts.sarahJenkins,
      accountId: SEED_IDS.additionalAccounts.techFlowInc,
    },
    {
      id: SEED_IDS.contactDeals.professionalServices,
      name: 'Professional Services Package',
      value: 3500000, // $35,000 in cents
      stage: OpportunityStage.PROPOSAL,
      probability: 50,
      expectedCloseDate: new Date('2025-02-15'),
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,     contactId: SEED_IDS.additionalContacts.sarahJenkins,
      accountId: SEED_IDS.additionalAccounts.techFlowInc,
    },
    {
      id: SEED_IDS.contactDeals.supportRenewal,
      name: 'Support Contract Renewal',
      value: 1500000, // $15,000 in cents
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-12-01'),
      closedAt: new Date('2024-12-01'),
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,     contactId: SEED_IDS.additionalContacts.sarahJenkins,
      accountId: SEED_IDS.additionalAccounts.techFlowInc,
    },
  ];

  for (const deal of deals) {
    await prisma.opportunity.upsert({
      where: { id: deal.id },
      update: deal,
      create: deal,
    });
  }

  console.log(`✅ Created ${deals.length} contact deals`);
}

async function seedContactTasks(tenantId: string) {
  console.log('📋 Seeding contact tasks...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockTasks)
  const tasks = [
    {
      id: SEED_IDS.contactTasks.followUpContract,
      title: 'Follow up on contract',
      description: 'Follow up with Sarah on enterprise license contract',
      dueDate: new Date('2024-12-28'),
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,     contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactTasks.scheduleTechDemo,
      title: 'Schedule tech demo',
      description: 'Schedule technical demonstration for engineering team',
      dueDate: new Date('2024-12-30'),
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,     contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactTasks.sendProposal,
      title: 'Send initial proposal',
      description: 'Send initial proposal document',
      dueDate: new Date('2024-12-10'),
      priority: TaskPriority.LOW,
      status: TaskStatus.COMPLETED,
      ownerId: SEED_IDS.users.alexMorgan,     tenantId,     contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }

  console.log(`✅ Created ${tasks.length} contact tasks`);
}

// =============================================================================
// NEW FLOW COVERAGE SEED FUNCTIONS (FLOW-001 to FLOW-038)
// =============================================================================

// FLOW-002, FLOW-004: Teams & Workspaces
async function seedWorkspaces() {
  console.log('🏢 Seeding workspaces...');

  const workspaces = [
    {
      id: SEED_IDS.workspaces.intelliflow,
      name: 'IntelliFlow CRM',
      slug: 'intelliflow-crm',
      description: 'Main IntelliFlow CRM workspace for enterprise customers',
      industry: 'Technology',
      size: 'enterprise',
      plan: 'enterprise',
      isActive: true,
      settings: {
        theme: 'dark',
        timezone: 'UTC',
        notifications: { email: true, slack: true },
      },
    },
    {
      id: SEED_IDS.workspaces.demo,
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      description: 'Demo workspace for trials and demonstrations',
      industry: 'Various',
      size: 'small',
      plan: 'trial',
      isActive: true,
      settings: { theme: 'light', timezone: 'America/New_York' },
    },
  ];

  for (const workspace of workspaces) {
    await prisma.workspace.upsert({
      where: { id: workspace.id },
      update: workspace,
      create: workspace,
    });
  }

  console.log(`✅ Created ${workspaces.length} workspaces`);
}

async function seedTeams() {
  console.log('👥 Seeding teams...');

  const teams = [
    {
      id: SEED_IDS.teams.sales,
      name: 'Sales Team',
      description: 'Enterprise sales and account management',
      workspaceId: SEED_IDS.workspaces.intelliflow,
      leaderId: SEED_IDS.users.sarahJohnson,
      isActive: true,
    },
    {
      id: SEED_IDS.teams.support,
      name: 'Support Team',
      description: 'Customer support and ticket resolution',
      workspaceId: SEED_IDS.workspaces.intelliflow,
      leaderId: SEED_IDS.users.emilyDavis,
      isActive: true,
    },
    {
      id: SEED_IDS.teams.engineering,
      name: 'Engineering Team',
      description: 'Technical implementation and integrations',
      workspaceId: SEED_IDS.workspaces.intelliflow,
      leaderId: SEED_IDS.users.jamesWilson,
      isActive: true,
    },
  ];

  for (const team of teams) {
    await prisma.team.upsert({
      where: { id: team.id },
      update: team,
      create: team,
    });
  }

  console.log(`✅ Created ${teams.length} teams`);
}

async function seedTeamMembers() {
  console.log('👤 Seeding team members...');

  const members = [
    {
      id: SEED_IDS.teamMembers.sarahSales,
      teamId: SEED_IDS.teams.sales,
      userId: SEED_IDS.users.sarahJohnson,
      role: 'lead',
      joinedAt: new Date('2024-01-15'),
    },
    {
      id: SEED_IDS.teamMembers.mikeSales,
      teamId: SEED_IDS.teams.sales,
      userId: SEED_IDS.users.mikeDavis,
      role: 'member',
      joinedAt: new Date('2024-02-01'),
    },
    {
      id: SEED_IDS.teamMembers.emilySupport,
      teamId: SEED_IDS.teams.support,
      userId: SEED_IDS.users.emilyDavis,
      role: 'lead',
      joinedAt: new Date('2024-01-10'),
    },
  ];

  for (const member of members) {
    await prisma.teamMember.upsert({
      where: { id: member.id },
      update: member,
      create: member,
    });
  }

  console.log(`✅ Created ${members.length} team members`);
}

// FLOW-016: Email Communication
async function seedEmailTemplates() {
  console.log('📧 Seeding email templates...');

  const templates = [
    {
      id: SEED_IDS.emailTemplates.welcome,
      name: 'Welcome Email',
      subject: 'Welcome to IntelliFlow CRM!',
      body: '<h1>Welcome!</h1><p>Thank you for joining IntelliFlow CRM. We\'re excited to help you streamline your sales process.</p>',
      category: 'onboarding',
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.emailTemplates.followUp,
      name: 'Sales Follow-up',
      subject: 'Following up on our conversation',
      body: '<p>Hi {{firstName}},</p><p>I wanted to follow up on our conversation about {{topic}}. Are you available for a quick call this week?</p>',
      category: 'sales',
      isActive: true,
      createdBy: SEED_IDS.users.sarahJohnson,
    },
    {
      id: SEED_IDS.emailTemplates.proposal,
      name: 'Proposal Template',
      subject: 'Your Custom Proposal from IntelliFlow',
      body: '<h2>Proposal for {{company}}</h2><p>Based on our discussions, we\'ve prepared the following proposal...</p>',
      category: 'sales',
      isActive: true,
      createdBy: SEED_IDS.users.sarahJohnson,
    },
  ];

  for (const template of templates) {
    await prisma.emailTemplate.upsert({
      where: { id: template.id },
      update: template,
      create: template,
    });
  }

  console.log(`✅ Created ${templates.length} email templates`);
}

async function seedEmailRecords() {
  console.log('📨 Seeding email records...');

  const emails = [
    {
      id: SEED_IDS.emailRecords.welcomeSarah,
      templateId: SEED_IDS.emailTemplates.welcome,
      subject: 'Welcome to IntelliFlow CRM!',
      body: '<h1>Welcome Sarah!</h1><p>Thank you for joining IntelliFlow CRM.</p>',
      fromEmail: 'noreply@intelliflow.com',
      toEmail: 'sarah.jenkins@techflow.com',
      status: EmailStatus.DELIVERED,
      sentAt: new Date('2024-12-10T10:00:00'),
      deliveredAt: new Date('2024-12-10T10:00:05'),
      openCount: 3,
      clickCount: 1,
      openedAt: new Date('2024-12-11T14:30:00'),
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.emailRecords.proposalAcme,
      templateId: SEED_IDS.emailTemplates.proposal,
      subject: 'Your Custom Proposal from IntelliFlow',
      body: '<h2>Proposal for Acme Corp</h2><p>Enterprise license proposal...</p>',
      fromEmail: 'sarah.johnson@intelliflow.com',
      toEmail: 'robert@acmecorp.com',
      status: EmailStatus.OPENED,
      sentAt: new Date('2024-12-20T09:00:00'),
      deliveredAt: new Date('2024-12-20T09:00:03'),
      openCount: 5,
      clickCount: 2,
      openedAt: new Date('2024-12-21T11:00:00'),
      contactId: SEED_IDS.contacts.robertFox,
      dealId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.emailRecords.followUpDavid,
      templateId: SEED_IDS.emailTemplates.followUp,
      subject: 'Following up on our conversation',
      body: '<p>Hi David,</p><p>I wanted to follow up on our demo...</p>',
      fromEmail: 'mike.davis@intelliflow.com',
      toEmail: 'david.chen@globalsoft.com',
      status: EmailStatus.SENT,
      sentAt: new Date('2024-12-22T15:00:00'),
      contactId: SEED_IDS.contacts.davidChen,
    },
  ];

  for (const email of emails) {
    await prisma.emailRecord.upsert({
      where: { id: email.id },
      update: email,
      create: email,
    });
  }

  console.log(`✅ Created ${emails.length} email records`);
}

// FLOW-017: Chat Integration
async function seedChatConversations() {
  console.log('💬 Seeding chat conversations...');

  const conversations = [
    {
      id: SEED_IDS.chatConversations.supportChat1,
      channel: ChatChannel.INTERNAL,
      status: ChatStatus.OPEN,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      assigneeId: SEED_IDS.users.emilyDavis,
      priority: 'high',
      lastMessageAt: new Date('2024-12-20T09:02:00'),
    },
    {
      id: SEED_IDS.chatConversations.whatsappInquiry,
      channel: ChatChannel.WHATSAPP,
      externalId: 'wa_12345678',
      status: ChatStatus.RESOLVED,
      contactId: SEED_IDS.contacts.sarahMiller,
      assigneeId: SEED_IDS.users.mikeDavis,
      closedAt: new Date('2024-12-18T14:30:00'),
      lastMessageAt: new Date('2024-12-18T14:25:00'),
    },
    {
      id: SEED_IDS.chatConversations.slackIntegration,
      channel: ChatChannel.SLACK,
      externalId: 'slack_C123ABC',
      status: ChatStatus.OPEN,
      assigneeId: SEED_IDS.users.jamesWilson,
      lastMessageAt: new Date('2024-12-21T10:00:00'),
    },
  ];

  for (const conv of conversations) {
    await prisma.chatConversation.upsert({
      where: { id: conv.id },
      update: conv,
      create: conv,
    });
  }

  console.log(`✅ Created ${conversations.length} chat conversations`);
}

async function seedChatMessages() {
  console.log('💭 Seeding chat messages...');

  const messages = [
    {
      id: SEED_IDS.chatMessages.msg1,
      conversationId: SEED_IDS.chatConversations.supportChat1,
      senderId: SEED_IDS.additionalContacts.sarahJenkins,
      senderName: 'Sarah Jenkins',
      senderType: 'contact',
      content: 'Hi, I have a question about the enterprise license pricing.',
    },
    {
      id: SEED_IDS.chatMessages.msg2,
      conversationId: SEED_IDS.chatConversations.supportChat1,
      senderId: SEED_IDS.users.emilyDavis,
      senderName: 'Emily Davis',
      senderType: 'user',
      content: 'Hello Sarah! I\'d be happy to help with pricing. Let me connect you with our sales team.',
    },
    {
      id: SEED_IDS.chatMessages.msg3,
      conversationId: SEED_IDS.chatConversations.whatsappInquiry,
      senderId: SEED_IDS.contacts.sarahMiller,
      senderName: 'Sarah Miller',
      senderType: 'contact',
      content: 'Thanks for the quick response on my inquiry!',
    },
  ];

  for (const msg of messages) {
    await prisma.chatMessage.upsert({
      where: { id: msg.id },
      update: msg,
      create: msg,
    });
  }

  console.log(`✅ Created ${messages.length} chat messages`);
}

// FLOW-018: Call Recording
async function seedCallRecords() {
  console.log('📞 Seeding call records...');

  const calls = [
    {
      id: SEED_IDS.callRecords.discoverySarah,
      direction: 'outbound',
      fromNumber: '+1-555-0100',
      toNumber: '+1-555-0101',
      duration: 1800, // 30 minutes
      status: CallStatus.COMPLETED,
      recordingUrl: 'https://recordings.intelliflow.com/call_001.mp3',
      transcription: 'Sarah: Hi, thanks for taking the time today...\nRep: Of course, let me walk you through our enterprise features...',
      summary: 'Discovery call with Sarah Jenkins. Discussed enterprise features, pricing, and implementation timeline. Scheduled follow-up demo.',
      sentiment: 'positive',
      startedAt: new Date('2024-12-15T10:00:00'),
      endedAt: new Date('2024-12-15T10:30:00'),
      userId: SEED_IDS.users.sarahJohnson,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      dealId: SEED_IDS.opportunities.enterpriseLicenseAcme,
    },
    {
      id: SEED_IDS.callRecords.demoTechCorp,
      direction: 'outbound',
      fromNumber: '+1-555-0100',
      toNumber: '+1-555-0102',
      duration: 2700, // 45 minutes
      status: CallStatus.COMPLETED,
      recordingUrl: 'https://recordings.intelliflow.com/call_002.mp3',
      transcription: 'Demo of the platform...',
      summary: 'Product demo for TechCorp. Very engaged. Requested pricing proposal.',
      sentiment: 'positive',
      startedAt: new Date('2024-12-18T14:00:00'),
      endedAt: new Date('2024-12-18T14:45:00'),
      userId: SEED_IDS.users.mikeDavis,
      contactId: SEED_IDS.contacts.johnSmith,
    },
    {
      id: SEED_IDS.callRecords.supportFollowup,
      direction: 'inbound',
      fromNumber: '+1-555-0103',
      toNumber: '+1-555-0100',
      duration: 600, // 10 minutes
      status: CallStatus.COMPLETED,
      summary: 'Support follow-up on ticket resolution.',
      sentiment: 'neutral',
      startedAt: new Date('2024-12-20T16:00:00'),
      endedAt: new Date('2024-12-20T16:10:00'),
      userId: SEED_IDS.users.emilyDavis,
    },
  ];

  for (const call of calls) {
    await prisma.callRecord.upsert({
      where: { id: call.id },
      update: call,
      create: call,
    });
  }

  console.log(`✅ Created ${calls.length} call records`);
}

// FLOW-021: Document Management
async function seedDocuments() {
  console.log('📄 Seeding documents...');

  const documents = [
    {
      id: SEED_IDS.documents.proposalAcme,
      name: 'Acme Corp Enterprise Proposal',
      fileName: 'Acme_Enterprise_Proposal_2024.pdf',
      fileSize: 2048576, // 2MB
      fileType: 'application/pdf',
      fileUrl: 'https://docs.intelliflow.com/proposals/acme_2024.pdf',
      category: 'proposal',
      status: DocumentStatus.ACTIVE,
      uploadedBy: SEED_IDS.users.sarahJohnson,
      uploadedByName: 'Sarah Johnson',
      accountId: SEED_IDS.accounts.acmeCorp,
      dealId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.documents.contract2024,
      name: 'Master Service Agreement',
      fileName: 'MSA_TechCorp_2024.pdf',
      fileSize: 1548576,
      fileType: 'application/pdf',
      fileUrl: 'https://docs.intelliflow.com/contracts/msa_techcorp.pdf',
      category: 'contract',
      status: DocumentStatus.ACTIVE,
      uploadedBy: SEED_IDS.users.admin,
      uploadedByName: 'System Admin',
      accountId: SEED_IDS.accounts.techCorp,
      description: 'Master Service Agreement signed November 2024',
    },
    {
      id: SEED_IDS.documents.requirementsSpec,
      name: 'Technical Requirements Spec',
      fileName: 'TechCorp_Requirements.docx',
      fileSize: 512000,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileUrl: 'https://docs.intelliflow.com/specs/techcorp_req.docx',
      category: 'specification',
      status: DocumentStatus.ACTIVE,
      uploadedBy: SEED_IDS.users.jamesWilson,
      uploadedByName: 'James Wilson',
      accountId: SEED_IDS.accounts.techCorp,
    },
  ];

  for (const doc of documents) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: doc,
      create: doc,
    });
  }

  console.log(`✅ Created ${documents.length} documents`);
}

// IFC-152: Case Document Management
async function seedCaseDocuments() {
  console.log('📑 Seeding case documents...');

  const userId = SEED_IDS.users.admin;
  
  const caseDocuments = [
    {
      id: SEED_IDS.caseDocuments.employmentAgreement,
      tenant_id: userId,
      version_major: 2,
      version_minor: 1,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'SIGNED',
      title: 'Employment Agreement - Sarah Chen',
      description: 'Standard employment contract with non-compete clause for Senior Software Engineer position',
      document_type: 'CONTRACT',
      classification: 'CONFIDENTIAL',
      tags: ['Employment', 'Legal', 'HR'],
      related_case_id: null,
      related_contact_id: SEED_IDS.contacts.sarahMiller,
      storage_key: 'documents/employment-agreement-sarah-chen.pdf',
      content_hash: 'a'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(245000),
      signed_by: userId,
      signed_at: new Date('2024-12-29T14:00:00'),
      signature_hash: 'signature-' + 'b'.repeat(56),
      signature_ip_address: '192.168.1.100',
      signature_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      created_by: userId,
      created_at: new Date('2024-12-28T14:30:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-29T10:15:00'),
      retention_until: null,
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.ndaTechCorp,
      tenant_id: userId,
      version_major: 1,
      version_minor: 0,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'APPROVED',
      title: 'NDA - TechCorp Partnership',
      description: 'Non-disclosure agreement for Q1 2025 partnership discussions',
      document_type: 'AGREEMENT',
      classification: 'CONFIDENTIAL',
      tags: ['NDA', 'Legal', 'Partnership'],
      related_case_id: null,
      related_contact_id: SEED_IDS.contacts.davidChen,
      storage_key: 'documents/nda-techcorp-2024.pdf',
      content_hash: 'c'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(95000),
      signed_by: userId,
      signed_at: new Date('2024-12-27T16:00:00'),
      signature_hash: 'signature-' + 'd'.repeat(56),
      signature_ip_address: '192.168.1.50',
      signature_user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      created_by: userId,
      created_at: new Date('2024-12-26T11:00:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-27T16:00:00'),
      retention_until: null,
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.motionToDismiss,
      tenant_id: userId,
      version_major: 1,
      version_minor: 3,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'UNDER_REVIEW',
      title: 'Motion to Dismiss - Case #2024-CV-1234',
      description: 'Motion to dismiss based on lack of jurisdiction',
      document_type: 'COURT_FILING',
      classification: 'INTERNAL',
      tags: ['Litigation', 'Motion', 'Civil'],
      related_case_id: null,
      related_contact_id: null,
      storage_key: 'documents/motion-dismiss-cv1234.pdf',
      content_hash: 'e'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(180000),
      signed_by: null,
      signed_at: null,
      signature_hash: null,
      signature_ip_address: null,
      signature_user_agent: null,
      created_by: userId,
      created_at: new Date('2024-12-27T09:15:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-29T11:20:00'),
      retention_until: new Date('2025-12-31T23:59:59'),
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.evidenceEmailLog,
      tenant_id: userId,
      version_major: 1,
      version_minor: 0,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'ARCHIVED',
      title: 'Evidence - Email Communication Log',
      description: 'Email thread regarding contract negotiations with timestamps',
      document_type: 'EVIDENCE',
      classification: 'PRIVILEGED',
      tags: ['Evidence', 'Discovery', 'Email'],
      related_case_id: null,
      related_contact_id: null,
      storage_key: 'documents/evidence-email-log.pdf',
      content_hash: 'f'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(1250000),
      signed_by: null,
      signed_at: null,
      signature_hash: null,
      signature_ip_address: null,
      signature_user_agent: null,
      created_by: userId,
      created_at: new Date('2024-12-25T08:00:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-25T08:00:00'),
      retention_until: new Date('2030-12-31T23:59:59'),
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.serviceAgreement,
      tenant_id: userId,
      version_major: 0,
      version_minor: 2,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'DRAFT',
      title: 'Service Agreement - Cloud Infrastructure',
      description: 'Annual cloud service provider agreement with SLA terms',
      document_type: 'CONTRACT',
      classification: 'INTERNAL',
      tags: ['Contract', 'SaaS', 'Infrastructure'],
      related_case_id: null,
      related_contact_id: null,
      storage_key: 'documents/service-agreement-cloud.pdf',
      content_hash: 'g'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(310000),
      signed_by: null,
      signed_at: null,
      signature_hash: null,
      signature_ip_address: null,
      signature_user_agent: null,
      created_by: userId,
      created_at: new Date('2024-12-24T16:45:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-29T09:30:00'),
      retention_until: null,
      deleted_at: null,
    },
  ];

  for (const doc of caseDocuments) {
    await prisma.caseDocument.upsert({
      where: { id: doc.id },
      update: doc,
      create: doc,
    });

    // Add ACL for admin user
    await prisma.caseDocumentACL.upsert({
      where: {
        document_id_principal_id: {
          document_id: doc.id,
          principal_id: userId,
        },
      },
      update: {},
      create: {
        document_id: doc.id,
        tenant_id: doc.tenant_id,
        principal_id: userId,
        principal_type: 'USER',
        access_level: 'ADMIN',
        granted_by: userId,
        granted_at: doc.created_at,
        expires_at: null,
      },
    });

    // Add some audit logs
    await prisma.caseDocumentAudit.create({
      data: {
        document_id: doc.id,
        tenant_id: doc.tenant_id,
        event_type: 'CREATED',
        metadata: { title: doc.title },
        user_id: userId,
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        created_at: doc.created_at,
      },
    });

    if (doc.status === 'SIGNED' && doc.signed_at) {
      await prisma.caseDocumentAudit.create({
        data: {
          document_id: doc.id,
          tenant_id: doc.tenant_id,
          event_type: 'SIGNED',
          metadata: { signatureHash: doc.signature_hash },
          user_id: userId,
          ip_address: doc.signature_ip_address || '192.168.1.1',
          user_agent: doc.signature_user_agent || 'Mozilla/5.0',
          created_at: doc.signed_at,
        },
      });
    }
  }

  console.log(`✅ Created ${caseDocuments.length} case documents with ACL and audit logs`);
}

// FLOW-015: Customer Feedback (NPS/CSAT)
async function seedFeedbackSurveys() {
  console.log('📊 Seeding feedback surveys...');

  const surveys = [
    {
      id: SEED_IDS.feedbackSurveys.npsSarah,
      type: FeedbackType.NPS,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      contactName: 'Sarah Jenkins',
      contactEmail: 'sarah.jenkins@techflow.com',
      score: 9,
      comment: 'Excellent service! The team was very responsive and the platform exceeded our expectations.',
      sentiment: 'positive',
      status: FeedbackStatus.RESPONDED,
      sentAt: new Date('2024-12-01T10:00:00'),
      respondedAt: new Date('2024-12-02T14:30:00'),
    },
    {
      id: SEED_IDS.feedbackSurveys.csatDavid,
      type: FeedbackType.CSAT,
      contactId: SEED_IDS.contacts.davidChen,
      contactName: 'David Chen',
      contactEmail: 'david.chen@globalsoft.com',
      score: 4,
      comment: 'Good experience overall. Support was helpful.',
      sentiment: 'positive',
      status: FeedbackStatus.RESPONDED,
      sentAt: new Date('2024-12-10T09:00:00'),
      respondedAt: new Date('2024-12-10T16:00:00'),
    },
    {
      id: SEED_IDS.feedbackSurveys.cesMike,
      type: FeedbackType.CES,
      contactId: SEED_IDS.contacts.michaelBrown,
      contactName: 'Michael Brown',
      contactEmail: 'michael.brown@acme.com',
      score: 3,
      comment: 'The onboarding process was straightforward.',
      sentiment: 'neutral',
      status: FeedbackStatus.RESPONDED,
      sentAt: new Date('2024-12-15T11:00:00'),
      respondedAt: new Date('2024-12-16T09:00:00'),
    },
  ];

  for (const survey of surveys) {
    await prisma.feedbackSurvey.upsert({
      where: { id: survey.id },
      update: survey,
      create: survey,
    });
  }

  console.log(`✅ Created ${surveys.length} feedback surveys`);
}

// FLOW-010: Deal Renewals
async function seedDealRenewals(tenantId: string) {
  console.log('🔄 Seeding deal renewals...');

  const renewals = [
    {
      id: SEED_IDS.dealRenewals.acmeRenewal,
      originalDealId: SEED_IDS.opportunities.enterpriseLicenseAcme,
      renewalType: 'annual',
      status: RenewalStatus.UPCOMING,
      renewalDate: new Date('2025-12-01'),
      value: 125000, // 25% increase
      previousValue: 100000,
      changePercent: 25,
      notes: 'Client very satisfied. Likely to expand seats.',
      ownerId: SEED_IDS.users.sarahJohnson,     tenantId,     ownerName: 'Sarah Johnson',
    },
    {
      id: SEED_IDS.dealRenewals.techCorpRenewal,
      originalDealId: SEED_IDS.opportunities.annualSubscriptionTechStart,
      renewalType: 'annual',
      status: RenewalStatus.IN_PROGRESS,
      renewalDate: new Date('2025-02-15'),
      value: 50000,
      previousValue: 45000,
      changePercent: 11.1,
      notes: 'Early renewal discussions started. Very engaged.',
      ownerId: SEED_IDS.users.mikeDavis,     tenantId,     ownerName: 'Mike Davis',
    },
  ];

  for (const renewal of renewals) {
    await prisma.dealRenewal.upsert({
      where: { id: renewal.id },
      update: renewal,
      create: renewal,
    });
  }

  console.log(`✅ Created ${renewals.length} deal renewals`);
}

async function seedAccountHealthScores() {
  console.log('💚 Seeding account health scores...');

  const healthScores = [
    {
      id: SEED_IDS.accountHealthScores.acmeHealth,
      accountId: SEED_IDS.accounts.acmeCorp,
      accountName: 'Acme Corporation',
      overallScore: 92,
      engagementScore: 95,
      usageScore: 88,
      supportScore: 90,
      paymentScore: 100,
      churnRisk: ChurnRisk.LOW,
      calculatedAt: new Date('2024-12-20'),
      riskFactors: {
        logins_per_week: 45,
        features_used: 12,
        support_tickets: 2,
        nps_score: 9,
      },
    },
    {
      id: SEED_IDS.accountHealthScores.techCorpHealth,
      accountId: SEED_IDS.accounts.techCorp,
      accountName: 'TechCorp',
      overallScore: 78,
      engagementScore: 72,
      usageScore: 80,
      supportScore: 85,
      paymentScore: 95,
      churnRisk: ChurnRisk.MEDIUM,
      calculatedAt: new Date('2024-12-20'),
      riskFactors: {
        logins_per_week: 20,
        features_used: 8,
        support_tickets: 5,
        nps_score: 7,
      },
    },
    {
      id: SEED_IDS.accountHealthScores.globalSoftHealth,
      accountId: SEED_IDS.accounts.globalSoft,
      accountName: 'GlobalSoft',
      overallScore: 65,
      engagementScore: 55,
      usageScore: 60,
      supportScore: 70,
      paymentScore: 100,
      churnRisk: ChurnRisk.HIGH,
      calculatedAt: new Date('2024-12-20'),
      riskFactors: {
        logins_per_week: 10,
        features_used: 4,
        support_tickets: 8,
        nps_score: 5,
      },
    },
  ];

  for (const health of healthScores) {
    await prisma.accountHealthScore.upsert({
      where: { id: health.id },
      update: health,
      create: health,
    });
  }

  console.log(`✅ Created ${healthScores.length} account health scores`);
}

// FLOW-012: Agent Skills & Routing
async function seedAgentSkills() {
  console.log('🎯 Seeding agent skills...');

  const skills = [
    {
      id: SEED_IDS.agentSkills.sarahTechnical,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      skillName: 'Technical Sales',
      proficiency: 95,
      certified: true,
      certifiedAt: new Date('2024-01-15'),
    },
    {
      id: SEED_IDS.agentSkills.sarahNegotiation,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      skillName: 'Enterprise Negotiation',
      proficiency: 90,
      certified: true,
      certifiedAt: new Date('2024-03-01'),
    },
    {
      id: SEED_IDS.agentSkills.mikeSupport,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike Davis',
      skillName: 'Technical Support',
      proficiency: 88,
      certified: true,
      certifiedAt: new Date('2024-02-15'),
    },
  ];

  for (const skill of skills) {
    await prisma.agentSkill.upsert({
      where: { id: skill.id },
      update: skill,
      create: skill,
    });
  }

  console.log(`✅ Created ${skills.length} agent skills`);
}

async function seedAgentAvailability() {
  console.log('🟢 Seeding agent availability...');

  const availability = [
    {
      id: SEED_IDS.agentAvailability.sarahAvailable,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      status: AgentStatus.ONLINE,
      currentCapacity: 3,
      maxCapacity: 10,
      lastActiveAt: new Date('2024-12-20T09:00:00'),
    },
    {
      id: SEED_IDS.agentAvailability.mikeAvailable,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike Davis',
      status: AgentStatus.BUSY,
      currentCapacity: 8,
      maxCapacity: 10,
      lastActiveAt: new Date('2024-12-20T10:30:00'),
    },
    {
      id: SEED_IDS.agentAvailability.emilyAvailable,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily Davis',
      status: AgentStatus.ONLINE,
      currentCapacity: 5,
      maxCapacity: 15,
      lastActiveAt: new Date('2024-12-20T08:00:00'),
    },
  ];

  for (const avail of availability) {
    await prisma.agentAvailability.upsert({
      where: { id: avail.id },
      update: avail,
      create: avail,
    });
  }

  console.log(`✅ Created ${availability.length} agent availability records`);
}

async function seedRoutingRules() {
  console.log('🔀 Seeding routing rules...');

  const rules = [
    {
      id: SEED_IDS.routingRules.enterpriseDeals,
      name: 'Enterprise Deal Routing',
      description: 'Route enterprise deals ($100k+) to senior sales team',
      priority: 1,
      conditions: {
        deal_value: { operator: 'gte', value: 100000 },
        account_type: 'enterprise',
      },
      actions: {
        assign_to_team: SEED_IDS.teams.sales,
        notify: ['slack', 'email'],
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.technicalSupport,
      name: 'Technical Support Routing',
      description: 'Route technical tickets to engineering team',
      priority: 2,
      conditions: {
        ticket_category: 'technical',
        priority: { operator: 'in', value: ['high', 'critical'] },
      },
      actions: {
        assign_to_team: SEED_IDS.teams.engineering,
        escalate_after_hours: 4,
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.urgentEscalation,
      name: 'Urgent Escalation',
      description: 'Escalate urgent issues to management',
      priority: 0,
      conditions: {
        priority: 'critical',
        sla_status: 'breached',
      },
      actions: {
        assign_to: SEED_IDS.users.manager,
        notify: ['email', 'sms', 'slack'],
        create_incident: true,
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const rule of rules) {
    await prisma.routingRule.upsert({
      where: { id: rule.id },
      update: rule,
      create: rule,
    });
  }

  console.log(`✅ Created ${rules.length} routing rules`);
}

// FLOW-011, FLOW-013: Ticket Categories & SLA
async function seedTicketCategories() {
  console.log('🏷️ Seeding ticket categories...');

  const categories = [
    {
      id: SEED_IDS.ticketCategories.billing,
      name: 'Billing',
      description: 'Billing and payment related inquiries',
      color: '#10B981',
      icon: 'credit-card',
      isActive: true,
    },
    {
      id: SEED_IDS.ticketCategories.technical,
      name: 'Technical Support',
      description: 'Technical issues and troubleshooting',
      color: '#3B82F6',
      icon: 'wrench',
      isActive: true,
    },
    {
      id: SEED_IDS.ticketCategories.featureRequest,
      name: 'Feature Request',
      description: 'New feature requests and suggestions',
      color: '#8B5CF6',
      icon: 'lightbulb',
      isActive: true,
    },
    {
      id: SEED_IDS.ticketCategories.general,
      name: 'General Inquiry',
      description: 'General questions and information requests',
      color: '#6B7280',
      icon: 'info',
      isActive: true,
    },
  ];

  for (const category of categories) {
    await prisma.ticketCategory.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  console.log(`✅ Created ${categories.length} ticket categories`);
}

async function seedSLABreaches() {
  console.log('⚠️ Seeding SLA breaches...');

  const breaches = [
    {
      id: SEED_IDS.slaBreaches.responseBreachOutage,
      ticketId: SEED_IDS.tickets.systemOutage,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      breachType: 'response',
      targetTime: new Date('2024-12-19T02:30:00'), // Target was 30 min from 02:00
      breachedAt: new Date('2024-12-19T02:45:00'), // Actually responded at 45 min
      durationOverdue: 15, // 15 minutes late
      resolved: true,
      resolvedAt: new Date('2024-12-19T03:30:00'),
      notes: 'Overnight incident - on-call team responded within 15 minutes of alert',
    },
    {
      id: SEED_IDS.slaBreaches.resolutionBreachLogin,
      ticketId: SEED_IDS.tickets.loginFailure,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      breachType: 'resolution',
      targetTime: new Date('2024-12-18T09:00:00'), // Target was 8 hours (480 min)
      breachedAt: new Date('2024-12-18T17:00:00'), // Breached at 17:00
      durationOverdue: 60, // 1 hour late (540-480)
      resolved: false,
      notes: 'Required escalation to identity provider - external dependency',
    },
  ];

  for (const breach of breaches) {
    await prisma.sLABreach.upsert({
      where: { id: breach.id },
      update: breach,
      create: breach,
    });
  }

  console.log(`✅ Created ${breaches.length} SLA breaches`);
}

async function seedEscalationHistory() {
  console.log('📈 Seeding escalation history...');

  const escalations = [
    {
      id: SEED_IDS.escalationHistory.outageEscalation,
      ticketId: SEED_IDS.tickets.systemOutage,
      fromUserId: SEED_IDS.users.emilyDavis,
      fromUserName: 'Emily Davis',
      toUserId: SEED_IDS.users.manager,
      toUserName: 'Manager',
      level: 2,
      reason: 'Critical system outage affecting multiple customers',
      escalatedAt: new Date('2024-12-19T02:15:00'),
      acknowledgedAt: new Date('2024-12-19T02:20:00'),
    },
    {
      id: SEED_IDS.escalationHistory.billingEscalation,
      ticketId: SEED_IDS.tickets.billingInquiry,
      fromUserId: SEED_IDS.users.mikeDavis,
      fromUserName: 'Mike Davis',
      toUserId: SEED_IDS.users.sarahJohnson,
      toUserName: 'Sarah Johnson',
      level: 1,
      reason: 'Enterprise customer requesting discount review',
      escalatedAt: new Date('2024-12-17T10:00:00'),
      acknowledgedAt: new Date('2024-12-17T10:15:00'),
    },
  ];

  for (const escalation of escalations) {
    await prisma.escalationHistory.upsert({
      where: { id: escalation.id },
      update: escalation,
      create: escalation,
    });
  }

  console.log(`✅ Created ${escalations.length} escalation history records`);
}

// FLOW-025, FLOW-026: Workflow Engine
async function seedWorkflowDefinitions() {
  console.log('⚙️ Seeding workflow definitions...');

  const workflows = [
    {
      id: SEED_IDS.workflowDefinitions.leadQualification,
      name: 'Lead Qualification Workflow',
      description: 'Automated lead qualification and scoring',
      category: 'sales',
      triggerType: 'lead.created',
      triggerConfig: { source: ['website', 'referral'] },
      steps: [
        { id: 1, type: 'score', config: { model: 'ai_scoring_v2' } },
        { id: 2, type: 'condition', config: { field: 'score', operator: 'gte', value: 70 } },
        { id: 3, type: 'assign', config: { to: 'sales_team' } },
        { id: 4, type: 'notify', config: { channel: 'slack', template: 'new_qualified_lead' } },
      ],
      isActive: true,
      version: 2,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.workflowDefinitions.dealApproval,
      name: 'Deal Approval Workflow',
      description: 'Multi-stage deal approval process',
      category: 'sales',
      triggerType: 'deal.stage_changed',
      triggerConfig: { stage: 'negotiation', value_gte: 50000 },
      steps: [
        { id: 1, type: 'approval', config: { approver: 'sales_manager' } },
        { id: 2, type: 'condition', config: { field: 'value', operator: 'gte', value: 100000 } },
        { id: 3, type: 'approval', config: { approver: 'vp_sales', if_condition: true } },
        { id: 4, type: 'notify', config: { channel: 'email', template: 'deal_approved' } },
      ],
      isActive: true,
      version: 1,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.workflowDefinitions.ticketRouting,
      name: 'Ticket Auto-Routing',
      description: 'Intelligent ticket routing based on category and priority',
      category: 'support',
      triggerType: 'ticket.created',
      triggerConfig: {},
      steps: [
        { id: 1, type: 'classify', config: { model: 'ticket_classifier_v1' } },
        { id: 2, type: 'route', config: { rules: 'standard_routing' } },
        { id: 3, type: 'sla', config: { policy: 'auto_select' } },
        { id: 4, type: 'notify', config: { channel: 'internal', template: 'new_ticket_assigned' } },
      ],
      isActive: true,
      version: 1,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const workflow of workflows) {
    await prisma.workflowDefinition.upsert({
      where: { id: workflow.id },
      update: workflow,
      create: workflow,
    });
  }

  console.log(`✅ Created ${workflows.length} workflow definitions`);
}

async function seedWorkflowExecutions() {
  console.log('▶️ Seeding workflow executions...');

  const executions = [
    {
      id: SEED_IDS.workflowExecutions.leadQual1,
      workflowId: SEED_IDS.workflowDefinitions.leadQualification,
      triggeredBy: 'system',
      entityType: 'lead',
      entityId: SEED_IDS.leads.sarahMiller,
      triggerData: { lead_id: SEED_IDS.leads.sarahMiller, source: 'website' },
      status: WorkflowStatus.COMPLETED,
      currentStep: 4,
      stepResults: [
        { step: 1, status: 'completed', result: { score: 85 } },
        { step: 2, status: 'completed', result: { passed: true } },
        { step: 3, status: 'completed', result: { assigned_to: SEED_IDS.users.sarahJohnson } },
        { step: 4, status: 'completed', result: { notification_sent: true } },
      ],
      startedAt: new Date('2024-12-20T10:00:00'),
      completedAt: new Date('2024-12-20T10:00:05'),
    },
    {
      id: SEED_IDS.workflowExecutions.dealApproval1,
      workflowId: SEED_IDS.workflowDefinitions.dealApproval,
      triggeredBy: 'user',
      entityType: 'deal',
      entityId: SEED_IDS.opportunities.enterpriseLicenseAcme,
      triggerData: { deal_id: SEED_IDS.opportunities.enterpriseLicenseAcme },
      status: WorkflowStatus.RUNNING,
      currentStep: 2,
      stepResults: [
        { step: 1, status: 'completed', result: { approved: true, approver: SEED_IDS.users.manager } },
        { step: 2, status: 'pending', result: null },
      ],
      startedAt: new Date('2024-12-21T14:00:00'),
    },
  ];

  for (const execution of executions) {
    await prisma.workflowExecution.upsert({
      where: { id: execution.id },
      update: execution,
      create: execution,
    });
  }

  console.log(`✅ Created ${executions.length} workflow executions`);
}

// FLOW-027: Business Rules
async function seedBusinessRules() {
  console.log('📏 Seeding business rules...');

  const rules = [
    {
      id: SEED_IDS.businessRules.discountApproval,
      name: 'Discount Approval Threshold',
      description: 'Requires manager approval for discounts over 15%',
      entityType: 'deal',
      ruleType: 'validation',
      conditions: { discount_percentage: { operator: 'gt', value: 15 } },
      actions: { require_approval: true, approver_role: 'manager' },
      priority: 1,
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.businessRules.autoAssignment,
      name: 'Auto-Assignment by Territory',
      description: 'Automatically assign leads based on geographic territory',
      entityType: 'lead',
      ruleType: 'automation',
      conditions: { lead_country: { operator: 'in', value: ['US', 'CA'] } },
      actions: { assign_to_team: SEED_IDS.teams.sales },
      priority: 2,
      isActive: true,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.businessRules.escalationTrigger,
      name: 'SLA Escalation Trigger',
      description: 'Escalate tickets approaching SLA breach',
      entityType: 'ticket',
      ruleType: 'automation',
      conditions: { sla_remaining_percent: { operator: 'lt', value: 20 } },
      actions: { escalate: true, notify: ['manager', 'slack'] },
      priority: 0,
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const rule of rules) {
    await prisma.businessRule.upsert({
      where: { id: rule.id },
      update: rule,
      create: rule,
    });
  }

  console.log(`✅ Created ${rules.length} business rules`);
}

// FLOW-022, FLOW-023: Dashboards & Reports
async function seedDashboardConfigs() {
  console.log('📊 Seeding dashboard configs...');

  const dashboards = [
    {
      id: SEED_IDS.dashboardConfigs.salesDashboard,
      name: 'Sales Dashboard',
      userId: SEED_IDS.users.sarahJohnson,
      isDefault: true,
      layout: { columns: 3, rows: 4 },
      widgets: [
        { id: 'pipeline', type: 'pipeline', position: { x: 0, y: 0, w: 2, h: 2 } },
        { id: 'revenue', type: 'kpi', position: { x: 2, y: 0, w: 1, h: 1 } },
        { id: 'deals', type: 'deals_won', position: { x: 2, y: 1, w: 1, h: 1 } },
        { id: 'activities', type: 'recent_activities', position: { x: 0, y: 2, w: 3, h: 2 } },
      ],
    },
    {
      id: SEED_IDS.dashboardConfigs.supportDashboard,
      name: 'Support Dashboard',
      userId: SEED_IDS.users.emilyDavis,
      isDefault: true,
      layout: { columns: 3, rows: 3 },
      widgets: [
        { id: 'tickets', type: 'ticket_overview', position: { x: 0, y: 0, w: 2, h: 1 } },
        { id: 'sla', type: 'sla_status', position: { x: 2, y: 0, w: 1, h: 1 } },
        { id: 'csat', type: 'csat_trend', position: { x: 0, y: 1, w: 3, h: 2 } },
      ],
    },
    {
      id: SEED_IDS.dashboardConfigs.executiveDashboard,
      name: 'Executive Overview',
      userId: SEED_IDS.users.admin,
      isDefault: false,
      layout: { columns: 4, rows: 4 },
      widgets: [
        { id: 'revenue', type: 'revenue_chart', position: { x: 0, y: 0, w: 2, h: 2 } },
        { id: 'growth', type: 'growth_metrics', position: { x: 2, y: 0, w: 2, h: 2 } },
        { id: 'health', type: 'account_health', position: { x: 0, y: 2, w: 2, h: 2 } },
        { id: 'performance', type: 'team_performance', position: { x: 2, y: 2, w: 2, h: 2 } },
      ],
    },
  ];

  for (const dashboard of dashboards) {
    await prisma.dashboardConfig.upsert({
      where: { id: dashboard.id },
      update: dashboard,
      create: dashboard,
    });
  }

  console.log(`✅ Created ${dashboards.length} dashboard configs`);
}

async function seedKPIDefinitions() {
  console.log('🎯 Seeding KPI definitions...');

  const kpis = [
    {
      id: SEED_IDS.kpiDefinitions.revenueTarget,
      name: 'Monthly Revenue Target',
      description: 'Track monthly recurring revenue against target',
      category: 'sales',
      metric: 'mrr',
      calculation: 'sum',
      target: 500000,
      unit: '$',
      format: 'currency',
      isActive: true,
    },
    {
      id: SEED_IDS.kpiDefinitions.ticketResolution,
      name: 'First Response Time',
      description: 'Average first response time for support tickets',
      category: 'support',
      metric: 'avg_first_response',
      calculation: 'average',
      target: 60,
      unit: 'minutes',
      format: 'duration',
      isActive: true,
    },
    {
      id: SEED_IDS.kpiDefinitions.customerSatisfaction,
      name: 'Customer Satisfaction Score',
      description: 'Overall CSAT from post-interaction surveys',
      category: 'support',
      metric: 'csat',
      calculation: 'percentage',
      target: 90,
      unit: '%',
      format: 'percentage',
      isActive: true,
    },
  ];

  for (const kpi of kpis) {
    await prisma.kPIDefinition.upsert({
      where: { id: kpi.id },
      update: kpi,
      create: kpi,
    });
  }

  console.log(`✅ Created ${kpis.length} KPI definitions`);
}

async function seedReportDefinitions() {
  console.log('📈 Seeding report definitions...');

  const reports = [
    {
      id: SEED_IDS.reportDefinitions.salesPipeline,
      name: 'Sales Pipeline Report',
      description: 'Weekly overview of sales pipeline and deal progression',
      category: 'sales',
      type: 'table',
      dataSource: 'opportunities',
      columns: ['name', 'stage', 'value', 'probability', 'expected_close', 'owner'],
      filters: { status: 'open' },
      grouping: { by: 'stage' },
      isPublic: false,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.reportDefinitions.supportMetrics,
      name: 'Support Metrics Report',
      description: 'Daily support ticket metrics and SLA compliance',
      category: 'support',
      type: 'summary',
      dataSource: 'tickets',
      columns: ['ticket_count', 'avg_resolution_time', 'sla_compliance', 'csat'],
      filters: {},
      isPublic: true,
      createdBy: SEED_IDS.users.emilyDavis,
    },
    {
      id: SEED_IDS.reportDefinitions.revenueAnalysis,
      name: 'Revenue Analysis',
      description: 'Monthly revenue breakdown by segment and product',
      category: 'finance',
      type: 'chart',
      dataSource: 'deals',
      columns: ['revenue', 'segment', 'product', 'month'],
      filters: { status: 'closed_won' },
      grouping: { by: 'segment' },
      chartConfig: { type: 'bar', axis: { x: 'month', y: 'revenue' } },
      isPublic: false,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const report of reports) {
    await prisma.reportDefinition.upsert({
      where: { id: report.id },
      update: report,
      create: report,
    });
  }

  console.log(`✅ Created ${reports.length} report definitions`);
}

// FLOW-024: AI Insights
async function seedAIInsights() {
  console.log('🤖 Seeding AI insights...');

  const insights = [
    {
      id: SEED_IDS.aiInsights.dealRiskAcme,
      type: 'prediction',
      category: 'risk',
      title: 'Deal at Risk: Acme Corp Enterprise License',
      description: 'Deal showing signs of stalling. No activity in 14 days. Risk factors include no recent activity, stakeholder change, and competitor mention.',
      confidence: 85,
      priority: 'high',
      entityType: 'deal',
      entityId: SEED_IDS.opportunities.enterpriseLicenseAcme,
      suggestedActions: ['Schedule executive review', 'Offer additional demo', 'Provide case studies'],
      metadata: {
        deal_id: SEED_IDS.opportunities.enterpriseLicenseAcme,
        risk_factors: ['no_recent_activity', 'stakeholder_change', 'competitor_mention'],
      },
      status: InsightStatus.NEW,
    },
    {
      id: SEED_IDS.aiInsights.churnRiskTechCorp,
      type: 'prediction',
      category: 'risk',
      title: 'Churn Risk Alert: TechCorp',
      description: 'Account health score declining. Product usage down 40% this month. Engagement signals show reduced logins, fewer support tickets, and missed training sessions.',
      confidence: 78,
      priority: 'high',
      entityType: 'account',
      entityId: SEED_IDS.accounts.techCorp,
      suggestedActions: ['Schedule check-in call', 'Offer additional training', 'Review account health'],
      metadata: {
        account_id: SEED_IDS.accounts.techCorp,
        health_score: 65,
        usage_trend: -40,
        engagement_signals: ['reduced_logins', 'fewer_support_tickets', 'missed_training'],
      },
      status: InsightStatus.NEW,
    },
    {
      id: SEED_IDS.aiInsights.upsellOpportunity,
      type: 'recommendation',
      category: 'sales',
      title: 'Upsell Opportunity: GlobalSoft',
      description: 'Account approaching user limit (45/50 users). Usage growing 25% monthly. Good candidate for enterprise plan upgrade with potential value of $25,000.',
      confidence: 82,
      priority: 'medium',
      entityType: 'account',
      entityId: SEED_IDS.accounts.globalSoft,
      suggestedActions: ['Present enterprise plan', 'Schedule upgrade discussion', 'Prepare ROI analysis'],
      metadata: {
        account_id: SEED_IDS.accounts.globalSoft,
        current_users: 45,
        user_limit: 50,
        usage_growth: 25,
        recommended_plan: 'enterprise',
        potential_value: 25000,
      },
      status: InsightStatus.NEW,
    },
  ];

  for (const insight of insights) {
    await prisma.aIInsight.upsert({
      where: { id: insight.id },
      update: insight,
      create: insight,
    });
  }

  console.log(`✅ Created ${insights.length} AI insights`);
}

// FLOW-031, FLOW-032, FLOW-033: Monitoring & Observability
async function seedHealthChecks() {
  console.log('🏥 Seeding health checks...');

  const checks = [
    {
      id: SEED_IDS.healthChecks.apiGateway,
      serviceName: 'api-gateway',
      status: HealthStatus.HEALTHY,
      responseTime: 45,
      details: { version: '2.1.0', uptime: '99.99%' },
      checkedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.healthChecks.database,
      serviceName: 'postgresql',
      status: HealthStatus.HEALTHY,
      responseTime: 12,
      details: { connections: 45, max_connections: 100 },
      checkedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.healthChecks.aiWorker,
      serviceName: 'ai-worker',
      status: HealthStatus.DEGRADED,
      responseTime: 850,
      error: 'High queue length detected',
      details: { queue_length: 150, avg_processing_time: '2.5s' },
      checkedAt: new Date('2024-12-21T12:00:00'),
    },
  ];

  for (const check of checks) {
    await prisma.healthCheck.upsert({
      where: { id: check.id },
      update: check,
      create: check,
    });
  }

  console.log(`✅ Created ${checks.length} health checks`);
}

async function seedAlertIncidents() {
  console.log('🚨 Seeding alert incidents...');

  const incidents = [
    {
      id: SEED_IDS.alertIncidents.highLatency,
      alertName: 'High API Latency',
      severity: 'warning',
      source: 'prometheus',
      message: 'API response time exceeded 500ms threshold for 5 minutes',
      status: AlertStatus.RESOLVED,
      firedAt: new Date('2024-12-20T14:30:00'),
      acknowledgedBy: SEED_IDS.users.jamesWilson,
      acknowledgedAt: new Date('2024-12-20T14:32:00'),
      resolvedBy: SEED_IDS.users.jamesWilson,
      resolvedAt: new Date('2024-12-20T14:45:00'),
      details: { endpoint: '/api/leads', avg_latency: 650 },
    },
    {
      id: SEED_IDS.alertIncidents.errorSpike,
      alertName: 'Error Rate Spike',
      severity: 'critical',
      source: 'sentry',
      message: 'Error rate increased by 300% in the last 10 minutes',
      status: AlertStatus.ACKNOWLEDGED,
      firedAt: new Date('2024-12-21T11:00:00'),
      acknowledgedBy: SEED_IDS.users.admin,
      acknowledgedAt: new Date('2024-12-21T11:05:00'),
      details: { error_count: 450, normal_rate: 15 },
    },
  ];

  for (const incident of incidents) {
    await prisma.alertIncident.upsert({
      where: { id: incident.id },
      update: incident,
      create: incident,
    });
  }

  console.log(`✅ Created ${incidents.length} alert incidents`);
}

async function seedPerformanceMetrics() {
  console.log('📉 Seeding performance metrics...');

  const metrics = [
    {
      id: SEED_IDS.performanceMetrics.apiLatency,
      metricName: 'api_response_time_p95',
      metricType: 'histogram',
      value: 125,
      unit: 'ms',
      serviceName: 'api-gateway',
      tags: { endpoint: '/api/*', percentile: 95 },
      recordedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.performanceMetrics.dbQueryTime,
      metricName: 'db_query_time_avg',
      metricType: 'gauge',
      value: 18,
      unit: 'ms',
      serviceName: 'postgresql',
      tags: { operation: 'read' },
      recordedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.performanceMetrics.aiResponseTime,
      metricName: 'ai_scoring_latency_p99',
      metricType: 'histogram',
      value: 1850,
      unit: 'ms',
      serviceName: 'ai-worker',
      tags: { model: 'lead_scorer_v2', percentile: 99 },
      recordedAt: new Date('2024-12-21T12:00:00'),
    },
  ];

  for (const metric of metrics) {
    await prisma.performanceMetric.upsert({
      where: { id: metric.id },
      update: metric,
      create: metric,
    });
  }

  console.log(`✅ Created ${metrics.length} performance metrics`);
}

// FLOW-034: Webhooks
async function seedWebhookEndpoints() {
  console.log('🔗 Seeding webhook endpoints...');

  const endpoints = [
    {
      id: SEED_IDS.webhookEndpoints.slackNotifications,
      name: 'Slack Notifications',
      url: 'https://hooks.slack.com/services/T00/B00/XXXX',
      events: ['deal.won', 'deal.lost', 'ticket.escalated'],
      secret: 'whsec_slack_integration_secret',
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.webhookEndpoints.zapierIntegration,
      name: 'Zapier Integration',
      url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
      events: ['lead.created', 'contact.updated', 'deal.stage_changed'],
      secret: 'whsec_zapier_integration_secret',
      isActive: true,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.webhookEndpoints.customCRM,
      name: 'Legacy CRM Sync',
      url: 'https://legacy-crm.example.com/api/webhooks/intelliflow',
      events: ['contact.created', 'contact.updated', 'deal.created'],
      secret: 'whsec_legacy_crm_secret',
      isActive: false,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const endpoint of endpoints) {
    await prisma.webhookEndpoint.upsert({
      where: { id: endpoint.id },
      update: endpoint,
      create: endpoint,
    });
  }

  console.log(`✅ Created ${endpoints.length} webhook endpoints`);
}

// FLOW-035, FLOW-036: API Management
async function seedAPIKeys() {
  console.log('🔑 Seeding API keys...');

  const keys = [
    {
      id: SEED_IDS.apiKeys.mobileApp,
      name: 'Mobile App API Key',
      keyHash: 'sha256_mobile_app_key_hash_placeholder',
      keyPrefix: 'if_mob_',
      userId: SEED_IDS.users.admin,
      scopes: ['read:leads', 'read:contacts', 'read:deals', 'write:tasks'],
      rateLimit: 1000,
      isActive: true,
      lastUsedAt: new Date('2024-12-21T10:30:00'),
      expiresAt: new Date('2025-12-21'),
    },
    {
      id: SEED_IDS.apiKeys.integration,
      name: 'Integration API Key',
      keyHash: 'sha256_integration_key_hash_placeholder',
      keyPrefix: 'if_int_',
      userId: SEED_IDS.users.manager,
      scopes: ['read:*', 'write:leads', 'write:contacts'],
      rateLimit: 5000,
      isActive: true,
      lastUsedAt: new Date('2024-12-21T11:00:00'),
      expiresAt: new Date('2025-06-21'),
    },
    {
      id: SEED_IDS.apiKeys.internal,
      name: 'Internal Services Key',
      keyHash: 'sha256_internal_key_hash_placeholder',
      keyPrefix: 'if_srv_',
      userId: SEED_IDS.users.admin,
      scopes: ['admin:*'],
      rateLimit: 10000,
      isActive: true,
    },
  ];

  for (const key of keys) {
    await prisma.aPIKey.upsert({
      where: { id: key.id },
      update: key,
      create: key,
    });
  }

  console.log(`✅ Created ${keys.length} API keys`);
}

async function seedAPIVersions() {
  console.log('🔢 Seeding API versions...');

  const versions = [
    {
      id: SEED_IDS.apiVersions.v1,
      version: 'v1',
      releaseDate: new Date('2024-01-15'),
      deprecatedAt: new Date('2024-12-01'),
      sunsetDate: new Date('2025-06-01'),
      status: 'deprecated',
      changelog: 'Initial API release',
      breakingChanges: [],
    },
    {
      id: SEED_IDS.apiVersions.v2,
      version: 'v2',
      releaseDate: new Date('2024-06-01'),
      status: 'current',
      changelog: 'Major performance improvements, new endpoints for AI features',
      breakingChanges: ['Removed /api/v1/legacy endpoints', 'Changed pagination format'],
    },
  ];

  for (const version of versions) {
    await prisma.aPIVersion.upsert({
      where: { id: version.id },
      update: version,
      create: version,
    });
  }

  console.log(`✅ Created ${versions.length} API versions`);
}

// =============================================================================
// Tenant Management
// =============================================================================

async function getDefaultTenant() {
  console.log('🏢 Getting default tenant...');

  // Try to find the existing default tenant (created by migration)
  let tenant = await prisma.tenant.findUnique({
    where: { slug: 'default' },
  });

  // If found, return it; otherwise, create it (for fresh databases)
  if (tenant) {
    console.log('✅ Found existing default tenant');
    return tenant;
  }

  tenant = await prisma.tenant.create({
    data: {
      name: 'Default Organization',
      slug: 'default',
      status: 'ACTIVE',
    },
  });
  console.log('✅ Created default tenant');
  return tenant;
}

// =============================================================================
// Main Function
// =============================================================================

async function main() {
  console.log('🌱 Starting database seeding...\n');
  console.log('📊 Seeding data from frontend UI mockups:\n');

  try {
    // Get or create default tenant (for multi-tenancy)
    const defaultTenant = await getDefaultTenant();
    const tenantId = defaultTenant.id;

    // Clean existing seed data for idempotency
    await cleanDatabase();

    // Seed RBAC infrastructure first (enables database-driven permissions)
    await seedRBACPermissions();
    await seedRBACRoles();
    await seedRBACRolePermissions();

    // Seed data in correct order (respecting foreign key constraints)
    await seedUsers(tenantId);
    await seedAccounts(tenantId);
    await seedLeads(tenantId);
    await seedContacts(tenantId);
    await seedOpportunities(tenantId);
    await seedSLAPolicies(tenantId);
    await seedTickets(tenantId);
    await seedTasks(tenantId);
    await seedAIScores();
    await seedAuditLogs(tenantId);
    await seedDomainEvents();

    // Seed supplementary data (requires parent records)
    await seedDealProducts();
    await seedDealFiles();
    await seedDealActivities();
    await seedTicketActivities();
    await seedTicketAttachments();

    // Seed additional UI mockup data (Agent Actions, Contact Activities, Dashboard Activities)
    await seedAdditionalUsersAndAccounts(tenantId);
    await seedAgentActions();
    await seedContactActivities();
    await seedDashboardActivities();

    // Seed comprehensive UI data (contacts 360, dashboard widgets, analytics)
    await seedContactNotes();
    await seedContactAIInsights();
    await seedCalendarEvents(tenantId);
    await seedTeamMessages();
    await seedPipelineSnapshots();
    await seedTrafficSources();
    await seedGrowthMetrics();
    await seedDealsWonMetrics();
    await seedTicketNextSteps();
    await seedRelatedTickets();
    await seedTicketAIInsights();
    await seedSalesPerformance();
    await seedDashboardTasks(tenantId);
    await seedContactDeals(tenantId);
    await seedContactTasks(tenantId);

    // =========================================================================
    // NEW FLOW COVERAGE DATA (FLOW-001 to FLOW-038)
    // =========================================================================

    // FLOW-002, FLOW-004: Teams & Workspaces
    await seedWorkspaces();
    await seedTeams();
    await seedTeamMembers();

    // FLOW-016: Email Communication
    await seedEmailTemplates();
    await seedEmailRecords();

    // FLOW-017: Chat Integration
    await seedChatConversations();
    await seedChatMessages();

    // FLOW-018: Call Recording
    await seedCallRecords();

    // FLOW-021: Document Management
    await seedDocuments();

    // IFC-152: Case Document Management
    await seedCaseDocuments();

    // FLOW-015: Customer Feedback (NPS/CSAT)
    await seedFeedbackSurveys();

    // FLOW-010: Deal Renewals & Account Health
    await seedDealRenewals(tenantId);
    await seedAccountHealthScores();

    // FLOW-012: Agent Skills & Routing
    await seedAgentSkills();
    await seedAgentAvailability();
    await seedRoutingRules();

    // FLOW-011, FLOW-013: Ticket Categories & SLA
    await seedTicketCategories();
    await seedSLABreaches();
    await seedEscalationHistory();

    // FLOW-025, FLOW-026: Workflow Engine
    await seedWorkflowDefinitions();
    await seedWorkflowExecutions();

    // FLOW-027: Business Rules
    await seedBusinessRules();

    // FLOW-022, FLOW-023: Dashboards & Reports
    await seedDashboardConfigs();
    await seedKPIDefinitions();
    await seedReportDefinitions();

    // FLOW-024: AI Insights
    await seedAIInsights();

    // FLOW-031, FLOW-032, FLOW-033: Monitoring & Observability
    await seedHealthChecks();
    await seedAlertIncidents();
    await seedPerformanceMetrics();

    // FLOW-034: Webhooks
    await seedWebhookEndpoints();

    // FLOW-035, FLOW-036: API Management
    await seedAPIKeys();
    await seedAPIVersions();

    console.log('\n✨ Database seeding completed successfully!\n');
    console.log('📊 Summary (matching UI mockups + ALL 38 FLOWS):');
    console.log('');
    console.log('  CORE ENTITIES:');
    console.log('  - 13 users (admin, manager, sales reps, support team, Alice Smith, Bob Jones)');
    console.log('  - 14 accounts (TechCorp, Acme Corp, MegaCorp, TechFlow Inc., etc.)');
    console.log('  - 5 leads (Sarah Miller, David Chen, etc.)');
    console.log('  - 11 contacts (with account relationships, includes Sarah Jenkins)');
    console.log('  - 12 opportunities/deals (across all pipeline stages + contact deals)');
    console.log('  - 2 SLA policies (Standard & Premium)');
    console.log('  - 6 tickets (with SLA statuses: Breached, At Risk, On Track)');
    console.log('  - 13 tasks (Dashboard widgets, Deal detail, Contact tasks)');
    console.log('  - 5 AI scores (for lead scoring)');
    console.log('  - 3 audit logs');
    console.log('  - 3 domain events');
    console.log('');
    console.log('  SUPPLEMENTARY DATA:');
    console.log('  - 2 deal products (Enterprise License, Implementation)');
    console.log('  - 2 deal files (Acme_MSA_v3.pdf, Requirements_Doc.docx)');
    console.log('  - 5 deal activities (AI agent actions, emails, calls, stage changes)');
    console.log('  - 6 ticket activities (customer messages, agent replies, system events)');
    console.log('  - 3 ticket attachments (error logs, screenshot, DevOps analysis)');
    console.log('');
    console.log('  ADDITIONAL UI DATA:');
    console.log('  - 4 agent actions (AI approval queue from agent-approvals/preview)');
    console.log('  - 10 contact activities (from contacts/[id] detail page)');
    console.log('  - 2 dashboard activities (from RecentActivityWidget)');
    console.log('');
    console.log('  COMPREHENSIVE UI DATA:');
    console.log('  - 2 contact notes, 1 contact AI insight, 4 calendar events');
    console.log('  - 3 team messages, 4 pipeline snapshots, 4 traffic sources');
    console.log('  - 12 growth metrics, 6 deals won metrics, 4 sales performance records');
    console.log('  - 3 ticket next steps, 3 related tickets, 1 ticket AI insight');
    console.log('');
    console.log('  🆕 FLOW COVERAGE DATA (38 FLOWS):');
    console.log('  FLOW-002/004: 2 workspaces, 3 teams, 3 team members');
    console.log('  FLOW-016: 3 email templates, 3 email records');
    console.log('  FLOW-017: 3 chat conversations, 3 chat messages');
    console.log('  FLOW-018: 3 call records with transcription & sentiment');
    console.log('  FLOW-021: 3 documents with categories');
    console.log('  IFC-152: 5 case documents with ACL, versions, signatures');
    console.log('  FLOW-015: 3 feedback surveys (NPS, CSAT, CES)');
    console.log('  FLOW-010: 2 deal renewals, 3 account health scores');
    console.log('  FLOW-012: 3 agent skills, 3 agent availability, 3 routing rules');
    console.log('  FLOW-011/013: 4 ticket categories, 2 SLA breaches, 2 escalations');
    console.log('  FLOW-025/026: 3 workflow definitions, 2 workflow executions');
    console.log('  FLOW-027: 3 business rules');
    console.log('  FLOW-022/023: 3 dashboard configs, 3 KPIs, 3 report definitions');
    console.log('  FLOW-024: 3 AI insights (deal risk, churn risk, upsell)');
    console.log('  FLOW-031/032/033: 3 health checks, 2 alert incidents, 3 performance metrics');
    console.log('  FLOW-034: 3 webhook endpoints');
    console.log('  FLOW-035/036: 3 API keys, 2 API versions');
    console.log('');
    console.log('\n🎉 Ready for development! Data matches ALL 104 frontend mockup files + ALL 38 FLOWS!\n');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}



(async () => {
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();