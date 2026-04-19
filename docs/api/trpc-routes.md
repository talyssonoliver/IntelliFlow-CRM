# tRPC API Routes

> **Last Updated**: 2026-04-14 **API Version**: 2.1.0

## API Inventory Summary

| Metric               | Count |
| -------------------- | ----- |
| **Total Routers**    | 62    |
| **Total Procedures** | 386   |
| **Queries**          | 192   |
| **Mutations**        | 189   |
| **Subscriptions**    | 5     |

---

## Overview

IntelliFlow CRM uses **tRPC** (TypeScript Remote Procedure Call) to provide
end-to-end type-safe APIs. This document describes the available API routes,
their inputs, outputs, and usage examples.

### Key Benefits

- **End-to-end type safety**: Changes to the API automatically update the client
  types
- **No code generation**: Types are inferred directly from your router
- **Excellent DX**: Full autocomplete and type checking in your IDE
- **Lightweight**: Minimal runtime overhead

## Base URL

- **Development**: `http://localhost:4000/api/trpc`
- **Production**: `https://api.intelliflow.dev/api/trpc`

## Authentication

All protected routes require authentication via Supabase JWT token:

```typescript
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@intelliflow/api';

const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000/api/trpc',
      headers: () => ({
        authorization: `Bearer ${getSupabaseToken()}`,
      }),
    }),
  ],
});
```

---

## Router Architecture

```
apps/api/src/
├── router.ts                    # Main app router (combines all modules)
├── trpc.ts                      # tRPC context and procedures
└── modules/
    ├── account/                 # Account management
    ├── agent/                   # AI agent tools and conversations
    ├── analytics/               # Dashboard analytics
    ├── auth/                    # Authentication and MFA
    ├── autoresponse/            # Auto-response with approval gate
    ├── billing/                 # Stripe billing integration
    ├── chain-version/           # AI chain versioning
    ├── contact/                 # Contact management
    ├── documents/               # Document upload and email ingestion
    ├── email/                   # Inbound email webhooks
    ├── experiment/              # A/B testing
    ├── feedback/                # AI scoring feedback
    ├── integrations/            # External connectors
    ├── intelligence/            # AI predictions and insights
    ├── lead/                    # Lead management
    ├── legal/                   # Appointments, cases, documents
    ├── misc/                    # Health, system, timeline
    ├── opportunity/             # Deals and pipeline
    ├── security/                # Audit logs
    ├── task/                    # Task management
    ├── ticket/                  # Support tickets
    └── zep/                     # Zep memory budget
```

---

## Complete Router Inventory

### 1. Authentication & Authorization

#### `auth` Router (14 procedures)

| Procedure            | Type     | Description                                |
| -------------------- | -------- | ------------------------------------------ |
| `login`              | mutation | Authenticate user with email and password  |
| `loginWithOAuth`     | mutation | Initiate OAuth flow with external provider |
| `oauthCallback`      | mutation | Handle OAuth provider callback             |
| `verifyMfa`          | mutation | Verify MFA code during login               |
| `resendMfaCode`      | mutation | Resend MFA code to user                    |
| `logout`             | mutation | Terminate user session                     |
| `refreshSession`     | mutation | Refresh expired session token              |
| `setupMfa`           | mutation | Initiate MFA setup for authenticated user  |
| `confirmMfa`         | mutation | Confirm MFA setup with verification code   |
| `getBackupCodes`     | query    | Get backup codes for MFA recovery          |
| `getSessions`        | query    | List all active sessions for user          |
| `revokeSession`      | mutation | Revoke specific session                    |
| `getStatus`          | query    | Get current authentication status          |
| `verifyEmail`        | mutation | Verify email address with token            |
| `resendVerification` | mutation | Resend email verification link             |

---

### 2. Core CRM Entities

#### `lead` Router (16 procedures)

| Procedure                  | Type     | Description                                                           |
| -------------------------- | -------- | --------------------------------------------------------------------- |
| `create`                   | mutation | Create new lead record                                                |
| `getById`                  | query    | Get lead with 360 view (activities, notes, files, AI insights, tasks) |
| `list`                     | query    | List leads with pagination, filters, sorting                          |
| `update`                   | mutation | Update lead details                                                   |
| `delete`                   | mutation | Soft delete lead                                                      |
| `qualify`                  | mutation | Mark lead as qualified for sales                                      |
| `convert`                  | mutation | Convert qualified lead to opportunity                                 |
| `scoreWithAI`              | mutation | Score lead using AI chain                                             |
| `stats`                    | query    | Get lead pipeline statistics                                          |
| `getHotLeads`              | query    | Get high-priority leads ready for outreach                            |
| `getReadyForQualification` | query    | Get leads ready for sales qualification                               |
| `bulkScore`                | mutation | Score multiple leads in batch                                         |
| `filterOptions`            | query    | Get available filter options                                          |
| `bulkConvert`              | mutation | Convert multiple qualified leads to opportunities                     |
| `bulkUpdateStatus`         | mutation | Update status for multiple leads                                      |
| `bulkDelete`               | mutation | Delete multiple leads                                                 |

#### `contact` Router (14 procedures)

| Procedure           | Type     | Description                                                               |
| ------------------- | -------- | ------------------------------------------------------------------------- |
| `create`            | mutation | Create new contact record                                                 |
| `getById`           | query    | Retrieve contact with 360 view (accounts, activities, tasks, AI insights) |
| `getByEmail`        | query    | Find contact by email address                                             |
| `list`              | query    | List all contacts with pagination and filters                             |
| `update`            | mutation | Update contact details                                                    |
| `delete`            | mutation | Soft delete contact                                                       |
| `linkToAccount`     | mutation | Link contact to account                                                   |
| `unlinkFromAccount` | mutation | Remove contact from account                                               |
| `stats`             | query    | Get contact statistics                                                    |
| `search`            | query    | Full-text search contacts by name/email/phone                             |
| `filterOptions`     | query    | Get available filter options                                              |
| `bulkEmail`         | mutation | Send email to multiple contacts (batch operation)                         |
| `bulkExport`        | mutation | Export contacts to CSV/Excel                                              |
| `bulkDelete`        | mutation | Delete multiple contacts                                                  |

#### `account` Router (10 procedures)

| Procedure          | Type     | Description                                                                   |
| ------------------ | -------- | ----------------------------------------------------------------------------- |
| `create`           | mutation | Create new account with multi-tenant isolation                                |
| `getById`          | query    | Retrieve single account by ID                                                 |
| `list`             | query    | List all accounts for tenant with pagination                                  |
| `update`           | mutation | Update account details (name, type, industry, etc.)                           |
| `delete`           | mutation | Soft delete account                                                           |
| `stats`            | query    | Get account statistics (contacts, revenue, deals)                             |
| `filterOptions`    | query    | Get available filter options for account list                                 |
| `getContacts`      | query    | Get contacts associated with account (cursor pagination, status filter)       |
| `getOpportunities` | query    | Get opportunities for account with summary (value, weighted, stage breakdown) |
| `getActivity`      | query    | Get merged activity feed from contacts and opportunities                      |

#### `opportunity` Router (7 procedures)

| Procedure  | Type     | Description                                      |
| ---------- | -------- | ------------------------------------------------ |
| `create`   | mutation | Create new opportunity/deal                      |
| `getById`  | query    | Retrieve opportunity with pipeline stage details |
| `list`     | query    | List opportunities with stage and status filters |
| `update`   | mutation | Update opportunity (amount, stage, close date)   |
| `delete`   | mutation | Delete opportunity                               |
| `stats`    | query    | Get pipeline statistics (by stage, win rate)     |
| `forecast` | query    | Get revenue forecast and sales cycle analytics   |

#### `pipelineConfig` Router (5 procedures)

| Procedure            | Type     | Description                            |
| -------------------- | -------- | -------------------------------------- |
| `getStages`          | query    | Get pipeline stages configuration      |
| `updateStages`       | mutation | Update pipeline stages order and names |
| `createStage`        | mutation | Add new pipeline stage                 |
| `deleteStage`        | mutation | Remove pipeline stage                  |
| `getDefaultPipeline` | query    | Get default pipeline configuration     |

#### `task` Router (8 procedures)

| Procedure    | Type     | Description                                          |
| ------------ | -------- | ---------------------------------------------------- |
| `create`     | mutation | Create new task                                      |
| `getById`    | query    | Retrieve task by ID                                  |
| `list`       | query    | List tasks with filters (status, assignee, due date) |
| `update`     | mutation | Update task details                                  |
| `complete`   | mutation | Mark task as completed                               |
| `delete`     | mutation | Delete task                                          |
| `getMyTasks` | query    | Get tasks assigned to current user                   |
| `getOverdue` | query    | Get overdue tasks                                    |

#### `ticket` Router (10 procedures)

| Procedure    | Type     | Description                                            |
| ------------ | -------- | ------------------------------------------------------ |
| `create`     | mutation | Create new support ticket                              |
| `getById`    | query    | Retrieve ticket with conversation thread               |
| `list`       | query    | List tickets with filters (status, priority, assignee) |
| `update`     | mutation | Update ticket details                                  |
| `assign`     | mutation | Assign ticket to agent                                 |
| `escalate`   | mutation | Escalate ticket to supervisor                          |
| `resolve`    | mutation | Mark ticket as resolved                                |
| `reopen`     | mutation | Reopen closed ticket                                   |
| `addComment` | mutation | Add internal comment to ticket                         |
| `getMetrics` | query    | Get ticket SLA and resolution metrics                  |

#### `ticketRouting` Router (2 procedures)

| Procedure         | Type | Description                             |
| ----------------- | ---- | --------------------------------------- |
| `autoRoute`       | M    | Auto-route ticket via AI classification |
| `suggestAssignee` | Q    | Suggest ranked agent candidates         |

#### `ticketConfig` Router (12 procedures)

| Procedure            | Type | Description               |
| -------------------- | ---- | ------------------------- |
| `slaPolicies.list`   | Q    | List SLA policies         |
| `slaPolicies.create` | M    | Create SLA policy         |
| `slaPolicies.update` | M    | Update SLA policy         |
| `slaPolicies.delete` | M    | Delete SLA policy         |
| `categories.list`    | Q    | List ticket categories    |
| `categories.create`  | M    | Create ticket category    |
| `categories.update`  | M    | Update ticket category    |
| `categories.delete`  | M    | Delete ticket category    |
| `categories.reorder` | M    | Reorder ticket categories |

#### `leadSettings` Router (12 procedures)

| Procedure                | Type | Description                     |
| ------------------------ | ---- | ------------------------------- |
| `stages.getAll`          | Q    | Get all lead pipeline stages    |
| `stages.updateAll`       | M    | Replace all stages              |
| `stages.resetToDefaults` | M    | Reset stages to system defaults |
| `scoringRules.getAll`    | Q    | Get all lead scoring rules      |
| `scoringRules.updateAll` | M    | Replace all scoring rules       |
| `customFields.list`      | Q    | List custom lead fields         |
| `customFields.create`    | M    | Create a custom field           |
| `automation.get`         | Q    | Get lead automation config      |
| `automation.update`      | M    | Update lead automation settings |

#### `contactSettings` Router (5 procedures)

| Procedure | Type | Description     |
| --------- | ---- | --------------- |
| `getAll`  | Q    | Get settings    |
| `update`  | M    | Update settings |

#### `accountSettings` Router (5 procedures)

| Procedure | Type | Description     |
| --------- | ---- | --------------- |
| `getAll`  | Q    | Get settings    |
| `update`  | M    | Update settings |

#### `activityFeed` Router (9 procedures)

| Procedure        | Type | Description                         |
| ---------------- | ---- | ----------------------------------- |
| `getUnifiedFeed` | Q    | Cross-entity activity feed          |
| `getEntityFeed`  | Q    | Activity feed for a specific entity |
| `addComment`     | M    | Add comment to activity             |
| `toggleReaction` | M    | Toggle emoji reaction               |

#### `globalSearch` Router (1 procedure)

| Procedure | Type | Description                   |
| --------- | ---- | ----------------------------- |
| `query`   | Q    | Cross-entity full-text search |

#### `routing` Router (13 procedures)

| Procedure          | Type | Description                     |
| ------------------ | ---- | ------------------------------- |
| `list`             | Q    | List routing rules              |
| `create`           | M    | Create a lead routing rule      |
| `update`           | M    | Update a routing rule           |
| `autoRouteLead`    | M    | Auto-route lead via engine      |
| `getAgentWorkload` | Q    | Agent availability and capacity |

---

### 3. AI & Automation

#### `agent` Router (9 procedures)

| Procedure             | Type     | Description                                      |
| --------------------- | -------- | ------------------------------------------------ |
| `listTools`           | query    | List all available agent tools with descriptions |
| `getTool`             | query    | Get detailed info about specific tool            |
| `executeTool`         | mutation | Execute agent tool with validated inputs         |
| `getPendingApprovals` | query    | Get pending approvals for agent tool executions  |
| `getPendingAction`    | query    | Get single pending action awaiting approval      |
| `approveAction`       | mutation | Approve pending agent tool execution             |
| `rejectAction`        | mutation | Reject pending agent tool execution              |
| `getPendingCount`     | query    | Get count of pending approvals for current user  |

#### `conversation` Router (14 procedures)

| Procedure             | Type     | Description                                                 |
| --------------------- | -------- | ----------------------------------------------------------- |
| `create`              | mutation | Create new agent conversation session                       |
| `getById`             | query    | Retrieve conversation by ID with full context               |
| `getBySessionId`      | query    | Retrieve conversation by session ID                         |
| `search`              | query    | Search conversations with filters                           |
| `addMessage`          | mutation | Add message to conversation thread                          |
| `recordToolCall`      | mutation | Record agent tool call in conversation                      |
| `updateToolCall`      | mutation | Update tool call with execution results                     |
| `approveToolCall`     | mutation | Approve pending tool call                                   |
| `endConversation`     | mutation | Close conversation session                                  |
| `escalate`            | mutation | Escalate conversation to human                              |
| `getPendingApprovals` | query    | Get all pending approvals in conversation                   |
| `getAnalytics`        | query    | Get conversation analytics (duration, tool usage, outcomes) |
| `archiveOld`          | mutation | Archive conversations older than retention period           |

#### `intelligence` Router (6 procedures)

| Procedure               | Type     | Description                                                        |
| ----------------------- | -------- | ------------------------------------------------------------------ |
| `getLeadInsights`       | query    | Get AI insights for lead (churn risk, conversion probability, NBA) |
| `getContactInsights`    | query    | Get AI insights for contact                                        |
| `getInsightsSummary`    | query    | Get insights summary for 360 view                                  |
| `triggerPrediction`     | mutation | Queue async prediction job for entity                              |
| `updateLeadInsights`    | mutation | Update lead insights (called by ai-worker)                         |
| `updateContactInsights` | mutation | Update contact insights (called by ai-worker)                      |

#### `chainVersion` Router (14 procedures)

| Procedure     | Type     | Description                                |
| ------------- | -------- | ------------------------------------------ |
| `create`      | mutation | Create new AI chain version                |
| `update`      | mutation | Update chain version configuration         |
| `activate`    | mutation | Set chain version as active                |
| `deprecate`   | mutation | Mark chain version as deprecated           |
| `archive`     | mutation | Archive chain version                      |
| `rollback`    | mutation | Rollback to previous chain version         |
| `getById`     | query    | Retrieve chain version details             |
| `getActive`   | query    | Get currently active chain version         |
| `getConfig`   | query    | Get chain configuration for active version |
| `list`        | query    | List all chain versions with status        |
| `getHistory`  | query    | Get version history with timestamps        |
| `getAuditLog` | query    | Get audit log of all chain changes         |
| `getStats`    | query    | Get performance stats for chain version    |
| `compare`     | query    | Compare two chain versions side-by-side    |

#### `autoResponse` Router (11 procedures)

| Procedure               | Type     | Description                                         |
| ----------------------- | -------- | --------------------------------------------------- |
| `create`                | mutation | Create new autoresponse draft with content          |
| `getById`               | query    | Retrieve autoresponse by ID                         |
| `list`                  | query    | List all autoresponses for tenant                   |
| `submitForApproval`     | mutation | Submit draft autoresponse for human approval        |
| `approve`               | mutation | Approve autoresponse for deployment                 |
| `reject`                | mutation | Reject autoresponse with feedback                   |
| `escalate`              | mutation | Escalate autoresponse to management                 |
| `resolveEscalation`     | mutation | Resolve escalated autoresponse                      |
| `markSent`              | mutation | Mark autoresponse as sent (event trigger)           |
| `markFailed`            | mutation | Mark autoresponse send as failed                    |
| `getPendingForApprover` | query    | Get autoresponses pending approval for current user |
| `getStatsByStatus`      | query    | Get autoresponse metrics by status                  |

#### `experiment` Router (14 procedures)

| Procedure          | Type     | Description                                 |
| ------------------ | -------- | ------------------------------------------- |
| `create`           | mutation | Create new A/B experiment                   |
| `update`           | mutation | Update experiment configuration             |
| `start`            | mutation | Start experiment (begin variant assignment) |
| `pause`            | mutation | Pause running experiment                    |
| `complete`         | mutation | Complete experiment (finalize results)      |
| `archive`          | mutation | Archive completed experiment                |
| `assignVariant`    | mutation | Assign user/lead to experiment variant      |
| `getVariant`       | query    | Get variant assignment for entity           |
| `recordScore`      | mutation | Record metric score for variant             |
| `recordConversion` | mutation | Record conversion event                     |
| `analyze`          | query    | Run statistical analysis on results         |
| `getById`          | query    | Get experiment details                      |
| `list`             | query    | List all experiments with filters           |
| `getStatus`        | query    | Get real-time experiment status             |
| `getResults`       | query    | Get detailed results and metrics            |

#### `aiMonitoring` Router (11 procedures)

| Procedure              | Type | Description                     |
| ---------------------- | ---- | ------------------------------- |
| `getStatus`            | Q    | Overall AI system health status |
| `getDriftMetrics`      | Q    | Model drift indicators          |
| `getLatencyMetrics`    | Q    | P50/P95/P99 latency by model    |
| `getHallucinationRate` | Q    | Hallucination rate report       |
| `getROIMetrics`        | Q    | Cost vs. value metrics          |

#### `aiReview` Router (8 procedures)

| Procedure  | Type | Description                                |
| ---------- | ---- | ------------------------------------------ |
| `list`     | Q    | List AI-generated responses pending review |
| `get`      | Q    | Get single review item                     |
| `approve`  | M    | Approve AI response                        |
| `reject`   | M    | Reject AI response                         |
| `escalate` | M    | Escalate to senior reviewer                |

#### `feedback` Router (6 procedures)

| Procedure            | Type     | Description                             |
| -------------------- | -------- | --------------------------------------- |
| `submitSimple`       | mutation | Submit simple lead scoring feedback     |
| `submitCorrection`   | mutation | Submit correction to AI score           |
| `getForLead`         | query    | Get all feedback for specific lead      |
| `getAnalytics`       | query    | Get feedback analytics and patterns     |
| `checkRetraining`    | query    | Check if model retraining is needed     |
| `exportTrainingData` | query    | Export feedback data for model training |

#### `zepBudget` Router (4 procedures)

| Procedure          | Type     | Description                         |
| ------------------ | -------- | ----------------------------------- |
| `getUsage`         | query    | Get current Zep memory usage        |
| `getBudget`        | query    | Get memory budget limits            |
| `setLimit`         | mutation | Set memory budget limit             |
| `purgeOldMemories` | mutation | Purge memories older than threshold |

---

### 4. Legal Domain

#### `appointments` Router (18 procedures)

| Procedure           | Type     | Description                                                   |
| ------------------- | -------- | ------------------------------------------------------------- |
| `create`            | mutation | Create new appointment with conflict detection                |
| `getById`           | query    | Retrieve appointment by ID                                    |
| `list`              | query    | List appointments with filters (date range, status, attendee) |
| `update`            | mutation | Update appointment (time, attendees, details)                 |
| `reschedule`        | mutation | Reschedule appointment with conflict detection                |
| `confirm`           | mutation | Confirm appointment attendance                                |
| `complete`          | mutation | Mark appointment as completed                                 |
| `cancel`            | mutation | Cancel appointment                                            |
| `markNoShow`        | mutation | Mark attendee as no-show                                      |
| `delete`            | mutation | Delete appointment record                                     |
| `checkConflicts`    | query    | Check for scheduling conflicts in time window                 |
| `checkAvailability` | query    | Check availability for time slot                              |
| `findNextSlot`      | query    | Find next available appointment slot                          |
| `linkToCase`        | mutation | Link appointment to legal case                                |
| `unlinkFromCase`    | mutation | Remove case link from appointment                             |
| `addAttendee`       | mutation | Add person as appointment attendee                            |
| `removeAttendee`    | mutation | Remove attendee from appointment                              |
| `upcoming`          | query    | Get upcoming appointments for user                            |
| `stats`             | query    | Get appointment statistics                                    |

#### `documents` Router (Legal) (16 procedures)

| Procedure          | Type     | Description                                  |
| ------------------ | -------- | -------------------------------------------- |
| `create`           | mutation | Create new case document record              |
| `createVersion`    | mutation | Create new version of existing document      |
| `getById`          | query    | Retrieve document with version history       |
| `list`             | query    | List case documents with filters             |
| `grantAccess`      | mutation | Grant access to document for user/role       |
| `revokeAccess`     | mutation | Revoke document access                       |
| `submitForReview`  | mutation | Submit document for legal review             |
| `approve`          | mutation | Approve document after review                |
| `sign`             | mutation | E-sign document with signature capture       |
| `archive`          | mutation | Archive document                             |
| `placeLegalHold`   | mutation | Place legal hold on document                 |
| `releaseLegalHold` | mutation | Release legal hold                           |
| `delete`           | mutation | Delete document permanently                  |
| `getAuditTrail`    | query    | Get complete audit trail of document actions |
| `bulkDownload`     | mutation | Download multiple documents as ZIP           |
| `bulkArchive`      | mutation | Archive multiple documents                   |
| `bulkDelete`       | mutation | Delete multiple documents                    |

#### `cases` Router (Stub - pending Prisma schema)

| Procedure | Type | Description                     |
| --------- | ---- | ------------------------------- |
| _Pending_ | -    | Legal case management (IFC-147) |

---

### 5. Communication

#### `email` Router (Inbound) (6 procedures)

| Procedure       | Type     | Description                                                   |
| --------------- | -------- | ------------------------------------------------------------- |
| `webhook`       | mutation | Public webhook endpoint for email provider (SendGrid/Mailgun) |
| `getEmail`      | query    | Retrieve parsed email by ID                                   |
| `listEmails`    | query    | List emails for case or thread                                |
| `processEmail`  | mutation | Process email action (archive, spam, delete, forward)         |
| `getThread`     | query    | Retrieve email thread by thread ID                            |
| `getAttachment` | query    | Get email attachment metadata and download URL                |

#### `upload` Router (Documents) (2 procedures)

| Procedure         | Type     | Description                      |
| ----------------- | -------- | -------------------------------- |
| `upload`          | mutation | Upload file with base64 encoding |
| `getUploadStatus` | query    | Get status of upload operation   |

#### `webhooks` Router (9 procedures)

| Procedure              | Type | Description                        |
| ---------------------- | ---- | ---------------------------------- |
| `handleWebhook`        | M    | Receive inbound webhook            |
| `registerSource`       | M    | Register a webhook source          |
| `getSources`           | Q    | List registered webhook sources    |
| `processRetries`       | M    | Process pending webhook retries    |
| `getDeadLetterEntries` | Q    | List undeliverable webhook entries |

---

### 6. Billing & Subscriptions

#### `billing` Router (11 procedures)

| Procedure                    | Type     | Description                                     |
| ---------------------------- | -------- | ----------------------------------------------- |
| `getSubscription`            | query    | Get current subscription details                |
| `listInvoices`               | query    | List billing invoices with pagination           |
| `getPaymentMethods`          | query    | List saved payment methods                      |
| `updatePaymentMethod`        | mutation | Update payment method details                   |
| `removePaymentMethod`        | mutation | Remove saved payment method                     |
| `updateSubscription`         | mutation | Change subscription plan or billing cycle       |
| `cancelSubscription`         | mutation | Cancel subscription (with retention window)     |
| `getUpcomingInvoice`         | query    | Get next scheduled invoice preview              |
| `ensureCustomer`             | mutation | Create Stripe customer if not exists            |
| `getUsageMetrics`            | query    | Get API usage and feature usage metrics         |
| `createCheckoutSubscription` | mutation | Create Stripe checkout session for subscription |

---

### 7. Analytics & Reporting

#### `analytics` Router (5 procedures)

| Procedure        | Type  | Description                            |
| ---------------- | ----- | -------------------------------------- |
| `dealsWonTrend`  | query | Get trend data for won deals over time |
| `growthTrends`   | query | Get revenue and growth metrics trends  |
| `trafficSources` | query | Get lead source distribution analytics |
| `recentActivity` | query | Get recent activity across CRM         |
| `leadStats`      | query | Get lead pipeline statistics           |

---

### 8. Security & Compliance

#### `audit` Router (6 procedures)

| Procedure      | Type     | Description                                    |
| -------------- | -------- | ---------------------------------------------- |
| `log`          | mutation | Log audit event                                |
| `getEvents`    | query    | Get audit events with filters                  |
| `getByEntity`  | query    | Get audit trail for specific entity            |
| `exportEvents` | mutation | Export audit events to CSV                     |
| `getStats`     | query    | Get audit statistics                           |
| `purgeOld`     | mutation | Purge audit events older than retention period |

---

### 9. External Integrations

#### `integrations` Router (6 procedures)

| Procedure                | Type     | Description                                                 |
| ------------------------ | -------- | ----------------------------------------------------------- |
| `getConnectorHealth`     | query    | Get health status of specific connector                     |
| `getAllConnectorsHealth` | query    | Get health status of all connectors                         |
| `getConnectorsByType`    | query    | Get connectors filtered by type (ERP, Payment, Email, etc.) |
| `triggerSync`            | mutation | Trigger manual sync for connector                           |
| `getDashboardConfig`     | query    | Get dashboard configuration for integrations                |
| `testConnection`         | mutation | Test connection to external service                         |

---

### 10. System & Infrastructure

#### `health` Router (5 procedures)

Canonical infra probes use the standalone HTTP surface: `GET /health`,
`GET /health/ready`, `GET /health/live`, `GET /health/detailed`, and
`GET /health/db`. The `health.*` tRPC procedures remain available for typed
internal callers and diagnostics. Legacy `/api/health*` aliases are kept for
compatibility.

| Procedure | Type  | Description                                  |
| --------- | ----- | -------------------------------------------- |
| `ping`    | query | Simple health check response                 |
| `check`   | query | Detailed health check with dependencies      |
| `ready`   | query | Check if service is ready for traffic        |
| `alive`   | query | Check if service is running                  |
| `dbStats` | query | Get database connectivity and Prisma metrics |

#### `system` Router (6 procedures)

| Procedure      | Type  | Description                                  |
| -------------- | ----- | -------------------------------------------- |
| `version`      | query | Get API version string                       |
| `info`         | query | Get system information (environment, uptime) |
| `features`     | query | Get list of enabled features                 |
| `config`       | query | Get system configuration (admin only)        |
| `metrics`      | query | Get system performance metrics (admin only)  |
| `capabilities` | query | Get API capabilities and feature flags       |

#### `timeline` Router (8 procedures)

| Procedure                | Type  | Description                                      |
| ------------------------ | ----- | ------------------------------------------------ |
| `getEvents`              | query | Get unified timeline events across CRM           |
| `getStats`               | query | Get timeline statistics                          |
| `getUpcomingDeadlines`   | query | Get upcoming deadlines across all entities       |
| `computeDeadline`        | query | Compute deadline based on rule and business days |
| `isBusinessDay`          | query | Check if date is a UK business day               |
| `getNextBusinessDay`     | query | Get next business day from reference date        |
| `validateDeadlineRule`   | query | Validate deadline rule syntax                    |
| `getPendingAgentActions` | query | Get pending actions awaiting agent execution     |

#### `subscriptions` Router (Real-time) (3 procedures)

| Procedure        | Type         | Description                      |
| ---------------- | ------------ | -------------------------------- |
| `onLeadUpdate`   | subscription | Real-time lead update events     |
| `onTaskAssigned` | subscription | Real-time task assignment events |
| `onNotification` | subscription | Real-time notification events    |

---

### 11. Real-Time & User Experience

#### `home` Router (12 procedures)

| Procedure           | Type | Description                            |
| ------------------- | ---- | -------------------------------------- |
| `getWelcomeSummary` | Q    | Personalized welcome dashboard summary |
| `getAIInsights`     | Q    | AI-generated actionable insights       |
| `getTimeline`       | Q    | Merged activity timeline for home      |
| `pinItem`           | M    | Pin an entity to dashboard             |
| `dismissInsight`    | M    | Dismiss a home insight                 |

#### `notifications` Router (10 procedures)

| Procedure        | Type | Description                                  |
| ---------------- | ---- | -------------------------------------------- |
| `list`           | Q    | Paginated notification list                  |
| `getUnreadCount` | Q    | Count of unread notifications                |
| `markAsRead`     | M    | Mark notification as read                    |
| `markAllAsRead`  | M    | Mark all notifications as read               |
| `onNew`          | S    | WebSocket subscription for new notifications |

---

### 12. Support & Feedback

#### `feedbackSurvey` Router (4 procedures)

| Procedure           | Type | Description               |
| ------------------- | ---- | ------------------------- |
| `getDashboardStats` | Q    | NPS/CSAT survey dashboard |
| `getNPSTrend`       | Q    | NPS score trend over time |
| `listResponses`     | Q    | List raw survey responses |
| `exportResponses`   | M    | Export responses to CSV   |

#### `helpArticle` Router (11 procedures)

| Procedure   | Type | Description               |
| ----------- | ---- | ------------------------- |
| `list`      | Q    | List help articles        |
| `getBySlug` | Q    | Fetch article by URL slug |
| `create`    | M    | Create a help article     |
| `update`    | M    | Update help article       |
| `publish`   | M    | Publish draft article     |
| `archive`   | M    | Archive article           |

---

### 13. Privacy & Compliance

#### `privacy` Router (2 procedures)

| Procedure       | Type | Description                  |
| --------------- | ---- | ---------------------------- |
| `submitDSAR`    | M    | Submit a GDPR rights request |
| `getDSARStatus` | Q    | Check DSAR status            |

---

### 14. User & Team Management

#### `user` Router (3 procedures)

| Procedure       | Type | Description               |
| --------------- | ---- | ------------------------- |
| `getProfile`    | Q    | Get current user profile  |
| `updateProfile` | M    | Update name, avatar, etc. |

#### `team` Router (5 procedures)

| Procedure | Type | Description          |
| --------- | ---- | -------------------- |
| `list`    | Q    | List teams           |
| `getById` | Q    | Get team by ID       |
| `update`  | M    | Update team settings |

#### `moduleAccess` Router (3 procedures)

| Procedure           | Type | Description                     |
| ------------------- | ---- | ------------------------------- |
| `getEnabledModules` | Q    | Get enabled modules for tenant  |
| `toggleModule`      | M    | Enable/disable a module (admin) |

---

### 15. Automation & Workflows

#### `workflow` Router (8 procedures)

| Procedure      | Type | Description                  |
| -------------- | ---- | ---------------------------- |
| `create`       | M    | Create a workflow automation |
| `list`         | Q    | List workflows               |
| `getExecution` | Q    | Get a workflow execution     |

#### `customNodeType` Router (2 procedures)

| Procedure | Type | Description                     |
| --------- | ---- | ------------------------------- |
| `list`    | Q    | List custom workflow node types |

#### `customActionHandler` Router (2 procedures)

| Procedure | Type | Description                 |
| --------- | ---- | --------------------------- |
| `list`    | Q    | List custom action handlers |

#### `queuesAdmin` Router (6 procedures)

| Procedure | Type | Description        |
| --------- | ---- | ------------------ |
| `list`    | Q    | List BullMQ queues |
| `pause`   | M    | Pause a queue      |
| `resume`  | M    | Resume a queue     |

---

### 16. Calendar & Productivity

#### `calendar` Router (4 procedures)

| Procedure | Type | Description             |
| --------- | ---- | ----------------------- |
| `list`    | Q    | List calendar events    |
| `create`  | M    | Create a calendar event |

#### `calendarWebhooks` Router (3 procedures)

| Procedure       | Type | Description          |
| --------------- | ---- | -------------------- |
| `getSyncStatus` | Q    | Calendar sync status |
| `triggerSync`   | M    | Trigger manual sync  |

---

## Router Summary by Category

| Category          | Routers | Procedures | Description                                             |
| ----------------- | ------- | ---------- | ------------------------------------------------------- |
| **Auth**          | 1       | 14         | Authentication, MFA, sessions                           |
| **CRM Core**      | 15      | 135        | Lead, Contact, Account, Opportunity, Task, Ticket, etc. |
| **AI/Automation** | 10      | 93         | Agent, Monitoring, Review, Chains, Experiments          |
| **Legal**         | 3       | 36         | Appointments, Documents, Cases                          |
| **Communication** | 3       | 17         | Email, Upload, Webhooks                                 |
| **Billing**       | 1       | 11         | Stripe integration                                      |
| **Analytics**     | 1       | 5          | Dashboard metrics                                       |
| **Security**      | 1       | 6          | Audit logs                                              |
| **Integrations**  | 1       | 6          | External connectors                                     |
| **System**        | 4       | 22         | Health, system, timeline, subscriptions                 |
| **Experience**    | 2       | 22         | Home, Notifications                                     |
| **Support**       | 2       | 15         | Feedback, Help Articles                                 |
| **Org/Mgmt**      | 3       | 11         | User, Team, Module Access                               |
| **Workflows**     | 4       | 18         | Workflow Engine, Custom Nodes, Queues                   |
| **Calendar**      | 2       | 7          | Calendar Sync and Webhooks                              |
| **Total**         | **62**  | **~386**   |                                                         |

---

## Error Handling

tRPC uses typed errors for better error handling:

```typescript
try {
  const lead = await client.lead.getById.query({ id: 'invalid_id' });
} catch (error) {
  if (error instanceof TRPCClientError) {
    switch (error.data?.code) {
      case 'NOT_FOUND':
        console.error('Lead not found');
        break;
      case 'UNAUTHORIZED':
        console.error('Not authenticated');
        break;
      case 'FORBIDDEN':
        console.error('Insufficient permissions');
        break;
      default:
        console.error('Unknown error:', error.message);
    }
  }
}
```

**Common Error Codes:**

| Code                    | Description                   |
| ----------------------- | ----------------------------- |
| `UNAUTHORIZED`          | Not authenticated             |
| `FORBIDDEN`             | Insufficient permissions      |
| `NOT_FOUND`             | Resource not found            |
| `BAD_REQUEST`           | Invalid input                 |
| `CONFLICT`              | Resource conflict (duplicate) |
| `INTERNAL_SERVER_ERROR` | Server error                  |
| `TIMEOUT`               | Request timeout               |

---

## Rate Limiting

API requests are rate-limited to prevent abuse:

| Tier                    | Limit                |
| ----------------------- | -------------------- |
| **Authenticated users** | 1000 requests/hour   |
| **AI endpoints**        | 100 requests/hour    |
| **Unauthenticated**     | 100 requests/hour    |
| **Webhooks**            | 10,000 requests/hour |

Rate limit headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
```

---

## WebSocket Subscriptions

tRPC supports WebSocket subscriptions for real-time updates:

```typescript
const subscription = client.subscriptions.onLeadUpdate.subscribe(
  { leadId: 'lead_123' },
  {
    onData: (lead) => {
      console.log('Lead updated:', lead);
    },
    onError: (err) => {
      console.error('Subscription error:', err);
    },
  }
);

// Unsubscribe when done
subscription.unsubscribe();
```

---

## Batch Requests

tRPC automatically batches requests made in the same tick:

```typescript
// These will be sent as a single HTTP request
const [lead1, lead2, analytics] = await Promise.all([
  client.lead.getById.query({ id: 'lead_1' }),
  client.lead.getById.query({ id: 'lead_2' }),
  client.analytics.leadStats.query({
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
  }),
]);
```

---

## TypeScript Types

All types are automatically inferred from the router definition:

```typescript
import type { AppRouter } from '@intelliflow/api';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

type RouterInput = inferRouterInputs<AppRouter>;
type RouterOutput = inferRouterOutputs<AppRouter>;

// Use specific input/output types
type LeadListInput = RouterInput['lead']['list'];
type LeadListOutput = RouterOutput['lead']['list'];
```

---

## Next.js Integration

In Next.js App Router, use tRPC React Query hooks:

```typescript
'use client';

import { api } from '@/lib/trpc/client';

export function LeadList() {
  const { data, isLoading, error } = api.lead.list.useQuery({
    page: 1,
    limit: 20,
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.leads.map((lead) => (
        <div key={lead.id}>{lead.email}</div>
      ))}
    </div>
  );
}
```

---

## Testing

Test tRPC routes using the test client:

```typescript
import { createCallerFactory } from '@trpc/server';
import { appRouter } from '../src/router';

const createCaller = createCallerFactory(appRouter);

describe('Leads Router', () => {
  it('should list leads', async () => {
    const caller = createCaller({
      user: mockUser,
      db: mockDb,
    });

    const result = await caller.lead.list({ page: 1, limit: 20 });

    expect(result.leads).toHaveLength(20);
    expect(result.total).toBeGreaterThan(0);
  });
});
```

---

## Further Reading

- [tRPC Documentation](https://trpc.io/docs)
- [API Development Guide](../guides/api-development.md)
- [Authentication Guide](../guides/authentication.md)
- [Error Handling Best Practices](../guides/error-handling.md)

---

## Changelog

| Date       | Version | Changes                                                                            |
| ---------- | ------- | ---------------------------------------------------------------------------------- |
| 2026-02-05 | 2.1.0   | IFC-185: Added account.getContacts, getOpportunities, getActivity (235 procedures) |
| 2026-02-02 | 2.0.0   | Complete API inventory update (25 routers, 232 procedures)                         |
| 2025-12-15 | 1.0.0   | Initial API documentation                                                          |
