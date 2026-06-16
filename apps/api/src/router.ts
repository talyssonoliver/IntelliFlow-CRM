/**
 * App Router
 *
 * This is the main tRPC router that combines all module routers.
 * It provides the complete API surface for IntelliFlow CRM.
 */

import { createTRPCRouter } from './trpc';
import { leadRouter } from './modules/lead/lead.router';
import { leadSettingsRouter } from './modules/lead/lead-settings.router';
import { contactRouter } from './modules/contact/contact.router';
import { contactSettingsRouter } from './modules/contact/contact-settings.router';
import { accountRouter } from './modules/account/account.router';
import { accountSettingsRouter } from './modules/account/account-settings.router';
import { opportunityRouter } from './modules/opportunity/opportunity.router';
import { pipelineConfigRouter } from './modules/opportunity/pipeline-config.router';
import { dealSettingsRouter } from './modules/opportunity/deal-settings.router';
import { taskRouter } from './modules/task/task.router';
import { ticketRouter } from './modules/ticket/ticket.router';
import { ticketRoutingRouter } from './modules/ticket/ticket-routing.router';
import { ticketConfigRouter } from './modules/ticket/ticket-config.router';
import { ticketSettingsRouter } from './modules/ticket/ticket-settings.router';
import { analyticsRouter } from './modules/analytics/analytics.router';
import { healthRouter } from './modules/misc/health.router';
import { systemRouter } from './modules/misc/system.router';
import { timelineRouter } from './modules/misc/timeline.router';
import subscriptionRouter from './shared/subscription-demo';
import { appointmentsRouter } from './modules/legal/appointments.router';
import { casesRouter } from './modules/legal/cases.router';
import { documentsRouter } from './modules/legal/documents.router';
import { documentSettingsRouter } from './modules/legal/document-settings.router';
import { caseSettingsRouter } from './modules/legal/case-settings.router';
import { appointmentSettingsRouter } from './modules/legal/appointment-settings.router';
import { reportSettingsRouter } from './modules/analytics/report-settings.router';
import { uploadRouter } from './modules/documents/upload.router';
import { agentRouter } from './modules/agent/agent.router';
import { conversationRouter } from './modules/agent/conversation.router';
import { auditRouter } from './modules/security/audit.router';
import { authRouter } from './modules/auth/auth.router';
import { billingRouter } from './modules/billing/billing.router';
import { integrationsRouter } from './modules/integrations/integrations.router';
import { chainVersionRouter } from './modules/chain-version';
import { zepBudgetRouter } from './modules/zep/zep-budget.router';
import { intelligenceRouter } from './modules/intelligence/intelligence.router';
import { inboundEmailRouter } from './modules/email/inbound.router';
import { autoResponseRouter } from './modules/autoresponse';
import { aiMonitoringRouter } from './modules/ai-monitoring/ai-monitoring.router';
import { aiReviewRouter } from './modules/ai-review/ai-review.router';
import { homeRouter } from './modules/home/home.router';
import { notificationsRouter } from './modules/notifications/notifications.router';
import { workflowRouter } from './modules/workflow/workflow.router';
import { webhooksRouter } from './modules/webhooks/webhooks.router';
import { queuesAdminRouter } from './modules/admin/queues.router';
import { activityFeedRouter } from './modules/misc/activity-feed.router';
import { globalSearchRouter } from './modules/misc/global-search.router';
import { moduleAccessRouter } from './modules/subscription/subscription.router';
import { experimentRouter } from './modules/experiment';
import { routingRouter } from './modules/routing';
import { feedbackSurveyRouter } from './modules/feedback/feedbackSurvey.router';
import { publicFeedbackRouter } from './modules/public-feedback/public-feedback.router';
import { userRouter } from './modules/user/user.router';
import { teamRouter } from './modules/team/team.router';
import { calendarRouter } from './modules/calendar/calendar.router';
import { calendarWebhooksRouter } from './modules/calendar/calendar-webhook.router';
import { dsarRouter } from './modules/privacy/dsar.router';
import { helpArticleRouter } from './modules/help-article/help-article.router';
import { customNodeTypeRouter } from './modules/custom-node-type/custom-node-type.router';
import { customActionHandlerRouter } from './modules/custom-action-handler/custom-action-handler.router';
import { inboundRouter } from './modules/inbound/inbound.router';
import { onboardingRouter } from './modules/onboarding/onboarding.router';

/**
 * Main application router
 *
 * All module routers are namespaced under their respective keys:
 *
 * Core CRM Modules:
 * - lead.*         - Lead management endpoints
 * - contact.*      - Contact management endpoints
 * - account.*      - Account management endpoints
 * - opportunity.*  - Opportunity/deal management endpoints
 * - task.*         - Task management endpoints
 *
 * System & Monitoring:
 * - health.*       - Health check and diagnostics endpoints
 * - system.*       - System information and configuration
 *
 * Real-Time Features:
 * - subscriptions.* - WebSocket subscriptions for real-time updates
 *
 * AI & Automation:
 * - agent.*        - AI agent tools and approval workflow (IFC-139)
 * - conversation.* - Conversation records, messages, tool call tracking (IFC-148)
 *
 * Security & Compliance:
 * - audit.*        - Audit logs and security events (IFC-098)
 *
 * Analytics & Reporting:
 * - analytics.*    - Dashboard analytics and metrics
 * - ticket.*       - Support ticket management
 *
 * External Integrations:
 * - integrations.* - ERP, Payment, Email, Messaging connectors (IFC-099)
 *
 * Email Infrastructure (IFC-144):
 * - email.*        - Inbound email webhooks and processing
 *
 * Webhook Infrastructure:
 * - webhooks.*     - Webhook management and processing (IFC-144)
 *
 * Home & Notifications:
 * - home.*          - Authenticated home page data (IFC-182)
 * - notifications.* - Notification inbox and preferences (IFC-183)
 *
 * Workflow Automation (IFC-028):
 * - workflow.*     - Workflow engine management
 */
export const appRouter = createTRPCRouter({
  // Authentication & Authorization
  auth: authRouter,

  // Onboarding (incident 2026-06-16 onboarding redesign)
  onboarding: onboardingRouter,

  // Billing & Subscriptions
  billing: billingRouter,

  // Core CRM entities
  lead: leadRouter,
  contact: contactRouter,
  account: accountRouter,
  opportunity: opportunityRouter,
  pipelineConfig: pipelineConfigRouter,
  task: taskRouter,
  ticket: ticketRouter,
  ticketRouting: ticketRoutingRouter, // IFC-067: Automatic Ticket Routing
  ticketConfig: ticketConfigRouter, // PG-173: Ticket Configuration Pages
  leadSettings: leadSettingsRouter, // PG-178: Lead Settings Configuration
  contactSettings: contactSettingsRouter, // PG-182: Contact Settings Configuration
  accountSettings: accountSettingsRouter, // PG-183: Account Settings Configuration
  dealSettings: dealSettingsRouter, // PG-184: Deal Settings Configuration
  ticketSettings: ticketSettingsRouter, // PG-185: Ticket Settings Configuration
  caseSettings: caseSettingsRouter, // PG-190: Case Settings Configuration
  appointmentSettings: appointmentSettingsRouter, // PG-189: Appointment/Calendar Settings (wired alongside PG-190)
  reportSettings: reportSettingsRouter, // PG-187: Report Settings (wired alongside PG-190)

  // Analytics & Reporting
  analytics: analyticsRouter,

  // Legal domain
  cases: casesRouter,
  appointments: appointmentsRouter,
  documents: documentsRouter,
  documentSettings: documentSettingsRouter, // PG-186: Document Settings Configuration
  upload: uploadRouter, // IFC-094: File upload endpoint (AC-005)

  // AI & Automation
  agent: agentRouter,
  conversation: conversationRouter, // IFC-148: Conversation records, messages, tool calls
  chainVersion: chainVersionRouter,
  zepBudget: zepBudgetRouter,
  intelligence: intelligenceRouter,
  autoResponse: autoResponseRouter, // IFC-029: Auto-Response with Approval Gate
  aiMonitoring: aiMonitoringRouter, // IFC-197: AI Monitoring
  aiReview: aiReviewRouter, // IFC-180: AI Output Review
  experiment: experimentRouter, // IFC-025: A/B Testing Framework

  // Security & Compliance
  audit: auditRouter,

  // System utilities
  health: healthRouter,
  system: systemRouter,
  timeline: timelineRouter,

  // Real-time subscriptions
  subscriptions: subscriptionRouter,

  // External Integrations (IFC-099)
  integrations: integrationsRouter,

  // Email Infrastructure (IFC-144)
  email: inboundEmailRouter,

  // Webhook Infrastructure (IFC-144)
  webhooks: webhooksRouter,

  // Home Page (IFC-182)
  home: homeRouter,

  // Notifications (IFC-183)
  notifications: notificationsRouter,

  // Workflow Automation (IFC-028)
  workflow: workflowRouter,

  // Queue Administration
  queuesAdmin: queuesAdminRouter,

  // Activity Feed (IFC-069)
  activityFeed: activityFeedRouter,

  // Global Search (IFC-203: cross-entity search from header)
  globalSearch: globalSearchRouter,

  // Module Access (IFC-209)
  moduleAccess: moduleAccessRouter,

  // Lead Routing (PG-132)
  routing: routingRouter,

  // Feedback Survey Analytics (IFC-068)
  feedbackSurvey: feedbackSurveyRouter,

  // Anonymous Public Feedback Widget (PG-126)
  publicFeedback: publicFeedbackRouter,

  // User Profile & Timezone (IFC-191)
  user: userRouter,

  // Teams (IFC-031 FU-005)
  team: teamRouter,

  // Custom Calendars
  calendar: calendarRouter,

  // Calendar Webhook Management (IFC-224)
  calendarWebhooks: calendarWebhooksRouter,

  // Privacy & GDPR (Fix #17 — IFC-140)
  privacy: dsarRouter,

  // Support Help Center (IFC-299)
  helpArticle: helpArticleRouter,

  // Workflow Custom Extensions (IFC-031 FU-011 / FU-012)
  customNodeType: customNodeTypeRouter,
  customActionHandler: customActionHandlerRouter,

  // Cross-repo intake from leangency-portal /discover form.
  // Bearer-authenticated, env-bound tenant. See module README.
  inbound: inboundRouter,
});

/**
 * Export type definition of the API
 * This type will be used by the frontend to get full type safety
 */
export type AppRouter = typeof appRouter;
