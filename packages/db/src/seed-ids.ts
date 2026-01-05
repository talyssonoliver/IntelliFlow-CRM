/**
 * Seed IDs - Single Source of Truth
 *
 * This file contains all seed data IDs used across the application.
 * Import these IDs in:
 * - packages/db/prisma/seed.ts (database seeding)
 * - apps/api/src/test/integration-setup.ts (test fixtures)
 * - Any test files that need consistent test data IDs
 *
 * IMPORTANT: Do not duplicate these IDs elsewhere. Always import from here.
 */

export const SEED_IDS = {
  users: {
    admin: 'seed-user-admin-001',
    manager: 'seed-user-manager-001',
    sarahJohnson: 'seed-user-sarah-johnson',
    mikeDavis: 'seed-user-mike-davis',
    emilyDavis: 'seed-user-emily-davis',
    jamesWilson: 'seed-user-james-wilson',
    alexMorgan: 'seed-user-alex-morgan',
    sarahJenkins: 'seed-user-sarah-jenkins',
    mikeRoss: 'seed-user-mike-ross',
    davidKim: 'seed-user-david-kim',
    janeDoe: 'seed-user-jane-doe',
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
} as const;

/**
 * Type for SEED_IDS allowing type-safe access throughout the codebase
 */
export type SeedIds = typeof SEED_IDS;
