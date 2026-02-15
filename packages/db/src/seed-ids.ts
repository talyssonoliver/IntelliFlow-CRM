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
 *
 * UUID Format: 00000000-0000-4000-8000-XXXXXXXXXXXX
 * - Version 4 UUID format (4 in third segment)
 * - Variant 1 (8 in fourth segment)
 * - Entity ranges in last segment:
 *   - 0x11-0x1f: Users
 *   - 0x21-0x2f: Leads
 *   - 0x31-0x3f: Contacts
 *   - 0x41-0x4f: Accounts
 *   - 0x51-0x5f: Opportunities
 *   - 0x61-0x6f: Tickets
 *   - 0x71-0x7f: SLA Policies
 *   - 0x81-0x8f: Tasks
 *   - 0x91-0x9f: Deal Products
 *   - 0xa1-0xaf: Deal Files
 *   - 0xb1-0xbf: Deal Activities
 *   - 0xc1-0xcf: Ticket Activities
 *   - 0xd1-0xdf: Ticket Attachments
 *   - 0xe1-0xef: Agent Actions
 *   - 0xf1-0xff: Contact Activities
 *   - 0x101+: Additional entities (extended ranges)
 */

/**
 * Generate consistent UUID for seed data
 * @param entityPrefix - 2-char hex prefix for entity type (e.g., '21' for leads)
 * @param index - Index within entity type (0-255)
 */
function seedUUID(entityPrefix: string, index: number): string {
  const hexIndex = index.toString(16).padStart(2, '0');
  // UUID format: 8-4-4-4-12 (last segment must be 12 hex chars)
  return `00000000-0000-4000-8000-00000000${entityPrefix}${hexIndex}`;
}

export const SEED_IDS = {
  // Tenant must come first - used by all other entities
  tenant: {
    default: seedUUID('00', 1),                   // 00000000-0000-4000-8000-000000000001
  },
  users: {
    admin: seedUUID('01', 1),                    // 00000000-0000-4000-8000-000000000101
    manager: seedUUID('01', 2),                  // 00000000-0000-4000-8000-000000000102
    sarahJohnson: seedUUID('01', 3),             // 00000000-0000-4000-8000-000000000103
    mikeDavis: seedUUID('01', 4),                // 00000000-0000-4000-8000-000000000104
    emilyDavis: seedUUID('01', 5),               // 00000000-0000-4000-8000-000000000105
    jamesWilson: seedUUID('01', 6),              // 00000000-0000-4000-8000-000000000106
    alexMorgan: seedUUID('01', 7),               // 00000000-0000-4000-8000-000000000107
    sarahJenkins: seedUUID('01', 8),             // 00000000-0000-4000-8000-000000000108
    mikeRoss: seedUUID('01', 9),                 // 00000000-0000-4000-8000-000000000109
    davidKim: seedUUID('01', 10),                // 00000000-0000-4000-8000-00000000010a
    janeDoe: seedUUID('01', 11),                 // 00000000-0000-4000-8000-00000000010b
  },
  leads: {
    sarahMiller: seedUUID('02', 1),              // 00000000-0000-4000-8000-000000000201
    davidChen: seedUUID('02', 2),                // 00000000-0000-4000-8000-000000000202
    amandaSmith: seedUUID('02', 3),              // 00000000-0000-4000-8000-000000000203
    jamesWilson: seedUUID('02', 4),              // 00000000-0000-4000-8000-000000000204
    elenaRodriguez: seedUUID('02', 5),           // 00000000-0000-4000-8000-000000000205
    marcusReed: seedUUID('02', 6),               // 00000000-0000-4000-8000-000000000206
  },
  contacts: {
    sarahMiller: seedUUID('03', 1),              // 00000000-0000-4000-8000-000000000301
    davidChen: seedUUID('03', 2),                // 00000000-0000-4000-8000-000000000302
    amandaSmith: seedUUID('03', 3),              // 00000000-0000-4000-8000-000000000303
    jamesWilson: seedUUID('03', 4),              // 00000000-0000-4000-8000-000000000304
    elenaRodriguez: seedUUID('03', 5),           // 00000000-0000-4000-8000-000000000305
    johnSmith: seedUUID('03', 6),                // 00000000-0000-4000-8000-000000000306
    emilyChen: seedUUID('03', 7),                // 00000000-0000-4000-8000-000000000307
    michaelBrown: seedUUID('03', 8),             // 00000000-0000-4000-8000-000000000308
    lisaWang: seedUUID('03', 9),                 // 00000000-0000-4000-8000-000000000309
    robertFox: seedUUID('03', 10),               // 00000000-0000-4000-8000-00000000030a
  },
  accounts: {
    techCorp: seedUUID('04', 1),                 // 00000000-0000-4000-8000-000000000401
    designCo: seedUUID('04', 2),                 // 00000000-0000-4000-8000-000000000402
    smithConsulting: seedUUID('04', 3),          // 00000000-0000-4000-8000-000000000403
    globalSoft: seedUUID('04', 4),               // 00000000-0000-4000-8000-000000000404
    finTech: seedUUID('04', 5),                  // 00000000-0000-4000-8000-000000000405
    acmeCorp: seedUUID('04', 6),                 // 00000000-0000-4000-8000-000000000406
    techStart: seedUUID('04', 7),                // 00000000-0000-4000-8000-000000000407
    globalTech: seedUUID('04', 8),               // 00000000-0000-4000-8000-000000000408
    dataCorp: seedUUID('04', 9),                 // 00000000-0000-4000-8000-000000000409
    innovateCo: seedUUID('04', 10),              // 00000000-0000-4000-8000-00000000040a
    megaCorp: seedUUID('04', 11),                // 00000000-0000-4000-8000-00000000040b
    startupXYZ: seedUUID('04', 12),              // 00000000-0000-4000-8000-00000000040c
    devTools: seedUUID('04', 13),                // 00000000-0000-4000-8000-00000000040d
  },
  opportunities: {
    enterpriseLicenseAcme: seedUUID('05', 1),    // 00000000-0000-4000-8000-000000000501
    annualSubscriptionTechStart: seedUUID('05', 2),
    customIntegrationGlobalTech: seedUUID('05', 3),
    platformMigrationDataCorp: seedUUID('05', 4),
    consultingInnovateCo: seedUUID('05', 5),
    enterpriseSuiteMegaCorp: seedUUID('05', 6),
    teamLicenseStartupXYZ: seedUUID('05', 7),
    apiAccessDevTools: seedUUID('05', 8),
    acmeCorpSoftwareLicense: seedUUID('05', 9),
    // Additional opportunities for dashboard demo
    closedMay1: seedUUID('05', 10),
    closedMay2: seedUUID('05', 11),
    closedJun1: seedUUID('05', 12),
    closedJun2: seedUUID('05', 13),
    closedJul1: seedUUID('05', 14),
    closedAug1: seedUUID('05', 15),
    closedAug2: seedUUID('05', 16),
    closedSep1: seedUUID('05', 17),
    closedOct1: seedUUID('05', 18),
    closedOct2: seedUUID('05', 19),
    qualificationDeal1: seedUUID('05', 20),
    qualificationDeal2: seedUUID('05', 21),
    proposalDeal1: seedUUID('05', 22),
    proposalDeal2: seedUUID('05', 23),
    proposalDeal3: seedUUID('05', 24),
  },
  tickets: {
    systemOutage: seedUUID('06', 1),             // 00000000-0000-4000-8000-000000000601
    loginFailure: seedUUID('06', 2),
    darkModeRequest: seedUUID('06', 3),
    billingInquiry: seedUUID('06', 4),
    api500Error: seedUUID('06', 5),
    dashboardPerformance: seedUUID('06', 6),
  },
  slaPolicy: {
    default: seedUUID('07', 1),                  // 00000000-0000-4000-8000-000000000701
    premium: seedUUID('07', 2),
  },
  tasks: {
    callSarah: seedUUID('08', 1),                // 00000000-0000-4000-8000-000000000801
    followUpTechCorp: seedUUID('08', 2),
    prepareQ3Report: seedUUID('08', 3),
    callAcmeCorp: seedUUID('08', 4),
    reviewQ3Report: seedUUID('08', 5),
    sendContract: seedUUID('08', 6),
    scheduleTechReview: seedUUID('08', 7),
  },
  // Supplementary Data IDs
  dealProducts: {
    enterpriseLicense: seedUUID('09', 1),        // 00000000-0000-4000-8000-000000000901
    implementation: seedUUID('09', 2),
  },
  dealFiles: {
    acmeMsa: seedUUID('0a', 1),                  // 00000000-0000-4000-8000-000000000a01
    requirementsDoc: seedUUID('0a', 2),
  },
  dealActivities: {
    agentAdvance: seedUUID('0b', 1),             // 00000000-0000-4000-8000-000000000b01
    emailProposal: seedUUID('0b', 2),
    agentMeeting: seedUUID('0b', 3),
    callRobert: seedUUID('0b', 4),
    stageChange: seedUUID('0b', 5),
  },
  ticketActivities: {
    customerMessage: seedUUID('0c', 1),          // 00000000-0000-4000-8000-000000000c01
    systemPriority: seedUUID('0c', 2),
    agentReply: seedUUID('0c', 3),
    priorityChange: seedUUID('0c', 4),
    internalNote: seedUUID('0c', 5),
    slaBreach: seedUUID('0c', 6),
  },
  ticketAttachments: {
    errorLogs: seedUUID('0d', 1),                // 00000000-0000-4000-8000-000000000d01
    screenshot: seedUUID('0d', 2),
    devopsAnalysis: seedUUID('0d', 3),
  },
  // New supplementary data IDs
  agentActions: {
    leadUpdate: seedUUID('0e', 1),               // 00000000-0000-4000-8000-000000000e01
    emailDraft: seedUUID('0e', 2),
    dealStageChange: seedUUID('0e', 3),
    taskCreate: seedUUID('0e', 4),
  },
  contactActivities: {
    emailOpened: seedUUID('0f', 1),              // 00000000-0000-4000-8000-000000000f01
    meetingCompleted: seedUUID('0f', 2),
    dealStageUpdated: seedUUID('0f', 3),
    callLogged: seedUUID('0f', 4),
    whatsappMessage: seedUUID('0f', 5),
    documentSigned: seedUUID('0f', 6),
    ticketResolved: seedUUID('0f', 7),
    noteAdded: seedUUID('0f', 8),
    emailSent: seedUUID('0f', 9),
    meetingScheduled: seedUUID('0f', 10),
  },
  dashboardActivities: {
    aliceActivity: seedUUID('10', 1),            // 00000000-0000-4000-8000-000000001001
    bobActivity: seedUUID('10', 2),
  },
  // Additional users and contacts for the new data
  additionalUsers: {
    aliceSmith: seedUUID('11', 1),               // 00000000-0000-4000-8000-000000001101
    bobJones: seedUUID('11', 2),
  },
  additionalContacts: {
    sarahJenkins: seedUUID('12', 1),             // 00000000-0000-4000-8000-000000001201
  },
  additionalAccounts: {
    techFlowInc: seedUUID('13', 1),              // 00000000-0000-4000-8000-000000001301
  },
  // New comprehensive UI data IDs
  contactNotes: {
    securityFeatures: seedUUID('14', 1),         // 00000000-0000-4000-8000-000000001401
    budgetApproved: seedUUID('14', 2),
  },
  contactAIInsights: {
    sarahJenkins: seedUUID('15', 1),             // 00000000-0000-4000-8000-000000001501
  },
  calendarEvents: {
    q3Review: seedUUID('16', 1),                 // 00000000-0000-4000-8000-000000001601
    productDemoTechCorp: seedUUID('16', 2),
    followUpCallSarah: seedUUID('16', 3),
    proposalDeadline: seedUUID('16', 4),
  },
  teamMessages: {
    sarahClosedDeal: seedUUID('17', 1),          // 00000000-0000-4000-8000-000000001701
    mikeGreatWork: seedUUID('17', 2),
    emilyMeetingNotes: seedUUID('17', 3),
  },
  pipelineSnapshots: {
    qualification: seedUUID('18', 1),            // 00000000-0000-4000-8000-000000001801
    proposal: seedUUID('18', 2),
    negotiation: seedUUID('18', 3),
    closedWon: seedUUID('18', 4),
  },
  trafficSources: {
    direct: seedUUID('19', 1),                   // 00000000-0000-4000-8000-000000001901
    organic: seedUUID('19', 2),
    referral: seedUUID('19', 3),
    social: seedUUID('19', 4),
  },
  growthMetrics: {
    jan: seedUUID('1a', 1),                      // 00000000-0000-4000-8000-000000001a01
    feb: seedUUID('1a', 2),
    mar: seedUUID('1a', 3),
    apr: seedUUID('1a', 4),
    may: seedUUID('1a', 5),
    jun: seedUUID('1a', 6),
    jul: seedUUID('1a', 7),
    aug: seedUUID('1a', 8),
    sep: seedUUID('1a', 9),
    oct: seedUUID('1a', 10),
    nov: seedUUID('1a', 11),
    dec: seedUUID('1a', 12),
  },
  dealsWonMetrics: {
    jul: seedUUID('1b', 1),                      // 00000000-0000-4000-8000-000000001b01
    aug: seedUUID('1b', 2),
    sep: seedUUID('1b', 3),
    oct: seedUUID('1b', 4),
    nov: seedUUID('1b', 5),
    dec: seedUUID('1b', 6),
  },
  ticketNextSteps: {
    verifyDbFix: seedUUID('1c', 1),              // 00000000-0000-4000-8000-000000001c01
    confirmResolution: seedUUID('1c', 2),
    documentRootCause: seedUUID('1c', 3),
  },
  relatedTickets: {
    slowDashboard: seedUUID('1d', 1),            // 00000000-0000-4000-8000-000000001d01
    databaseTimeout: seedUUID('1d', 2),
    apiLatency: seedUUID('1d', 3),
  },
  ticketAIInsights: {
    systemOutage: seedUUID('1e', 1),             // 00000000-0000-4000-8000-000000001e01
  },
  salesPerformance: {
    sarahJohnson: seedUUID('1f', 1),             // 00000000-0000-4000-8000-000000001f01
    mikeChen: seedUUID('1f', 2),
    emilyDavis: seedUUID('1f', 3),
    jamesWilson: seedUUID('1f', 4),
  },
  dashboardTasks: {
    callAcme: seedUUID('20', 1),                 // 00000000-0000-4000-8000-000000002001
    reviewQ3: seedUUID('20', 2),
    emailFollowup: seedUUID('20', 3),
  },
  contactDeals: {
    enterpriseLicense: seedUUID('21', 1),        // 00000000-0000-4000-8000-000000002101
    professionalServices: seedUUID('21', 2),
    supportRenewal: seedUUID('21', 3),
  },
  contactTasks: {
    followUpContract: seedUUID('22', 1),         // 00000000-0000-4000-8000-000000002201
    scheduleTechDemo: seedUUID('22', 2),
    sendProposal: seedUUID('22', 3),
  },
  // =========================================================================
  // NEW FLOW COVERAGE IDs (FLOW-001 to FLOW-038)
  // =========================================================================
  workspaces: {
    intelliflow: seedUUID('30', 1),              // 00000000-0000-4000-8000-000000003001
    demo: seedUUID('30', 2),
  },
  teams: {
    sales: seedUUID('31', 1),                    // 00000000-0000-4000-8000-000000003101
    support: seedUUID('31', 2),
    engineering: seedUUID('31', 3),
  },
  teamMembers: {
    sarahSales: seedUUID('32', 1),               // 00000000-0000-4000-8000-000000003201
    mikeSales: seedUUID('32', 2),
    emilySupport: seedUUID('32', 3),
  },
  emailTemplates: {
    welcome: seedUUID('33', 1),                  // 00000000-0000-4000-8000-000000003301
    followUp: seedUUID('33', 2),
    proposal: seedUUID('33', 3),
  },
  emailRecords: {
    welcomeSarah: seedUUID('34', 1),             // 00000000-0000-4000-8000-000000003401
    proposalAcme: seedUUID('34', 2),
    followUpDavid: seedUUID('34', 3),
  },
  chatConversations: {
    supportChat1: seedUUID('35', 1),             // 00000000-0000-4000-8000-000000003501
    whatsappInquiry: seedUUID('35', 2),
    slackIntegration: seedUUID('35', 3),
  },
  chatMessages: {
    msg1: seedUUID('36', 1),                     // 00000000-0000-4000-8000-000000003601
    msg2: seedUUID('36', 2),
    msg3: seedUUID('36', 3),
  },
  callRecords: {
    discoverySarah: seedUUID('37', 1),           // 00000000-0000-4000-8000-000000003701
    demoTechCorp: seedUUID('37', 2),
    supportFollowup: seedUUID('37', 3),
  },
  documents: {
    proposalAcme: seedUUID('38', 1),             // 00000000-0000-4000-8000-000000003801
    contract2024: seedUUID('38', 2),
    requirementsSpec: seedUUID('38', 3),
  },
  cases: {
    estatePlanningSmith: seedUUID('58', 1),      // 00000000-0000-4000-8000-000000005801
    corporateMergerTechFlow: seedUUID('58', 2),   // 00000000-0000-4000-8000-000000005802
    civilLitigationJohnson: seedUUID('58', 3),    // 00000000-0000-4000-8000-000000005803
    realEstateClosingPine: seedUUID('58', 4),     // 00000000-0000-4000-8000-000000005804
    intellectualPropertyDispute: seedUUID('58', 5),
    contractReviewGlobal: seedUUID('58', 6),
    employmentDispute: seedUUID('58', 7),
    regulatoryCompliance: seedUUID('58', 8),
  },
  caseTasks: {
    reviewDocuments: seedUUID('59', 1),           // 00000000-0000-4000-8000-000000005901
    fileMotion: seedUUID('59', 2),
    clientMeeting: seedUUID('59', 3),
    draftAgreement: seedUUID('59', 4),
    courtHearing: seedUUID('59', 5),
    collectEvidence: seedUUID('59', 6),
    draftClosingDocs: seedUUID('59', 7),
    titleSearch: seedUUID('59', 8),
    depositTransfer: seedUUID('59', 9),
    filingDeadline: seedUUID('59', 10),
    mergerReview: seedUUID('59', 11),
    dueDiligence: seedUUID('59', 12),
  },
  caseDocuments: {
    employmentAgreement: seedUUID('39', 1),      // 00000000-0000-4000-8000-000000003901
    ndaTechCorp: seedUUID('39', 2),
    motionToDismiss: seedUUID('39', 3),
    evidenceEmailLog: seedUUID('39', 4),
    serviceAgreement: seedUUID('39', 5),
  },
  feedbackSurveys: {
    npsSarah: seedUUID('3a', 1),                 // 00000000-0000-4000-8000-000000003a01
    csatDavid: seedUUID('3a', 2),
    cesMike: seedUUID('3a', 3),
  },
  dealRenewals: {
    acmeRenewal: seedUUID('3b', 1),              // 00000000-0000-4000-8000-000000003b01
    techCorpRenewal: seedUUID('3b', 2),
  },
  accountHealthScores: {
    acmeHealth: seedUUID('3c', 1),               // 00000000-0000-4000-8000-000000003c01
    techCorpHealth: seedUUID('3c', 2),
    globalSoftHealth: seedUUID('3c', 3),
  },
  agentSkills: {
    sarahTechnical: seedUUID('3d', 1),           // 00000000-0000-4000-8000-000000003d01
    sarahNegotiation: seedUUID('3d', 2),
    mikeSupport: seedUUID('3d', 3),
  },
  agentAvailability: {
    sarahAvailable: seedUUID('3e', 1),           // 00000000-0000-4000-8000-000000003e01
    mikeAvailable: seedUUID('3e', 2),
    emilyAvailable: seedUUID('3e', 3),
  },
  routingRules: {
    enterpriseDeals: seedUUID('3f', 1),          // 00000000-0000-4000-8000-000000003f01
    technicalSupport: seedUUID('3f', 2),
    urgentEscalation: seedUUID('3f', 3),
  },
  ticketCategories: {
    billing: seedUUID('40', 1),                  // 00000000-0000-4000-8000-000000004001
    technical: seedUUID('40', 2),
    featureRequest: seedUUID('40', 3),
    general: seedUUID('40', 4),
  },
  slaBreaches: {
    responseBreachOutage: seedUUID('41', 1),     // 00000000-0000-4000-8000-000000004101
    resolutionBreachLogin: seedUUID('41', 2),
  },
  escalationHistory: {
    outageEscalation: seedUUID('42', 1),         // 00000000-0000-4000-8000-000000004201
    billingEscalation: seedUUID('42', 2),
  },
  workflowDefinitions: {
    leadQualification: seedUUID('43', 1),        // 00000000-0000-4000-8000-000000004301
    dealApproval: seedUUID('43', 2),
    ticketRouting: seedUUID('43', 3),
  },
  workflowExecutions: {
    leadQual1: seedUUID('44', 1),                // 00000000-0000-4000-8000-000000004401
    dealApproval1: seedUUID('44', 2),
  },
  businessRules: {
    discountApproval: seedUUID('45', 1),         // 00000000-0000-4000-8000-000000004501
    autoAssignment: seedUUID('45', 2),
    escalationTrigger: seedUUID('45', 3),
  },
  dashboardConfigs: {
    salesDashboard: seedUUID('46', 1),           // 00000000-0000-4000-8000-000000004601
    supportDashboard: seedUUID('46', 2),
    executiveDashboard: seedUUID('46', 3),
  },
  kpiDefinitions: {
    revenueTarget: seedUUID('47', 1),            // 00000000-0000-4000-8000-000000004701
    ticketResolution: seedUUID('47', 2),
    customerSatisfaction: seedUUID('47', 3),
  },
  reportDefinitions: {
    salesPipeline: seedUUID('48', 1),            // 00000000-0000-4000-8000-000000004801
    supportMetrics: seedUUID('48', 2),
    revenueAnalysis: seedUUID('48', 3),
  },
  aiInsights: {
    dealRiskAcme: seedUUID('49', 1),             // 00000000-0000-4000-8000-000000004901
    churnRiskTechCorp: seedUUID('49', 2),
    upsellOpportunity: seedUUID('49', 3),
  },
  healthChecks: {
    apiGateway: seedUUID('4a', 1),               // 00000000-0000-4000-8000-000000004a01
    database: seedUUID('4a', 2),
    aiWorker: seedUUID('4a', 3),
  },
  alertIncidents: {
    highLatency: seedUUID('4b', 1),              // 00000000-0000-4000-8000-000000004b01
    errorSpike: seedUUID('4b', 2),
  },
  performanceMetrics: {
    apiLatency: seedUUID('4c', 1),               // 00000000-0000-4000-8000-000000004c01
    dbQueryTime: seedUUID('4c', 2),
    aiResponseTime: seedUUID('4c', 3),
  },
  webhookEndpoints: {
    slackNotifications: seedUUID('4d', 1),       // 00000000-0000-4000-8000-000000004d01
    zapierIntegration: seedUUID('4d', 2),
    customCRM: seedUUID('4d', 3),
  },
  apiKeys: {
    mobileApp: seedUUID('4e', 1),                // 00000000-0000-4000-8000-000000004e01
    integration: seedUUID('4e', 2),
    internal: seedUUID('4e', 3),
  },
  apiVersions: {
    v1: seedUUID('4f', 1),                       // 00000000-0000-4000-8000-000000004f01
    v2: seedUUID('4f', 2),
  },
  aiScores: {
    sarahMiller: seedUUID('50', 1),              // 00000000-0000-4000-8000-000000005001
    davidChen: seedUUID('50', 2),
    amandaSmith: seedUUID('50', 3),
    jamesWilson: seedUUID('50', 4),
    elenaRodriguez: seedUUID('50', 5),
  },
  auditLogs: {
    create: seedUUID('51', 1),                   // 00000000-0000-4000-8000-000000005101
    update: seedUUID('51', 2),
    opportunityCreate: seedUUID('51', 3),
  },
  domainEvents: {
    leadScored: seedUUID('52', 1),               // 00000000-0000-4000-8000-000000005201
    opportunityStageChanged: seedUUID('52', 2),
    ticketSLABreached: seedUUID('52', 3),
  },
  // =========================================================================
  // Lead 360 Data IDs
  // =========================================================================
  leadActivities: {
    webFormSubmission: seedUUID('53', 1),        // 00000000-0000-4000-8000-000000005301
    scoreUpdate: seedUUID('53', 2),
    emailAutoResponse: seedUUID('53', 3),
    statusChange: seedUUID('53', 4),
    callLogged: seedUUID('53', 5),
    noteAdded: seedUUID('53', 6),
    emailFollowup: seedUUID('53', 7),
    meetingScheduled: seedUUID('53', 8),
  },
  leadNotes: {
    competitorNote: seedUUID('54', 1),           // 00000000-0000-4000-8000-000000005401
    budgetNote: seedUUID('54', 2),
  },
  leadFiles: {
    requirements: seedUUID('55', 1),             // 00000000-0000-4000-8000-000000005501
    productOverview: seedUUID('55', 2),
  },
  leadAIInsights: {
    marcusReed: seedUUID('56', 1),               // 00000000-0000-4000-8000-000000005601
    sarahMiller: seedUUID('56', 2),
  },
  // Appointments (calendar page demo data)
  appointments: {
    productDemoTechCorp: seedUUID('5a', 1),    // 00000000-0000-4000-8000-000000005a01
    followUpCallSarah: seedUUID('5a', 2),
    q3ReviewMeeting: seedUUID('5a', 3),
    proposalDeadline: seedUUID('5a', 4),
    clientConsultation: seedUUID('5a', 5),
    courtHearing: seedUUID('5a', 6),
    depositionPrep: seedUUID('5a', 7),
    weeklyStandup: seedUUID('5a', 8),
    partnerCall: seedUUID('5a', 9),
    strategySession: seedUUID('5a', 10),
  },
  appointmentAttendees: {
    att1: seedUUID('5b', 1),                   // 00000000-0000-4000-8000-000000005b01
    att2: seedUUID('5b', 2),
    att3: seedUUID('5b', 3),
    att4: seedUUID('5b', 4),
    att5: seedUUID('5b', 5),
    att6: seedUUID('5b', 6),
    att7: seedUUID('5b', 7),
    att8: seedUUID('5b', 8),
    att9: seedUUID('5b', 9),
    att10: seedUUID('5b', 10),
    att11: seedUUID('5b', 11),
    att12: seedUUID('5b', 12),
    att13: seedUUID('5b', 13),
    att14: seedUUID('5b', 14),
  },
  appointmentCases: {
    hearingCase: seedUUID('5c', 1),            // 00000000-0000-4000-8000-000000005c01
    depositionCase: seedUUID('5c', 2),
  },
  // Auto-Response Drafts for IFC-029 (Agent Approvals page)
  autoResponseDrafts: {
    pendingEmail: seedUUID('57', 1),             // 00000000-0000-4000-8000-000000005701
    pendingFollowUp: seedUUID('57', 2),          // 00000000-0000-4000-8000-000000005702
    approved: seedUUID('57', 3),                 // 00000000-0000-4000-8000-000000005703
    rejected: seedUUID('57', 4),                 // 00000000-0000-4000-8000-000000005704
    escalated: seedUUID('57', 5),                // 00000000-0000-4000-8000-000000005705
    sent: seedUUID('57', 6),                     // 00000000-0000-4000-8000-000000005706
  },
} as const;

/**
 * Type for SEED_IDS allowing type-safe access throughout the codebase
 */
export type SeedIds = typeof SEED_IDS;

/**
 * Legacy string IDs - DEPRECATED
 * These are kept for backward compatibility during migration.
 * DO NOT use these for new code. Use SEED_IDS instead.
 * These will be removed after database cleanup.
 */
export const LEGACY_STRING_IDS = {
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
  // Add other legacy string IDs as needed for cleanup
} as const;
