-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'TRIAL');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN', 'MANAGER', 'SALES_REP');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'UNQUALIFIED', 'CONVERTED', 'LOST');

-- CreateEnum
CREATE TYPE "ContactStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'PROSPECT', 'CUSTOMER', 'FORMER_CUSTOMER', 'DO_NOT_CONTACT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('PROSPECTING', 'QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'IMAGE', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'NOTE', 'TASK', 'STAGE_CHANGE', 'AGENT_ACTION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AgentActionStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ROLLED_BACK', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ContactActivityType" AS ENUM ('EMAIL', 'CALL', 'MEETING', 'CHAT', 'DOCUMENT', 'DEAL', 'TICKET', 'NOTE');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('WEB_FORM', 'EMAIL', 'CALL', 'MEETING', 'NOTE', 'SCORE_UPDATE', 'STATUS_CHANGE', 'QUALIFICATION');

-- CreateEnum
CREATE TYPE "Sentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('MEETING', 'CALL', 'HEARING', 'CONSULTATION', 'DEPOSITION', 'OTHER');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SecuritySeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "EventOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED', 'ERROR');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'PENDING', 'WAITING_ON_CUSTOMER', 'WAITING_ON_THIRD_PARTY', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SLAStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BREACHED', 'PAUSED', 'MET');

-- CreateEnum
CREATE TYPE "SLANotificationType" AS ENUM ('WARNING', 'BREACH', 'ESCALATION', 'ASSIGNMENT', 'RESOLUTION');

-- CreateEnum
CREATE TYPE "SLANotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TicketActivityType" AS ENUM ('CUSTOMER_MESSAGE', 'AGENT_REPLY', 'INTERNAL_NOTE', 'SYSTEM_EVENT', 'SLA_ALERT', 'ASSIGNMENT', 'STATUS_CHANGE');

-- CreateEnum
CREATE TYPE "TicketChannel" AS ENUM ('EMAIL', 'PORTAL', 'PHONE', 'CHAT', 'API', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM', 'AI_AGENT', 'API_KEY', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_RESET', 'MFA_ENABLED', 'MFA_DISABLED', 'PERMISSION_DENIED', 'QUALIFY', 'CONVERT', 'ASSIGN', 'TRANSFER', 'SCORE', 'AI_SCORE', 'AI_PREDICT', 'AI_GENERATE', 'BULK_UPDATE', 'BULK_DELETE', 'IMPORT', 'EXPORT', 'ARCHIVE', 'RESTORE', 'CONFIGURE');

-- CreateEnum
CREATE TYPE "ActionResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "DataClassification" AS ENUM ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PRIVILEGED');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('LOGIN_ATTEMPT', 'LOGIN_SUCCESS', 'LOGIN_FAILURE', 'LOGOUT', 'PASSWORD_CHANGE', 'MFA_CHALLENGE', 'MFA_SUCCESS', 'MFA_FAILURE', 'PERMISSION_DENIED', 'RATE_LIMIT_EXCEEDED', 'SUSPICIOUS_ACTIVITY', 'BRUTE_FORCE_DETECTED', 'SESSION_HIJACK_ATTEMPT', 'API_KEY_CREATED', 'API_KEY_REVOKED', 'DATA_EXPORT', 'ADMIN_ACTION');

-- CreateEnum
CREATE TYPE "ChurnRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('MEETING', 'CALL', 'DEADLINE', 'TASK', 'REMINDER');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChatChannel" AS ENUM ('INTERNAL', 'WHATSAPP', 'TEAMS', 'SLACK', 'FACEBOOK', 'INSTAGRAM', 'WEBCHAT');

-- CreateEnum
CREATE TYPE "ChatStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('RINGING', 'IN_PROGRESS', 'COMPLETED', 'MISSED', 'FAILED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('THUMBS_UP', 'THUMBS_DOWN', 'SCORE_CORRECTION');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'SENT', 'RESPONDED', 'FOLLOWED_UP', 'CLOSED');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('UPCOMING', 'IN_PROGRESS', 'RENEWED', 'CHURNED', 'EXPANDED', 'DOWNGRADED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ONLINE', 'BUSY', 'AWAY', 'OFFLINE', 'ON_BREAK');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('NEW', 'VIEWED', 'ACTED_ON', 'DISMISSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('FIRING', 'ACKNOWLEDGED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "WebhookDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ', 'BOUNCED');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('HIGH', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('SYSTEM', 'TRANSACTIONAL', 'REMINDERS', 'ALERTS', 'UPDATES', 'MARKETING', 'SOCIAL');

-- CreateEnum
CREATE TYPE "DLQStatus" AS ENUM ('PENDING', 'RETRYING', 'RESOLVED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BANTTimeline" AS ENUM ('IMMEDIATE', 'SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('WEB_CHAT', 'MOBILE_APP', 'API', 'SLACK', 'TEAMS', 'EMAIL', 'VOICE');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "ExperimentStatus" AS ENUM ('DRAFT', 'RUNNING', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExperimentType" AS ENUM ('AI_VS_MANUAL', 'MODEL_COMPARISON', 'THRESHOLD_TEST');

-- CreateEnum
CREATE TYPE "FeedbackCategory" AS ENUM ('SCORE_TOO_HIGH', 'SCORE_TOO_LOW', 'WRONG_FACTORS', 'MISSING_CONTEXT', 'DATA_QUALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL');

-- CreateEnum
CREATE TYPE "SurveyType" AS ENUM ('NPS', 'CSAT', 'CES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "ToolType" AS ENUM ('SEARCH', 'READ', 'CREATE', 'UPDATE', 'DELETE', 'EXECUTE', 'INTEGRATION');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "stripeCustomerId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "source" "LeadSource" NOT NULL DEFAULT 'WEBSITE',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bantBudget" TEXT,
    "bantAuthority" TEXT,
    "bantNeed" TEXT,
    "bantTimeline" "BANTTimeline",
    "qualificationNotes" TEXT,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "embedding" vector,
    "location" TEXT,
    "website" TEXT,
    "avatarUrl" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "estimatedValue" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "title" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT,
    "leadId" TEXT,
    "embedding" vector,
    "status" "ContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "streetAddress" TEXT,
    "city" TEXT,
    "zipCode" TEXT,
    "company" TEXT,
    "linkedInUrl" TEXT,
    "contactType" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactNotes" TEXT,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "employees" INTEGER,
    "revenue" DECIMAL(15,2),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opportunities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'PROSPECTING',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedCloseDate" TIMESTAMP(3),
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "totalPrice" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,

    CONSTRAINT "deal_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "fileType" "FileType" NOT NULL DEFAULT 'OTHER',
    "url" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "deal_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateLabel" TEXT,
    "attachmentName" TEXT,
    "attachmentType" TEXT,
    "stageFrom" TEXT,
    "stageTo" TEXT,
    "agentActionId" TEXT,
    "agentName" TEXT,
    "confidenceScore" INTEGER,
    "agentStatus" "AgentActionStatus",
    "tenantId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "userId" TEXT,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_actions" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "aiReasoning" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "status" "AgentActionStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "entityId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityName" TEXT NOT NULL,
    "previousState" JSONB NOT NULL,
    "proposedState" JSONB NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "feedback" TEXT,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,
    "rollbackReason" TEXT,

    CONSTRAINT "agent_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_activities" (
    "id" TEXT NOT NULL,
    "type" "ContactActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "sentiment" "Sentiment",
    "metadata" JSONB,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,

    CONSTRAINT "contact_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "leadId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_scores" (
    "id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "scoredById" TEXT NOT NULL,

    CONSTRAINT "ai_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT,
    "summary" TEXT,
    "userId" TEXT NOT NULL,
    "userName" TEXT,
    "agentId" TEXT,
    "agentName" TEXT,
    "agentModel" TEXT,
    "contextType" TEXT,
    "contextId" TEXT,
    "contextName" TEXT,
    "channel" "ConversationChannel" NOT NULL DEFAULT 'WEB_CHAT',
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "endReason" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "toolCallCount" INTEGER NOT NULL DEFAULT 0,
    "tokenCountInput" INTEGER NOT NULL DEFAULT 0,
    "tokenCountOutput" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DECIMAL(10,6),
    "userRating" INTEGER,
    "feedbackText" TEXT,
    "wasEscalated" BOOLEAN NOT NULL DEFAULT false,
    "escalatedTo" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessageAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "traceId" TEXT,
    "retentionExpiresAt" TIMESTAMP(3),
    "embedding" vector,

    CONSTRAINT "conversation_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_records" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'text',
    "modelUsed" TEXT,
    "finishReason" TEXT,
    "tokenCount" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "confidence" DOUBLE PRECISION,
    "isEdited" BOOLEAN NOT NULL DEFAULT false,
    "editedContent" TEXT,
    "editedAt" TIMESTAMP(3),
    "editedBy" TEXT,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "embedding" vector,

    CONSTRAINT "message_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_call_records" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "toolName" TEXT NOT NULL,
    "toolType" "ToolType" NOT NULL,
    "toolVersion" TEXT,
    "inputParameters" JSONB NOT NULL,
    "outputResult" JSONB,
    "status" "ToolCallStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "errorCode" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" "ApprovalStatus",
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "affectedEntity" TEXT,
    "affectedEntityType" TEXT,
    "affectedEntityId" TEXT,
    "changeDescription" TEXT,
    "isReversible" BOOLEAN NOT NULL DEFAULT false,
    "rollbackData" JSONB,
    "wasRolledBack" BOOLEAN NOT NULL DEFAULT false,
    "rolledBackAt" TIMESTAMP(3),
    "rolledBackBy" TEXT,

    CONSTRAINT "tool_call_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" "EventStatus" NOT NULL DEFAULT 'PENDING',
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "appointmentType" "AppointmentType" NOT NULL DEFAULT 'MEETING',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "location" TEXT,
    "notes" TEXT,
    "bufferMinutesBefore" INTEGER NOT NULL DEFAULT 0,
    "bufferMinutesAfter" INTEGER NOT NULL DEFAULT 0,
    "recurrence" JSONB,
    "parentAppointmentId" TEXT,
    "externalCalendarId" TEXT,
    "reminderMinutes" INTEGER,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "organizerId" TEXT NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_attendees" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "appointment_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_cases" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "appointment_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" "SecuritySeverity" NOT NULL DEFAULT 'INFO',
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorIp" TEXT,
    "description" TEXT,
    "details" JSONB,
    "detected" BOOLEAN NOT NULL DEFAULT false,
    "detectedBy" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "tenantId" TEXT NOT NULL,
    "slaPolicyId" TEXT NOT NULL,
    "slaResponseDue" TIMESTAMP(3),
    "slaResolutionDue" TIMESTAMP(3),
    "slaStatus" "SLAStatus" NOT NULL DEFAULT 'ON_TRACK',
    "slaBreachedAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "contactId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "criticalResponseMinutes" INTEGER NOT NULL DEFAULT 15,
    "highResponseMinutes" INTEGER NOT NULL DEFAULT 60,
    "mediumResponseMinutes" INTEGER NOT NULL DEFAULT 240,
    "lowResponseMinutes" INTEGER NOT NULL DEFAULT 480,
    "criticalResolutionMinutes" INTEGER NOT NULL DEFAULT 120,
    "highResolutionMinutes" INTEGER NOT NULL DEFAULT 480,
    "mediumResolutionMinutes" INTEGER NOT NULL DEFAULT 1440,
    "lowResolutionMinutes" INTEGER NOT NULL DEFAULT 4320,
    "warningThresholdPercent" INTEGER NOT NULL DEFAULT 25,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_notifications" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" "SLANotificationType" NOT NULL,
    "severity" "SLANotificationSeverity" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "sla_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_activities" (
    "id" TEXT NOT NULL,
    "type" "TicketActivityType" NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT,
    "authorAvatar" TEXT,
    "channel" "TicketChannel" NOT NULL DEFAULT 'PORTAL',
    "isAIGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiConfidence" DOUBLE PRECISION,
    "systemEventType" TEXT,
    "systemEventData" JSONB,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,

    CONSTRAINT "ticket_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_attachments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "fileType" "FileType" NOT NULL DEFAULT 'OTHER',
    "url" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "uploadedById" TEXT,

    CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventVersion" TEXT NOT NULL DEFAULT 'v1',
    "eventId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" "ActorType" NOT NULL DEFAULT 'USER',
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "resourceName" TEXT,
    "action" "AuditAction" NOT NULL,
    "actionResult" "ActionResult" NOT NULL DEFAULT 'SUCCESS',
    "actionReason" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "changedFields" TEXT[],
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "traceId" TEXT,
    "sessionId" TEXT,
    "dataClassification" "DataClassification" NOT NULL DEFAULT 'INTERNAL',
    "retentionExpiresAt" TIMESTAMP(3),
    "requiredPermission" TEXT,
    "permissionGranted" BOOLEAN NOT NULL DEFAULT true,
    "permissionDeniedReason" TEXT,
    "metadata" JSONB,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "conditions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rbac_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rbac_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "grantedBy" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_notes" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "embedding" vector,
    "search_vector" tsvector,

    CONSTRAINT "contact_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_ai_insights" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversionProbability" INTEGER NOT NULL,
    "lifetimeValue" INTEGER NOT NULL,
    "churnRisk" "ChurnRisk" NOT NULL DEFAULT 'LOW',
    "nextBestAction" TEXT,
    "sentiment" TEXT,
    "engagementScore" INTEGER NOT NULL,
    "recommendations" JSONB,
    "sentimentTrend" TEXT,
    "lastEngagementDays" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "contact_ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "location" TEXT,
    "eventType" "CalendarEventType" NOT NULL DEFAULT 'MEETING',
    "attendees" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT,
    "ownerId" TEXT,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userAvatar" TEXT,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'general',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipeline_snapshots" (
    "id" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "dealCount" INTEGER NOT NULL,
    "percentage" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'bg-ds-primary',
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pipeline_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentage" INTEGER NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'bg-ds-primary',
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "growth_metrics" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "metricType" TEXT NOT NULL DEFAULT 'revenue',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "growth_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals_won_metrics" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deals_won_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_next_steps" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_next_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "related_tickets" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "relatedId" TEXT NOT NULL,
    "relatedSubject" TEXT NOT NULL,
    "relatedStatus" "TicketStatus" NOT NULL,
    "similarity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "related_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_ai_insights" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "suggestedSolutions" JSONB NOT NULL,
    "sentiment" TEXT NOT NULL,
    "predictedResolutionTime" TEXT NOT NULL,
    "similarResolvedTickets" INTEGER NOT NULL,
    "escalationRisk" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_performance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userAvatar" TEXT,
    "dealCount" INTEGER NOT NULL,
    "revenue" INTEGER NOT NULL,
    "rank" INTEGER NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessAt" TIMESTAMP(3),

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "workspaceId" TEXT NOT NULL,
    "leaderId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "variables" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_records" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "fromEmail" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "ccEmails" TEXT,
    "bccEmails" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "contactId" TEXT,
    "dealId" TEXT,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_attachments" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" TEXT NOT NULL,
    "channel" "ChatChannel" NOT NULL DEFAULT 'INTERNAL',
    "externalId" TEXT,
    "contactId" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "subject" TEXT,
    "status" "ChatStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "lastMessageAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "attachments" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_records" (
    "id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "contactId" TEXT,
    "contactName" TEXT,
    "userId" TEXT,
    "userName" TEXT,
    "duration" INTEGER NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'COMPLETED',
    "outcome" TEXT,
    "recordingUrl" TEXT,
    "recordingDuration" INTEGER,
    "transcription" TEXT,
    "summary" TEXT,
    "sentiment" TEXT,
    "dealId" TEXT,
    "ticketId" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentId" TEXT,
    "ocrContent" TEXT,
    "metadata" JSONB,
    "uploadedBy" TEXT NOT NULL,
    "uploadedByName" TEXT NOT NULL,
    "contactId" TEXT,
    "accountId" TEXT,
    "dealId" TEXT,
    "ticketId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_access_logs" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_shares" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "sharedWith" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'view',
    "expiresAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_surveys" (
    "id" TEXT NOT NULL,
    "type" "SurveyType" NOT NULL DEFAULT 'NPS',
    "contactId" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "ticketId" TEXT,
    "dealId" TEXT,
    "score" INTEGER,
    "rating" INTEGER,
    "comment" TEXT,
    "sentiment" TEXT,
    "tags" JSONB,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "followUpBy" TEXT,
    "followUpNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_surveys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_renewals" (
    "id" TEXT NOT NULL,
    "originalDealId" TEXT NOT NULL,
    "renewalDealId" TEXT,
    "renewalType" TEXT NOT NULL,
    "status" "RenewalStatus" NOT NULL DEFAULT 'UPCOMING',
    "renewalDate" TIMESTAMP(3) NOT NULL,
    "notificationSentAt" TIMESTAMP(3),
    "value" INTEGER NOT NULL,
    "previousValue" INTEGER,
    "changePercent" DOUBLE PRECISION,
    "notes" TEXT,
    "ownerId" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "deal_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_health_scores" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "usageScore" INTEGER,
    "engagementScore" INTEGER,
    "supportScore" INTEGER,
    "paymentScore" INTEGER,
    "churnRisk" "ChurnRisk" NOT NULL DEFAULT 'LOW',
    "riskFactors" JSONB,
    "recommendations" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),

    CONSTRAINT "account_health_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_skills" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "proficiency" INTEGER NOT NULL,
    "certified" BOOLEAN NOT NULL DEFAULT false,
    "certifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_availability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'OFFLINE',
    "statusMessage" TEXT,
    "currentCapacity" INTEGER NOT NULL DEFAULT 0,
    "maxCapacity" INTEGER NOT NULL DEFAULT 10,
    "lastActiveAt" TIMESTAMP(3),
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_audits" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ruleId" TEXT,
    "ruleName" TEXT,
    "fromUserId" TEXT,
    "fromUserName" TEXT,
    "toUserId" TEXT NOT NULL,
    "toUserName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routing_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "parentId" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "slaPolicyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_breaches" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "slaPolicyId" TEXT NOT NULL,
    "breachType" TEXT NOT NULL,
    "targetTime" TIMESTAMP(3) NOT NULL,
    "breachedAt" TIMESTAMP(3) NOT NULL,
    "durationOverdue" INTEGER NOT NULL,
    "escalatedTo" TEXT,
    "escalatedAt" TIMESTAMP(3),
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sla_breaches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalation_history" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "fromUserId" TEXT,
    "fromUserName" TEXT,
    "toUserId" TEXT NOT NULL,
    "toUserName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "escalatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "escalation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "triggerType" TEXT NOT NULL,
    "triggerConfig" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'RUNNING',
    "triggeredBy" TEXT NOT NULL,
    "triggerData" JSONB,
    "entityType" TEXT,
    "entityId" TEXT,
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "stepResults" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_rule_executions" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "triggered" BOOLEAN NOT NULL,
    "conditionsMet" JSONB,
    "actionsExecuted" JSONB,
    "result" TEXT NOT NULL,
    "error" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_rule_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "layout" JSONB NOT NULL,
    "widgets" JSONB NOT NULL,
    "filters" JSONB,
    "refreshInterval" INTEGER NOT NULL DEFAULT 300,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dashboard_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "calculation" TEXT NOT NULL,
    "target" DOUBLE PRECISION,
    "unit" TEXT,
    "format" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "filters" JSONB,
    "sorting" JSONB,
    "grouping" JSONB,
    "chartConfig" JSONB,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_schedules" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "timeOfDay" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "recipients" JSONB NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_executions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "rowCount" INTEGER,
    "executionTime" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "report_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "entityType" TEXT,
    "entityId" TEXT,
    "actionable" BOOLEAN NOT NULL DEFAULT true,
    "suggestedActions" JSONB,
    "metadata" JSONB,
    "status" "InsightStatus" NOT NULL DEFAULT 'NEW',
    "viewedAt" TIMESTAMP(3),
    "actedOnAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "dismissReason" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_checks" (
    "id" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "status" "HealthStatus" NOT NULL DEFAULT 'HEALTHY',
    "responseTime" INTEGER,
    "details" JSONB,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_incidents" (
    "id" TEXT NOT NULL,
    "alertRuleId" TEXT,
    "alertName" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "status" "AlertStatus" NOT NULL DEFAULT 'FIRING',
    "acknowledgedBy" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_metrics" (
    "id" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "tags" JSONB,
    "serviceName" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "secret" TEXT,
    "events" JSONB NOT NULL,
    "headers" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "retryCount" INTEGER NOT NULL DEFAULT 3,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
    "id" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "error" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" JSONB NOT NULL,
    "rateLimit" INTEGER NOT NULL DEFAULT 1000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_records" (
    "id" TEXT NOT NULL,
    "apiKeyId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "requestSize" INTEGER,
    "responseSize" INTEGER,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "api_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_versions" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3) NOT NULL,
    "deprecatedAt" TIMESTAMP(3),
    "sunsetDate" TIMESTAMP(3),
    "changelog" TEXT,
    "breakingChanges" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "version_major" INTEGER NOT NULL DEFAULT 1,
    "version_minor" INTEGER NOT NULL DEFAULT 0,
    "version_patch" INTEGER NOT NULL DEFAULT 0,
    "parent_version_id" TEXT,
    "is_latest_version" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "document_type" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "related_case_id" TEXT,
    "related_contact_id" TEXT,
    "storage_key" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "signed_by" TEXT,
    "signed_at" TIMESTAMP(3),
    "signature_hash" TEXT,
    "signature_ip_address" TEXT,
    "signature_user_agent" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "retention_until" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "embedding" vector,
    "search_vector" tsvector,
    "extracted_text" TEXT,

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_document_acl" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "principal_id" TEXT NOT NULL,
    "principal_type" TEXT NOT NULL,
    "access_level" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "case_document_acl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_document_audit" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "changes" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_document_audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "recipientPhone" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "htmlBody" TEXT,
    "templateId" TEXT,
    "templateVariables" JSONB,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "providerMessageId" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "sourceType" TEXT,
    "sourceId" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelPreferences" JSONB NOT NULL DEFAULT '{}',
    "categoryPreferences" JSONB NOT NULL DEFAULT '{}',
    "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
    "quietHoursEnd" TEXT NOT NULL DEFAULT '08:00',
    "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "doNotDisturb" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "variables" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_logs" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "providerResponse" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "notification_delivery_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_dlq" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "lastError" TEXT NOT NULL,
    "retryCount" INTEGER NOT NULL,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "status" "DLQStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolutionNote" TEXT,
    "movedToDLQAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRetryAt" TIMESTAMP(3),

    CONSTRAINT "notification_dlq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_versions" (
    "id" TEXT NOT NULL,
    "chainType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL,
    "maxTokens" INTEGER NOT NULL,
    "additionalParams" JSONB,
    "description" TEXT,
    "parentVersionId" TEXT,
    "rolloutStrategy" TEXT NOT NULL,
    "rolloutPercent" INTEGER,
    "experimentId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "chain_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ab_experiments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ExperimentType" NOT NULL,
    "status" "ExperimentStatus" NOT NULL DEFAULT 'DRAFT',
    "hypothesis" TEXT NOT NULL,
    "controlVariant" TEXT NOT NULL DEFAULT 'manual',
    "treatmentVariant" TEXT NOT NULL DEFAULT 'ai',
    "trafficPercent" INTEGER NOT NULL DEFAULT 50,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "minSampleSize" INTEGER NOT NULL DEFAULT 100,
    "significanceLevel" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ab_experiments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_score_feedback" (
    "id" TEXT NOT NULL,
    "feedbackType" "FeedbackType" NOT NULL,
    "originalScore" INTEGER NOT NULL,
    "originalConfidence" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "correctedScore" INTEGER,
    "correctionMagnitude" INTEGER,
    "reason" TEXT,
    "correctionCategory" "FeedbackCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leadId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "aiScoreId" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ai_score_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_version_audits" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousState" JSONB,
    "newState" JSONB,
    "performedBy" TEXT NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "chain_version_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_assignments" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "score" INTEGER,
    "confidence" DOUBLE PRECISION,
    "convertedAt" TIMESTAMP(3),
    "conversionValue" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "experiment_results" (
    "id" TEXT NOT NULL,
    "experimentId" TEXT NOT NULL,
    "controlSampleSize" INTEGER NOT NULL,
    "treatmentSampleSize" INTEGER NOT NULL,
    "controlMean" DOUBLE PRECISION NOT NULL,
    "treatmentMean" DOUBLE PRECISION NOT NULL,
    "controlStdDev" DOUBLE PRECISION NOT NULL,
    "treatmentStdDev" DOUBLE PRECISION NOT NULL,
    "tStatistic" DOUBLE PRECISION NOT NULL,
    "pValue" DOUBLE PRECISION NOT NULL,
    "confidenceInterval" JSONB NOT NULL,
    "effectSize" DOUBLE PRECISION NOT NULL,
    "controlConversionRate" DOUBLE PRECISION,
    "treatmentConversionRate" DOUBLE PRECISION,
    "chiSquareStatistic" DOUBLE PRECISION,
    "chiSquarePValue" DOUBLE PRECISION,
    "isSignificant" BOOLEAN NOT NULL,
    "winner" TEXT,
    "recommendation" TEXT,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "experiment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" TEXT NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "sentiment" "Sentiment",
    "metadata" JSONB,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_notes" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "fileType" "FileType" NOT NULL DEFAULT 'OTHER',
    "url" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT,
    "leadId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "lead_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_ai_insights" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "conversionProbability" INTEGER NOT NULL DEFAULT 0,
    "estimatedValue" INTEGER NOT NULL DEFAULT 0,
    "churnRisk" "ChurnRisk" NOT NULL DEFAULT 'LOW',
    "engagementScore" INTEGER NOT NULL DEFAULT 0,
    "sentiment" TEXT,
    "sentimentTrend" TEXT,
    "lastEngagementDays" INTEGER NOT NULL DEFAULT 0,
    "nextBestAction" TEXT,
    "recommendations" JSONB,
    "icpMatch" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripeCustomerId_key" ON "users"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "leads"("email");

-- CreateIndex
CREATE INDEX "leads_status_idx" ON "leads"("status");

-- CreateIndex
CREATE INDEX "leads_score_idx" ON "leads"("score");

-- CreateIndex
CREATE INDEX "leads_ownerId_idx" ON "leads"("ownerId");

-- CreateIndex
CREATE INDEX "leads_tenantId_idx" ON "leads"("tenantId");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_email_key" ON "contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_leadId_key" ON "contacts"("leadId");

-- CreateIndex
CREATE INDEX "contacts_email_idx" ON "contacts"("email");

-- CreateIndex
CREATE INDEX "contacts_ownerId_idx" ON "contacts"("ownerId");

-- CreateIndex
CREATE INDEX "contacts_accountId_idx" ON "contacts"("accountId");

-- CreateIndex
CREATE INDEX "contacts_tenantId_idx" ON "contacts"("tenantId");

-- CreateIndex
CREATE INDEX "contacts_status_idx" ON "contacts"("status");

-- CreateIndex
CREATE INDEX "idx_contacts_status" ON "contacts"("status");

-- CreateIndex
CREATE INDEX "accounts_name_idx" ON "accounts"("name");

-- CreateIndex
CREATE INDEX "accounts_ownerId_idx" ON "accounts"("ownerId");

-- CreateIndex
CREATE INDEX "accounts_tenantId_idx" ON "accounts"("tenantId");

-- CreateIndex
CREATE INDEX "opportunities_stage_idx" ON "opportunities"("stage");

-- CreateIndex
CREATE INDEX "opportunities_ownerId_idx" ON "opportunities"("ownerId");

-- CreateIndex
CREATE INDEX "opportunities_accountId_idx" ON "opportunities"("accountId");

-- CreateIndex
CREATE INDEX "opportunities_tenantId_idx" ON "opportunities"("tenantId");

-- CreateIndex
CREATE INDEX "opportunities_expectedCloseDate_idx" ON "opportunities"("expectedCloseDate");

-- CreateIndex
CREATE INDEX "deal_products_opportunityId_idx" ON "deal_products"("opportunityId");

-- CreateIndex
CREATE INDEX "deal_products_tenantId_idx" ON "deal_products"("tenantId");

-- CreateIndex
CREATE INDEX "deal_files_opportunityId_idx" ON "deal_files"("opportunityId");

-- CreateIndex
CREATE INDEX "deal_files_tenantId_idx" ON "deal_files"("tenantId");

-- CreateIndex
CREATE INDEX "activity_events_opportunityId_idx" ON "activity_events"("opportunityId");

-- CreateIndex
CREATE INDEX "activity_events_type_idx" ON "activity_events"("type");

-- CreateIndex
CREATE INDEX "activity_events_timestamp_idx" ON "activity_events"("timestamp");

-- CreateIndex
CREATE INDEX "activity_events_tenantId_idx" ON "activity_events"("tenantId");

-- CreateIndex
CREATE INDEX "agent_actions_status_idx" ON "agent_actions"("status");

-- CreateIndex
CREATE INDEX "agent_actions_entityType_idx" ON "agent_actions"("entityType");

-- CreateIndex
CREATE INDEX "agent_actions_createdAt_idx" ON "agent_actions"("createdAt");

-- CreateIndex
CREATE INDEX "agent_actions_expiresAt_idx" ON "agent_actions"("expiresAt");

-- CreateIndex
CREATE INDEX "agent_actions_tenantId_idx" ON "agent_actions"("tenantId");

-- CreateIndex
CREATE INDEX "contact_activities_contactId_idx" ON "contact_activities"("contactId");

-- CreateIndex
CREATE INDEX "contact_activities_type_idx" ON "contact_activities"("type");

-- CreateIndex
CREATE INDEX "contact_activities_timestamp_idx" ON "contact_activities"("timestamp");

-- CreateIndex
CREATE INDEX "contact_activities_tenantId_idx" ON "contact_activities"("tenantId");

-- CreateIndex
CREATE INDEX "tasks_status_idx" ON "tasks"("status");

-- CreateIndex
CREATE INDEX "tasks_ownerId_idx" ON "tasks"("ownerId");

-- CreateIndex
CREATE INDEX "tasks_tenantId_idx" ON "tasks"("tenantId");

-- CreateIndex
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

-- CreateIndex
CREATE INDEX "ai_scores_leadId_idx" ON "ai_scores"("leadId");

-- CreateIndex
CREATE INDEX "ai_scores_createdAt_idx" ON "ai_scores"("createdAt");

-- CreateIndex
CREATE INDEX "ai_scores_tenantId_idx" ON "ai_scores"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_records_sessionId_key" ON "conversation_records"("sessionId");

-- CreateIndex
CREATE INDEX "conversation_records_tenantId_idx" ON "conversation_records"("tenantId");

-- CreateIndex
CREATE INDEX "conversation_records_userId_idx" ON "conversation_records"("userId");

-- CreateIndex
CREATE INDEX "conversation_records_sessionId_idx" ON "conversation_records"("sessionId");

-- CreateIndex
CREATE INDEX "conversation_records_status_idx" ON "conversation_records"("status");

-- CreateIndex
CREATE INDEX "conversation_records_startedAt_idx" ON "conversation_records"("startedAt");

-- CreateIndex
CREATE INDEX "conversation_records_agentId_idx" ON "conversation_records"("agentId");

-- CreateIndex
CREATE INDEX "conversation_records_channel_idx" ON "conversation_records"("channel");

-- CreateIndex
CREATE INDEX "conversation_records_contextType_contextId_idx" ON "conversation_records"("contextType", "contextId");

-- CreateIndex
CREATE INDEX "message_records_conversationId_idx" ON "message_records"("conversationId");

-- CreateIndex
CREATE INDEX "message_records_role_idx" ON "message_records"("role");

-- CreateIndex
CREATE INDEX "message_records_createdAt_idx" ON "message_records"("createdAt");

-- CreateIndex
CREATE INDEX "tool_call_records_conversationId_idx" ON "tool_call_records"("conversationId");

-- CreateIndex
CREATE INDEX "tool_call_records_messageId_idx" ON "tool_call_records"("messageId");

-- CreateIndex
CREATE INDEX "tool_call_records_toolName_idx" ON "tool_call_records"("toolName");

-- CreateIndex
CREATE INDEX "tool_call_records_status_idx" ON "tool_call_records"("status");

-- CreateIndex
CREATE INDEX "tool_call_records_startedAt_idx" ON "tool_call_records"("startedAt");

-- CreateIndex
CREATE INDEX "tool_call_records_affectedEntityType_affectedEntityId_idx" ON "tool_call_records"("affectedEntityType", "affectedEntityId");

-- CreateIndex
CREATE INDEX "tool_call_records_requiresApproval_approvalStatus_idx" ON "tool_call_records"("requiresApproval", "approvalStatus");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "domain_events_eventType_idx" ON "domain_events"("eventType");

-- CreateIndex
CREATE INDEX "domain_events_aggregateType_aggregateId_idx" ON "domain_events"("aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "domain_events_status_idx" ON "domain_events"("status");

-- CreateIndex
CREATE INDEX "domain_events_occurredAt_idx" ON "domain_events"("occurredAt");

-- CreateIndex
CREATE INDEX "domain_events_tenantId_idx" ON "domain_events"("tenantId");

-- CreateIndex
CREATE INDEX "appointments_organizerId_idx" ON "appointments"("organizerId");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "appointments_startTime_idx" ON "appointments"("startTime");

-- CreateIndex
CREATE INDEX "appointments_endTime_idx" ON "appointments"("endTime");

-- CreateIndex
CREATE INDEX "appointments_appointmentType_idx" ON "appointments"("appointmentType");

-- CreateIndex
CREATE INDEX "appointments_startTime_endTime_idx" ON "appointments"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "appointments_externalCalendarId_idx" ON "appointments"("externalCalendarId");

-- CreateIndex
CREATE INDEX "appointments_tenantId_idx" ON "appointments"("tenantId");

-- CreateIndex
CREATE INDEX "appointment_attendees_userId_idx" ON "appointment_attendees"("userId");

-- CreateIndex
CREATE INDEX "appointment_attendees_tenantId_idx" ON "appointment_attendees"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_attendees_appointmentId_userId_key" ON "appointment_attendees"("appointmentId", "userId");

-- CreateIndex
CREATE INDEX "appointment_cases_caseId_idx" ON "appointment_cases"("caseId");

-- CreateIndex
CREATE INDEX "appointment_cases_tenantId_idx" ON "appointment_cases"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_cases_appointmentId_caseId_key" ON "appointment_cases"("appointmentId", "caseId");

-- CreateIndex
CREATE INDEX "security_events_eventType_idx" ON "security_events"("eventType");

-- CreateIndex
CREATE INDEX "security_events_actorId_idx" ON "security_events"("actorId");

-- CreateIndex
CREATE INDEX "security_events_severity_idx" ON "security_events"("severity");

-- CreateIndex
CREATE INDEX "security_events_createdAt_idx" ON "security_events"("createdAt");

-- CreateIndex
CREATE INDEX "security_events_tenantId_idx" ON "security_events"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_ticketNumber_key" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_ticketNumber_idx" ON "tickets"("ticketNumber");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_priority_idx" ON "tickets"("priority");

-- CreateIndex
CREATE INDEX "tickets_slaStatus_idx" ON "tickets"("slaStatus");

-- CreateIndex
CREATE INDEX "tickets_assigneeId_idx" ON "tickets"("assigneeId");

-- CreateIndex
CREATE INDEX "tickets_contactId_idx" ON "tickets"("contactId");

-- CreateIndex
CREATE INDEX "tickets_tenantId_idx" ON "tickets"("tenantId");

-- CreateIndex
CREATE INDEX "tickets_slaResolutionDue_idx" ON "tickets"("slaResolutionDue");

-- CreateIndex
CREATE INDEX "sla_policies_tenantId_idx" ON "sla_policies"("tenantId");

-- CreateIndex
CREATE INDEX "sla_notifications_ticketId_idx" ON "sla_notifications"("ticketId");

-- CreateIndex
CREATE INDEX "sla_notifications_type_idx" ON "sla_notifications"("type");

-- CreateIndex
CREATE INDEX "sla_notifications_sentAt_idx" ON "sla_notifications"("sentAt");

-- CreateIndex
CREATE INDEX "sla_notifications_tenantId_idx" ON "sla_notifications"("tenantId");

-- CreateIndex
CREATE INDEX "ticket_activities_ticketId_idx" ON "ticket_activities"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_activities_type_idx" ON "ticket_activities"("type");

-- CreateIndex
CREATE INDEX "ticket_activities_timestamp_idx" ON "ticket_activities"("timestamp");

-- CreateIndex
CREATE INDEX "ticket_activities_tenantId_idx" ON "ticket_activities"("tenantId");

-- CreateIndex
CREATE INDEX "ticket_attachments_ticketId_idx" ON "ticket_attachments"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_attachments_tenantId_idx" ON "ticket_attachments"("tenantId");

-- CreateIndex
CREATE INDEX "audit_log_entries_tenantId_idx" ON "audit_log_entries"("tenantId");

-- CreateIndex
CREATE INDEX "audit_log_entries_resourceType_resourceId_timestamp_idx" ON "audit_log_entries"("resourceType", "resourceId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entries_actorType_actorId_timestamp_idx" ON "audit_log_entries"("actorType", "actorId", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entries_eventType_timestamp_idx" ON "audit_log_entries"("eventType", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entries_traceId_idx" ON "audit_log_entries"("traceId");

-- CreateIndex
CREATE INDEX "audit_log_entries_timestamp_idx" ON "audit_log_entries"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "audit_log_entries_action_idx" ON "audit_log_entries"("action");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE INDEX "permissions_resource_idx" ON "permissions"("resource");

-- CreateIndex
CREATE INDEX "permissions_action_idx" ON "permissions"("action");

-- CreateIndex
CREATE UNIQUE INDEX "rbac_roles_name_key" ON "rbac_roles"("name");

-- CreateIndex
CREATE INDEX "rbac_roles_level_idx" ON "rbac_roles"("level");

-- CreateIndex
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");

-- CreateIndex
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "role_permissions_tenantId_idx" ON "role_permissions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "user_role_assignments_userId_idx" ON "user_role_assignments"("userId");

-- CreateIndex
CREATE INDEX "user_role_assignments_roleId_idx" ON "user_role_assignments"("roleId");

-- CreateIndex
CREATE INDEX "user_role_assignments_tenantId_idx" ON "user_role_assignments"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_role_assignments_userId_roleId_key" ON "user_role_assignments"("userId", "roleId");

-- CreateIndex
CREATE INDEX "user_permissions_userId_idx" ON "user_permissions"("userId");

-- CreateIndex
CREATE INDEX "user_permissions_permissionId_idx" ON "user_permissions"("permissionId");

-- CreateIndex
CREATE INDEX "user_permissions_tenantId_idx" ON "user_permissions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_permissions_userId_permissionId_key" ON "user_permissions"("userId", "permissionId");

-- CreateIndex
CREATE INDEX "contact_notes_contactId_idx" ON "contact_notes"("contactId");

-- CreateIndex
CREATE INDEX "contact_notes_createdAt_idx" ON "contact_notes"("createdAt");

-- CreateIndex
CREATE INDEX "contact_notes_tenantId_idx" ON "contact_notes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "contact_ai_insights_contactId_key" ON "contact_ai_insights"("contactId");

-- CreateIndex
CREATE INDEX "contact_ai_insights_churnRisk_idx" ON "contact_ai_insights"("churnRisk");

-- CreateIndex
CREATE INDEX "contact_ai_insights_conversionProbability_idx" ON "contact_ai_insights"("conversionProbability");

-- CreateIndex
CREATE INDEX "contact_ai_insights_tenantId_idx" ON "contact_ai_insights"("tenantId");

-- CreateIndex
CREATE INDEX "calendar_events_startTime_idx" ON "calendar_events"("startTime");

-- CreateIndex
CREATE INDEX "calendar_events_eventType_idx" ON "calendar_events"("eventType");

-- CreateIndex
CREATE INDEX "calendar_events_contactId_idx" ON "calendar_events"("contactId");

-- CreateIndex
CREATE INDEX "calendar_events_tenantId_idx" ON "calendar_events"("tenantId");

-- CreateIndex
CREATE INDEX "team_messages_channel_idx" ON "team_messages"("channel");

-- CreateIndex
CREATE INDEX "team_messages_createdAt_idx" ON "team_messages"("createdAt");

-- CreateIndex
CREATE INDEX "pipeline_snapshots_snapshotDate_idx" ON "pipeline_snapshots"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "pipeline_snapshots_stage_snapshotDate_key" ON "pipeline_snapshots"("stage", "snapshotDate");

-- CreateIndex
CREATE INDEX "traffic_sources_snapshotDate_idx" ON "traffic_sources"("snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "traffic_sources_name_snapshotDate_key" ON "traffic_sources"("name", "snapshotDate");

-- CreateIndex
CREATE INDEX "growth_metrics_year_idx" ON "growth_metrics"("year");

-- CreateIndex
CREATE INDEX "growth_metrics_metricType_idx" ON "growth_metrics"("metricType");

-- CreateIndex
CREATE UNIQUE INDEX "growth_metrics_month_year_metricType_key" ON "growth_metrics"("month", "year", "metricType");

-- CreateIndex
CREATE INDEX "deals_won_metrics_year_idx" ON "deals_won_metrics"("year");

-- CreateIndex
CREATE UNIQUE INDEX "deals_won_metrics_month_year_key" ON "deals_won_metrics"("month", "year");

-- CreateIndex
CREATE INDEX "ticket_next_steps_ticketId_idx" ON "ticket_next_steps"("ticketId");

-- CreateIndex
CREATE INDEX "ticket_next_steps_completed_idx" ON "ticket_next_steps"("completed");

-- CreateIndex
CREATE INDEX "related_tickets_ticketId_idx" ON "related_tickets"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "related_tickets_ticketId_relatedId_key" ON "related_tickets"("ticketId", "relatedId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_ai_insights_ticketId_key" ON "ticket_ai_insights"("ticketId");

-- CreateIndex
CREATE INDEX "sales_performance_period_idx" ON "sales_performance"("period");

-- CreateIndex
CREATE INDEX "sales_performance_snapshotDate_idx" ON "sales_performance"("snapshotDate");

-- CreateIndex
CREATE INDEX "sales_performance_rank_idx" ON "sales_performance"("rank");

-- CreateIndex
CREATE UNIQUE INDEX "sales_performance_userId_period_snapshotDate_key" ON "sales_performance"("userId", "period", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_slug_idx" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspaces_isActive_idx" ON "workspaces"("isActive");

-- CreateIndex
CREATE INDEX "workspace_members_userId_idx" ON "workspace_members"("userId");

-- CreateIndex
CREATE INDEX "workspace_members_workspaceId_idx" ON "workspace_members"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_members_userId_workspaceId_key" ON "workspace_members"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "teams_workspaceId_idx" ON "teams"("workspaceId");

-- CreateIndex
CREATE INDEX "teams_leaderId_idx" ON "teams"("leaderId");

-- CreateIndex
CREATE INDEX "team_members_userId_idx" ON "team_members"("userId");

-- CreateIndex
CREATE INDEX "team_members_teamId_idx" ON "team_members"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_userId_teamId_key" ON "team_members"("userId", "teamId");

-- CreateIndex
CREATE INDEX "email_templates_category_idx" ON "email_templates"("category");

-- CreateIndex
CREATE INDEX "email_templates_isActive_idx" ON "email_templates"("isActive");

-- CreateIndex
CREATE INDEX "email_records_contactId_idx" ON "email_records"("contactId");

-- CreateIndex
CREATE INDEX "email_records_dealId_idx" ON "email_records"("dealId");

-- CreateIndex
CREATE INDEX "email_records_status_idx" ON "email_records"("status");

-- CreateIndex
CREATE INDEX "email_records_sentAt_idx" ON "email_records"("sentAt");

-- CreateIndex
CREATE INDEX "email_attachments_emailId_idx" ON "email_attachments"("emailId");

-- CreateIndex
CREATE INDEX "chat_conversations_channel_idx" ON "chat_conversations"("channel");

-- CreateIndex
CREATE INDEX "chat_conversations_status_idx" ON "chat_conversations"("status");

-- CreateIndex
CREATE INDEX "chat_conversations_contactId_idx" ON "chat_conversations"("contactId");

-- CreateIndex
CREATE INDEX "chat_conversations_assigneeId_idx" ON "chat_conversations"("assigneeId");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_idx" ON "chat_messages"("conversationId");

-- CreateIndex
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

-- CreateIndex
CREATE INDEX "call_records_contactId_idx" ON "call_records"("contactId");

-- CreateIndex
CREATE INDEX "call_records_userId_idx" ON "call_records"("userId");

-- CreateIndex
CREATE INDEX "call_records_startedAt_idx" ON "call_records"("startedAt");

-- CreateIndex
CREATE INDEX "call_records_status_idx" ON "call_records"("status");

-- CreateIndex
CREATE INDEX "documents_category_idx" ON "documents"("category");

-- CreateIndex
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- CreateIndex
CREATE INDEX "documents_contactId_idx" ON "documents"("contactId");

-- CreateIndex
CREATE INDEX "documents_accountId_idx" ON "documents"("accountId");

-- CreateIndex
CREATE INDEX "documents_dealId_idx" ON "documents"("dealId");

-- CreateIndex
CREATE INDEX "idx_documents_accountid" ON "documents"("accountId");

-- CreateIndex
CREATE INDEX "idx_documents_contactid" ON "documents"("contactId");

-- CreateIndex
CREATE INDEX "idx_documents_dealid" ON "documents"("dealId");

-- CreateIndex
CREATE INDEX "idx_documents_ticketid" ON "documents"("ticketId");

-- CreateIndex
CREATE INDEX "document_access_logs_documentId_idx" ON "document_access_logs"("documentId");

-- CreateIndex
CREATE INDEX "document_access_logs_userId_idx" ON "document_access_logs"("userId");

-- CreateIndex
CREATE INDEX "document_access_logs_accessedAt_idx" ON "document_access_logs"("accessedAt");

-- CreateIndex
CREATE INDEX "document_shares_documentId_idx" ON "document_shares"("documentId");

-- CreateIndex
CREATE INDEX "document_shares_sharedWith_idx" ON "document_shares"("sharedWith");

-- CreateIndex
CREATE UNIQUE INDEX "document_shares_documentId_sharedWith_key" ON "document_shares"("documentId", "sharedWith");

-- CreateIndex
CREATE INDEX "feedback_surveys_type_idx" ON "feedback_surveys"("type");

-- CreateIndex
CREATE INDEX "feedback_surveys_contactId_idx" ON "feedback_surveys"("contactId");

-- CreateIndex
CREATE INDEX "feedback_surveys_status_idx" ON "feedback_surveys"("status");

-- CreateIndex
CREATE INDEX "feedback_surveys_score_idx" ON "feedback_surveys"("score");

-- CreateIndex
CREATE INDEX "deal_renewals_originalDealId_idx" ON "deal_renewals"("originalDealId");

-- CreateIndex
CREATE INDEX "deal_renewals_status_idx" ON "deal_renewals"("status");

-- CreateIndex
CREATE INDEX "deal_renewals_renewalDate_idx" ON "deal_renewals"("renewalDate");

-- CreateIndex
CREATE INDEX "deal_renewals_tenantId_idx" ON "deal_renewals"("tenantId");

-- CreateIndex
CREATE INDEX "idx_deal_renewals_originaldealid" ON "deal_renewals"("originalDealId");

-- CreateIndex
CREATE INDEX "idx_deal_renewals_renewaldealid" ON "deal_renewals"("renewalDealId");

-- CreateIndex
CREATE INDEX "account_health_scores_accountId_idx" ON "account_health_scores"("accountId");

-- CreateIndex
CREATE INDEX "account_health_scores_churnRisk_idx" ON "account_health_scores"("churnRisk");

-- CreateIndex
CREATE INDEX "account_health_scores_overallScore_idx" ON "account_health_scores"("overallScore");

-- CreateIndex
CREATE INDEX "agent_skills_userId_idx" ON "agent_skills"("userId");

-- CreateIndex
CREATE INDEX "agent_skills_skillName_idx" ON "agent_skills"("skillName");

-- CreateIndex
CREATE INDEX "agent_skills_proficiency_idx" ON "agent_skills"("proficiency");

-- CreateIndex
CREATE INDEX "idx_agent_skills_userid" ON "agent_skills"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_skills_userId_skillName_key" ON "agent_skills"("userId", "skillName");

-- CreateIndex
CREATE UNIQUE INDEX "agent_availability_userId_key" ON "agent_availability"("userId");

-- CreateIndex
CREATE INDEX "agent_availability_status_idx" ON "agent_availability"("status");

-- CreateIndex
CREATE INDEX "agent_availability_currentCapacity_idx" ON "agent_availability"("currentCapacity");

-- CreateIndex
CREATE INDEX "idx_agent_availability_userid" ON "agent_availability"("userId");

-- CreateIndex
CREATE INDEX "routing_rules_isActive_idx" ON "routing_rules"("isActive");

-- CreateIndex
CREATE INDEX "routing_rules_priority_idx" ON "routing_rules"("priority");

-- CreateIndex
CREATE INDEX "routing_audits_ticketId_idx" ON "routing_audits"("ticketId");

-- CreateIndex
CREATE INDEX "routing_audits_toUserId_idx" ON "routing_audits"("toUserId");

-- CreateIndex
CREATE INDEX "routing_audits_createdAt_idx" ON "routing_audits"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_categories_name_key" ON "ticket_categories"("name");

-- CreateIndex
CREATE INDEX "ticket_categories_parentId_idx" ON "ticket_categories"("parentId");

-- CreateIndex
CREATE INDEX "ticket_categories_isActive_idx" ON "ticket_categories"("isActive");

-- CreateIndex
CREATE INDEX "sla_breaches_ticketId_idx" ON "sla_breaches"("ticketId");

-- CreateIndex
CREATE INDEX "sla_breaches_breachType_idx" ON "sla_breaches"("breachType");

-- CreateIndex
CREATE INDEX "sla_breaches_resolved_idx" ON "sla_breaches"("resolved");

-- CreateIndex
CREATE INDEX "escalation_history_ticketId_idx" ON "escalation_history"("ticketId");

-- CreateIndex
CREATE INDEX "escalation_history_level_idx" ON "escalation_history"("level");

-- CreateIndex
CREATE INDEX "escalation_history_escalatedAt_idx" ON "escalation_history"("escalatedAt");

-- CreateIndex
CREATE INDEX "workflow_definitions_category_idx" ON "workflow_definitions"("category");

-- CreateIndex
CREATE INDEX "workflow_definitions_isActive_idx" ON "workflow_definitions"("isActive");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowId_idx" ON "workflow_executions"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions"("status");

-- CreateIndex
CREATE INDEX "workflow_executions_entityType_entityId_idx" ON "workflow_executions"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "workflow_executions_startedAt_idx" ON "workflow_executions"("startedAt");

-- CreateIndex
CREATE INDEX "business_rules_entityType_idx" ON "business_rules"("entityType");

-- CreateIndex
CREATE INDEX "business_rules_ruleType_idx" ON "business_rules"("ruleType");

-- CreateIndex
CREATE INDEX "business_rules_isActive_idx" ON "business_rules"("isActive");

-- CreateIndex
CREATE INDEX "business_rule_executions_ruleId_idx" ON "business_rule_executions"("ruleId");

-- CreateIndex
CREATE INDEX "business_rule_executions_entityType_entityId_idx" ON "business_rule_executions"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "business_rule_executions_executedAt_idx" ON "business_rule_executions"("executedAt");

-- CreateIndex
CREATE INDEX "dashboard_configs_userId_idx" ON "dashboard_configs"("userId");

-- CreateIndex
CREATE INDEX "dashboard_configs_isDefault_idx" ON "dashboard_configs"("isDefault");

-- CreateIndex
CREATE INDEX "kpi_definitions_category_idx" ON "kpi_definitions"("category");

-- CreateIndex
CREATE INDEX "kpi_definitions_isActive_idx" ON "kpi_definitions"("isActive");

-- CreateIndex
CREATE INDEX "report_definitions_category_idx" ON "report_definitions"("category");

-- CreateIndex
CREATE INDEX "report_definitions_createdBy_idx" ON "report_definitions"("createdBy");

-- CreateIndex
CREATE INDEX "report_schedules_reportId_idx" ON "report_schedules"("reportId");

-- CreateIndex
CREATE INDEX "report_schedules_isActive_idx" ON "report_schedules"("isActive");

-- CreateIndex
CREATE INDEX "report_schedules_nextRunAt_idx" ON "report_schedules"("nextRunAt");

-- CreateIndex
CREATE INDEX "report_executions_reportId_idx" ON "report_executions"("reportId");

-- CreateIndex
CREATE INDEX "report_executions_status_idx" ON "report_executions"("status");

-- CreateIndex
CREATE INDEX "report_executions_startedAt_idx" ON "report_executions"("startedAt");

-- CreateIndex
CREATE INDEX "ai_insights_type_idx" ON "ai_insights"("type");

-- CreateIndex
CREATE INDEX "ai_insights_category_idx" ON "ai_insights"("category");

-- CreateIndex
CREATE INDEX "ai_insights_status_idx" ON "ai_insights"("status");

-- CreateIndex
CREATE INDEX "ai_insights_entityType_entityId_idx" ON "ai_insights"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ai_insights_createdAt_idx" ON "ai_insights"("createdAt");

-- CreateIndex
CREATE INDEX "health_checks_serviceName_idx" ON "health_checks"("serviceName");

-- CreateIndex
CREATE INDEX "health_checks_status_idx" ON "health_checks"("status");

-- CreateIndex
CREATE INDEX "health_checks_checkedAt_idx" ON "health_checks"("checkedAt");

-- CreateIndex
CREATE INDEX "alert_incidents_severity_idx" ON "alert_incidents"("severity");

-- CreateIndex
CREATE INDEX "alert_incidents_source_idx" ON "alert_incidents"("source");

-- CreateIndex
CREATE INDEX "alert_incidents_status_idx" ON "alert_incidents"("status");

-- CreateIndex
CREATE INDEX "alert_incidents_firedAt_idx" ON "alert_incidents"("firedAt");

-- CreateIndex
CREATE INDEX "performance_metrics_metricName_idx" ON "performance_metrics"("metricName");

-- CreateIndex
CREATE INDEX "performance_metrics_serviceName_idx" ON "performance_metrics"("serviceName");

-- CreateIndex
CREATE INDEX "performance_metrics_recordedAt_idx" ON "performance_metrics"("recordedAt");

-- CreateIndex
CREATE INDEX "webhook_endpoints_isActive_idx" ON "webhook_endpoints"("isActive");

-- CreateIndex
CREATE INDEX "webhook_endpoints_tenantId_idx" ON "webhook_endpoints"("tenantId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_endpointId_idx" ON "webhook_deliveries"("endpointId");

-- CreateIndex
CREATE INDEX "webhook_deliveries_eventType_idx" ON "webhook_deliveries"("eventType");

-- CreateIndex
CREATE INDEX "webhook_deliveries_status_idx" ON "webhook_deliveries"("status");

-- CreateIndex
CREATE INDEX "webhook_deliveries_createdAt_idx" ON "webhook_deliveries"("createdAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_tenantId_idx" ON "webhook_deliveries"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_keyPrefix_idx" ON "api_keys"("keyPrefix");

-- CreateIndex
CREATE INDEX "api_keys_userId_idx" ON "api_keys"("userId");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "api_usage_records_apiKeyId_idx" ON "api_usage_records"("apiKeyId");

-- CreateIndex
CREATE INDEX "api_usage_records_endpoint_idx" ON "api_usage_records"("endpoint");

-- CreateIndex
CREATE INDEX "api_usage_records_recordedAt_idx" ON "api_usage_records"("recordedAt");

-- CreateIndex
CREATE INDEX "api_usage_records_tenantId_idx" ON "api_usage_records"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "api_versions_version_key" ON "api_versions"("version");

-- CreateIndex
CREATE INDEX "api_versions_status_idx" ON "api_versions"("status");

-- CreateIndex
CREATE INDEX "case_documents_tenant_id_idx" ON "case_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "case_documents_status_idx" ON "case_documents"("status");

-- CreateIndex
CREATE INDEX "case_documents_is_latest_version_idx" ON "case_documents"("is_latest_version");

-- CreateIndex
CREATE INDEX "case_documents_parent_version_id_idx" ON "case_documents"("parent_version_id");

-- CreateIndex
CREATE INDEX "case_documents_related_case_id_idx" ON "case_documents"("related_case_id");

-- CreateIndex
CREATE INDEX "case_documents_related_contact_id_idx" ON "case_documents"("related_contact_id");

-- CreateIndex
CREATE INDEX "case_documents_classification_idx" ON "case_documents"("classification");

-- CreateIndex
CREATE INDEX "case_documents_retention_until_idx" ON "case_documents"("retention_until");

-- CreateIndex
CREATE INDEX "case_documents_deleted_at_idx" ON "case_documents"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_documents_tenant_id_id_key" ON "case_documents"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "case_document_acl_document_id_idx" ON "case_document_acl"("document_id");

-- CreateIndex
CREATE INDEX "case_document_acl_principal_id_idx" ON "case_document_acl"("principal_id");

-- CreateIndex
CREATE INDEX "case_document_acl_expires_at_idx" ON "case_document_acl"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "case_document_acl_document_id_principal_id_key" ON "case_document_acl"("document_id", "principal_id");

-- CreateIndex
CREATE INDEX "case_document_audit_document_id_idx" ON "case_document_audit"("document_id");

-- CreateIndex
CREATE INDEX "case_document_audit_user_id_idx" ON "case_document_audit"("user_id");

-- CreateIndex
CREATE INDEX "case_document_audit_created_at_idx" ON "case_document_audit"("created_at");

-- CreateIndex
CREATE INDEX "case_document_audit_event_type_idx" ON "case_document_audit"("event_type");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_recipientId_idx" ON "notifications"("recipientId");

-- CreateIndex
CREATE INDEX "notifications_channel_idx" ON "notifications"("channel");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_priority_idx" ON "notifications"("priority");

-- CreateIndex
CREATE INDEX "notifications_scheduledAt_idx" ON "notifications"("scheduledAt");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_recipientId_status_idx" ON "notifications"("tenantId", "recipientId", "status");

-- CreateIndex
CREATE INDEX "notification_preferences_tenantId_idx" ON "notification_preferences"("tenantId");

-- CreateIndex
CREATE INDEX "notification_preferences_userId_idx" ON "notification_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_tenantId_userId_key" ON "notification_preferences"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "notification_templates_tenantId_idx" ON "notification_templates"("tenantId");

-- CreateIndex
CREATE INDEX "notification_templates_channel_idx" ON "notification_templates"("channel");

-- CreateIndex
CREATE INDEX "notification_templates_category_idx" ON "notification_templates"("category");

-- CreateIndex
CREATE INDEX "notification_templates_isActive_idx" ON "notification_templates"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenantId_name_channel_version_key" ON "notification_templates"("tenantId", "name", "channel", "version");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_notificationId_idx" ON "notification_delivery_logs"("notificationId");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_status_idx" ON "notification_delivery_logs"("status");

-- CreateIndex
CREATE INDEX "notification_delivery_logs_attemptedAt_idx" ON "notification_delivery_logs"("attemptedAt");

-- CreateIndex
CREATE INDEX "notification_dlq_tenantId_idx" ON "notification_dlq"("tenantId");

-- CreateIndex
CREATE INDEX "notification_dlq_status_idx" ON "notification_dlq"("status");

-- CreateIndex
CREATE INDEX "notification_dlq_movedToDLQAt_idx" ON "notification_dlq"("movedToDLQAt");

-- CreateIndex
CREATE INDEX "chain_versions_chainType_status_idx" ON "chain_versions"("chainType", "status");

-- CreateIndex
CREATE INDEX "chain_versions_status_idx" ON "chain_versions"("status");

-- CreateIndex
CREATE INDEX "chain_versions_tenantId_idx" ON "chain_versions"("tenantId");

-- CreateIndex
CREATE INDEX "ab_experiments_startDate_idx" ON "ab_experiments"("startDate");

-- CreateIndex
CREATE INDEX "ab_experiments_status_idx" ON "ab_experiments"("status");

-- CreateIndex
CREATE INDEX "ab_experiments_tenantId_idx" ON "ab_experiments"("tenantId");

-- CreateIndex
CREATE INDEX "ab_experiments_type_idx" ON "ab_experiments"("type");

-- CreateIndex
CREATE INDEX "ai_score_feedback_createdAt_idx" ON "ai_score_feedback"("createdAt");

-- CreateIndex
CREATE INDEX "ai_score_feedback_feedbackType_idx" ON "ai_score_feedback"("feedbackType");

-- CreateIndex
CREATE INDEX "ai_score_feedback_leadId_idx" ON "ai_score_feedback"("leadId");

-- CreateIndex
CREATE INDEX "ai_score_feedback_modelVersion_idx" ON "ai_score_feedback"("modelVersion");

-- CreateIndex
CREATE INDEX "ai_score_feedback_tenantId_idx" ON "ai_score_feedback"("tenantId");

-- CreateIndex
CREATE INDEX "ai_score_feedback_userId_idx" ON "ai_score_feedback"("userId");

-- CreateIndex
CREATE INDEX "chain_version_audits_performedAt_idx" ON "chain_version_audits"("performedAt");

-- CreateIndex
CREATE INDEX "chain_version_audits_tenantId_idx" ON "chain_version_audits"("tenantId");

-- CreateIndex
CREATE INDEX "chain_version_audits_versionId_idx" ON "chain_version_audits"("versionId");

-- CreateIndex
CREATE INDEX "experiment_assignments_convertedAt_idx" ON "experiment_assignments"("convertedAt");

-- CreateIndex
CREATE INDEX "experiment_assignments_experimentId_idx" ON "experiment_assignments"("experimentId");

-- CreateIndex
CREATE INDEX "experiment_assignments_leadId_idx" ON "experiment_assignments"("leadId");

-- CreateIndex
CREATE INDEX "experiment_assignments_variant_idx" ON "experiment_assignments"("variant");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_assignments_experimentId_leadId_key" ON "experiment_assignments"("experimentId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "experiment_results_experimentId_key" ON "experiment_results"("experimentId");

-- CreateIndex
CREATE INDEX "lead_activities_leadId_idx" ON "lead_activities"("leadId");

-- CreateIndex
CREATE INDEX "lead_activities_type_idx" ON "lead_activities"("type");

-- CreateIndex
CREATE INDEX "lead_activities_timestamp_idx" ON "lead_activities"("timestamp");

-- CreateIndex
CREATE INDEX "lead_activities_tenantId_idx" ON "lead_activities"("tenantId");

-- CreateIndex
CREATE INDEX "lead_notes_leadId_idx" ON "lead_notes"("leadId");

-- CreateIndex
CREATE INDEX "lead_notes_createdAt_idx" ON "lead_notes"("createdAt");

-- CreateIndex
CREATE INDEX "lead_notes_tenantId_idx" ON "lead_notes"("tenantId");

-- CreateIndex
CREATE INDEX "lead_files_leadId_idx" ON "lead_files"("leadId");

-- CreateIndex
CREATE INDEX "lead_files_tenantId_idx" ON "lead_files"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "lead_ai_insights_leadId_key" ON "lead_ai_insights"("leadId");

-- CreateIndex
CREATE INDEX "lead_ai_insights_leadId_idx" ON "lead_ai_insights"("leadId");

-- CreateIndex
CREATE INDEX "lead_ai_insights_tenantId_idx" ON "lead_ai_insights"("tenantId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_products" ADD CONSTRAINT "deal_products_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_files" ADD CONSTRAINT "deal_files_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_files" ADD CONSTRAINT "deal_files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_activities" ADD CONSTRAINT "contact_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_scores" ADD CONSTRAINT "ai_scores_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_scores" ADD CONSTRAINT "ai_scores_scoredById_fkey" FOREIGN KEY ("scoredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_scores" ADD CONSTRAINT "ai_scores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_records" ADD CONSTRAINT "message_records_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_call_records" ADD CONSTRAINT "tool_call_records_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_call_records" ADD CONSTRAINT "tool_call_records_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_parentAppointmentId_fkey" FOREIGN KEY ("parentAppointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_attendees" ADD CONSTRAINT "appointment_attendees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_cases" ADD CONSTRAINT "appointment_cases_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_cases" ADD CONSTRAINT "appointment_cases_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_slaPolicyId_fkey" FOREIGN KEY ("slaPolicyId") REFERENCES "sla_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_policies" ADD CONSTRAINT "sla_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_notifications" ADD CONSTRAINT "sla_notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_notifications" ADD CONSTRAINT "sla_notifications_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_activities" ADD CONSTRAINT "ticket_activities_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log_entries" ADD CONSTRAINT "audit_log_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "rbac_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "rbac_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_notes" ADD CONSTRAINT "contact_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_ai_insights" ADD CONSTRAINT "contact_ai_insights_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_ai_insights" ADD CONSTRAINT "contact_ai_insights_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_ownerid_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_next_steps" ADD CONSTRAINT "ticket_next_steps_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "related_tickets" ADD CONSTRAINT "related_tickets_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_ai_insights" ADD CONSTRAINT "ticket_ai_insights_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_attachments" ADD CONSTRAINT "email_attachments_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "email_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_accountid_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_contactid_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_dealid_fkey" FOREIGN KEY ("dealId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_ticketid_fkey" FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "document_access_logs" ADD CONSTRAINT "document_access_logs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_renewals" ADD CONSTRAINT "deal_renewals_originaldealid_fkey" FOREIGN KEY ("originalDealId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deal_renewals" ADD CONSTRAINT "deal_renewals_renewaldealid_fkey" FOREIGN KEY ("renewalDealId") REFERENCES "opportunities"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "deal_renewals" ADD CONSTRAINT "deal_renewals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_skills" ADD CONSTRAINT "agent_skills_userid_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "agent_availability" ADD CONSTRAINT "agent_availability_userid_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflow_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_rule_executions" ADD CONSTRAINT "business_rule_executions_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "business_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_executions" ADD CONSTRAINT "report_executions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "report_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "webhook_endpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "api_keys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_usage_records" ADD CONSTRAINT "api_usage_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_document_acl" ADD CONSTRAINT "case_document_acl_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "case_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_document_audit" ADD CONSTRAINT "case_document_audit_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "case_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_versions" ADD CONSTRAINT "chain_versions_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "chain_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_score_feedback" ADD CONSTRAINT "ai_score_feedback_aiScoreId_fkey" FOREIGN KEY ("aiScoreId") REFERENCES "ai_scores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_score_feedback" ADD CONSTRAINT "ai_score_feedback_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_version_audits" ADD CONSTRAINT "chain_version_audits_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_version_audits" ADD CONSTRAINT "chain_version_audits_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "chain_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ab_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiment_results" ADD CONSTRAINT "experiment_results_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "ab_experiments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_notes" ADD CONSTRAINT "lead_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_files" ADD CONSTRAINT "lead_files_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_files" ADD CONSTRAINT "lead_files_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_ai_insights" ADD CONSTRAINT "lead_ai_insights_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_ai_insights" ADD CONSTRAINT "lead_ai_insights_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

