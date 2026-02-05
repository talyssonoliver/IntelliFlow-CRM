# ADR-025: Tenant ID Normalization Migration

**Status:** Proposed

**Date:** 2026-02-03

**Deciders:** Tech Lead, Security Team, Backend Team

**Technical Story:** Security Gap - Multi-tenancy inconsistency discovered during seed audit

## Context and Problem Statement

During a seed data audit, we discovered that **many models are missing the `tenantId` column** despite ADR-004 stating: "All multi-tenant tables include a `tenant_id` column."

This creates a **critical security gap**:
1. Supabase RLS policies cannot be applied to tables without `tenantId`
2. Direct SQL access or injection could expose data across tenants
3. The Prisma middleware documented in ADR-004 cannot filter these tables

## Risk Assessment

| Risk | Severity | Impact |
|------|----------|--------|
| Cross-tenant data leakage via SQL injection | **CRITICAL** | Full tenant data exposure |
| RLS bypass on child tables | **HIGH** | Partial data exposure |
| Audit trail gaps | **MEDIUM** | Compliance issues |

## Models Inventory

### Category 1: HIGH PRIORITY - Direct tenant data (missing tenantId)

These tables contain sensitive tenant data but lack `tenantId`:

| Model | Parent Relation | Backfill Source |
|-------|-----------------|-----------------|
| `LeadActivity` | `leadId` → Lead | `lead.tenantId` |
| `LeadFile` | `leadId` → Lead | `lead.tenantId` |
| `LeadAIInsight` | `leadId` → Lead | `lead.tenantId` |
| `AIScore` | `leadId` → Lead | `lead.tenantId` |
| `ContactActivity` | `contactId` → Contact | `contact.tenantId` |
| `ContactAIInsight` | `contactId` → Contact | `contact.tenantId` |
| `DealProduct` | `opportunityId` → Opportunity | `opportunity.tenantId` |
| `DealFile` | `opportunityId` → Opportunity | `opportunity.tenantId` |
| `ActivityEvent` | `opportunityId` → Opportunity | `opportunity.tenantId` |
| `AgentAction` | `entityId` (polymorphic) | Requires entity lookup |

### Category 2: MEDIUM PRIORITY - Ticket-related tables

| Model | Parent Relation | Backfill Source |
|-------|-----------------|-----------------|
| `SLANotification` | `ticketId` → Ticket | `ticket.tenantId` |
| `TicketAttachment` | `ticketId` → Ticket | `ticket.tenantId` |
| `TicketNextStep` | `ticketId` → Ticket | `ticket.tenantId` |
| `RelatedTicket` | `ticketId` → Ticket | `ticket.tenantId` |
| `TicketAIInsight` | `ticketId` → Ticket | `ticket.tenantId` |
| `SLABreach` | `ticketId` → Ticket | Via ticket lookup |
| `EscalationHistory` | `ticketId` → Ticket | Via ticket lookup |
| `RoutingAudit` | `ticketId` → Ticket | Via ticket lookup |

### Category 3: MEDIUM PRIORITY - Conversation-related tables

| Model | Parent Relation | Backfill Source |
|-------|-----------------|-----------------|
| `MessageRecord` | `conversationId` → ConversationRecord | `conversation.tenantId` |
| `ToolCallRecord` | `conversationId` → ConversationRecord | `conversation.tenantId` |

### Category 4: MEDIUM PRIORITY - Document-related tables

| Model | Parent Relation | Backfill Source |
|-------|-----------------|-----------------|
| `Document` | standalone | Needs tenantId added |
| `DocumentAccessLog` | `documentId` → Document | `document.tenantId` |
| `DocumentShare` | `documentId` → Document | `document.tenantId` |

### Category 5: MEDIUM PRIORITY - Appointment-related tables

| Model | Parent Relation | Backfill Source |
|-------|-----------------|-----------------|
| `AppointmentAttendee` | `appointmentId` → Appointment | `appointment.tenantId` |
| `AppointmentCase` | `appointmentId` → Appointment | `appointment.tenantId` |

### Category 6: LOW PRIORITY - Analytics & Reporting tables

These may be intentionally tenant-agnostic for cross-tenant analytics:

| Model | Decision |
|-------|----------|
| `PipelineSnapshot` | Add tenantId (tenant-specific dashboards) |
| `TrafficSource` | Add tenantId |
| `GrowthMetric` | Add tenantId |
| `DealsWonMetric` | Add tenantId |
| `SalesPerformance` | Add tenantId |
| `DashboardConfig` | Add tenantId |
| `KPIDefinition` | Review - may be global |
| `ReportDefinition` | Add tenantId |
| `ReportSchedule` | Add tenantId |
| `ReportExecution` | Add tenantId |

### Category 7: LOW PRIORITY - Communication tables

| Model | Decision |
|-------|----------|
| `TeamMessage` | Add tenantId |
| `EmailTemplate` | Add tenantId (tenant-specific templates) |
| `EmailRecord` | Add tenantId |
| `EmailAttachment` | Inherit from EmailRecord |
| `ChatConversation` | Add tenantId |
| `ChatMessage` | Inherit from ChatConversation |
| `CallRecord` | Add tenantId |

### Category 8: LOW PRIORITY - Configuration tables

| Model | Decision |
|-------|----------|
| `WorkflowDefinition` | Add tenantId |
| `WorkflowExecution` | Add tenantId |
| `BusinessRule` | Add tenantId |
| `BusinessRuleExecution` | Add tenantId |
| `RoutingRule` | Add tenantId |
| `TicketCategory` | Add tenantId or keep global |
| `WebhookEndpoint` | Add tenantId |
| `WebhookDelivery` | Add tenantId |
| `APIKey` | Add tenantId |
| `APIUsageRecord` | Add tenantId |

### Category 9: GLOBAL - Intentionally shared tables

These should remain without tenantId:

| Model | Reason |
|-------|--------|
| `Tenant` | Is the tenant itself |
| `Permission` | Global RBAC permission definitions |
| `RBACRole` | Global role definitions |
| `RolePermission` | Global role-permission mappings |
| `APIVersion` | System-wide API versions |
| `HealthCheck` | System monitoring |
| `PerformanceMetric` | System monitoring |
| `AlertIncident` | System alerts |

### Category 10: SPECIAL - SLA Policies

| Model | Decision |
|-------|----------|
| `SLAPolicy` | Add `tenantId` (nullable) - null = global default, set = tenant-specific |

## Migration Strategy

### Phase 1: Schema Changes (Non-breaking)

Add nullable `tenantId` columns to all tables identified above:

```sql
-- Example for LeadActivity
ALTER TABLE lead_activities ADD COLUMN tenant_id TEXT;
```

### Phase 2: Backfill Data

Run backfill queries to populate `tenantId` from parent relationships:

```sql
-- LeadActivity: Get tenantId from Lead
UPDATE lead_activities la
SET tenant_id = l.tenant_id
FROM leads l
WHERE la.lead_id = l.id AND la.tenant_id IS NULL;

-- ContactActivity: Get tenantId from Contact
UPDATE contact_activities ca
SET tenant_id = c.tenant_id
FROM contacts c
WHERE ca.contact_id = c.id AND ca.tenant_id IS NULL;

-- DealProduct: Get tenantId from Opportunity
UPDATE deal_products dp
SET tenant_id = o.tenant_id
FROM opportunities o
WHERE dp.opportunity_id = o.id AND dp.tenant_id IS NULL;

-- SLANotification: Get tenantId from Ticket
UPDATE sla_notifications sn
SET tenant_id = t.tenant_id
FROM tickets t
WHERE sn.ticket_id = t.id AND sn.tenant_id IS NULL;

-- MessageRecord: Get tenantId from ConversationRecord
UPDATE message_records mr
SET tenant_id = cr.tenant_id
FROM conversation_records cr
WHERE mr.conversation_id = cr.id AND mr.tenant_id IS NULL;
```

### Phase 3: Make Columns Non-nullable

After verification, make `tenantId` required:

```sql
ALTER TABLE lead_activities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lead_activities ADD CONSTRAINT fk_lead_activities_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
```

### Phase 4: Add Indexes

Create indexes for query performance:

```sql
CREATE INDEX idx_lead_activities_tenant_id ON lead_activities(tenant_id);
CREATE INDEX idx_contact_activities_tenant_id ON contact_activities(tenant_id);
CREATE INDEX idx_deal_products_tenant_id ON deal_products(tenant_id);
-- ... etc
```

### Phase 5: Enable RLS Policies

Create RLS policies for each table:

```sql
-- Enable RLS
ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;

-- Create policy
CREATE POLICY tenant_isolation_lead_activities ON lead_activities
  USING (tenant_id = current_setting('app.current_tenant_id')::text);

-- Repeat for all tables...
```

### Phase 6: Update Prisma Schema

Add `tenantId` field to all Prisma models:

```prisma
model LeadActivity {
  // ... existing fields
  tenantId    String
  tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
}
```

### Phase 7: Update Application Code

1. Update all `create` operations to include `tenantId`
2. Update seed files to pass `tenantId` to affected functions
3. Update queries to filter by `tenantId` where not using Prisma middleware

## Implementation SQL

### Complete Migration File

```sql
-- Migration: 20260203_normalize_tenant_ids
-- Purpose: Add tenantId to all tenant-scoped tables per ADR-004

-- =====================================================
-- PHASE 1: ADD NULLABLE COLUMNS
-- =====================================================

-- Lead-related tables
ALTER TABLE lead_activities ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE lead_files ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE lead_ai_insights ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE ai_scores ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Contact-related tables
ALTER TABLE contact_activities ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE contact_ai_insights ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Opportunity-related tables
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE deal_files ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Ticket-related tables
ALTER TABLE sla_notifications ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE ticket_attachments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE ticket_next_steps ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE related_tickets ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE ticket_ai_insights ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE sla_breaches ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE escalation_history ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE routing_audits ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Conversation-related tables
ALTER TABLE message_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE tool_call_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Appointment-related tables
ALTER TABLE appointment_attendees ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE appointment_cases ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Document tables
ALTER TABLE documents ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE document_access_logs ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE document_shares ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Analytics tables
ALTER TABLE pipeline_snapshots ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE traffic_sources ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE growth_metrics ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE deals_won_metrics ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE sales_performance ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Communication tables
ALTER TABLE team_messages ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE email_templates ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE email_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE email_attachments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE call_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Configuration tables
ALTER TABLE workflow_definitions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE workflow_executions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE business_rules ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE business_rule_executions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE routing_rules ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE ticket_categories ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE api_usage_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Dashboard tables
ALTER TABLE dashboard_configs ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE report_definitions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE report_schedules ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE report_executions ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Feedback tables
ALTER TABLE feedback_surveys ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE account_health_scores ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Agent tables
ALTER TABLE agent_skills ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE agent_availability ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- AI tables
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Case documents
ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE case_document_acls ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE case_document_audits ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- =====================================================
-- PHASE 2: BACKFILL FROM PARENT RELATIONSHIPS
-- =====================================================

-- Lead-related backfill
UPDATE lead_activities SET tenant_id = (SELECT tenant_id FROM leads WHERE leads.id = lead_activities.lead_id) WHERE tenant_id IS NULL;
UPDATE lead_files SET tenant_id = (SELECT tenant_id FROM leads WHERE leads.id = lead_files.lead_id) WHERE tenant_id IS NULL;
UPDATE lead_ai_insights SET tenant_id = (SELECT tenant_id FROM leads WHERE leads.id = lead_ai_insights.lead_id) WHERE tenant_id IS NULL;
UPDATE ai_scores SET tenant_id = (SELECT tenant_id FROM leads WHERE leads.id = ai_scores.lead_id) WHERE tenant_id IS NULL;

-- Contact-related backfill
UPDATE contact_activities SET tenant_id = (SELECT tenant_id FROM contacts WHERE contacts.id = contact_activities.contact_id) WHERE tenant_id IS NULL;
UPDATE contact_ai_insights SET tenant_id = (SELECT tenant_id FROM contacts WHERE contacts.id = contact_ai_insights.contact_id) WHERE tenant_id IS NULL;

-- Opportunity-related backfill
UPDATE deal_products SET tenant_id = (SELECT tenant_id FROM opportunities WHERE opportunities.id = deal_products.opportunity_id) WHERE tenant_id IS NULL;
UPDATE deal_files SET tenant_id = (SELECT tenant_id FROM opportunities WHERE opportunities.id = deal_files.opportunity_id) WHERE tenant_id IS NULL;
UPDATE activity_events SET tenant_id = (SELECT tenant_id FROM opportunities WHERE opportunities.id = activity_events.opportunity_id) WHERE activity_events.opportunity_id IS NOT NULL AND tenant_id IS NULL;

-- Ticket-related backfill
UPDATE sla_notifications SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = sla_notifications.ticket_id) WHERE tenant_id IS NULL;
UPDATE ticket_attachments SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = ticket_attachments.ticket_id) WHERE tenant_id IS NULL;
UPDATE ticket_next_steps SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = ticket_next_steps.ticket_id) WHERE tenant_id IS NULL;
UPDATE related_tickets SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = related_tickets.ticket_id) WHERE tenant_id IS NULL;
UPDATE ticket_ai_insights SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = ticket_ai_insights.ticket_id) WHERE tenant_id IS NULL;
UPDATE sla_breaches SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = sla_breaches.ticket_id) WHERE tenant_id IS NULL;
UPDATE escalation_history SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = escalation_history.ticket_id) WHERE tenant_id IS NULL;
UPDATE routing_audits SET tenant_id = (SELECT tenant_id FROM tickets WHERE tickets.id = routing_audits.ticket_id) WHERE tenant_id IS NULL;

-- Conversation-related backfill
UPDATE message_records SET tenant_id = (SELECT tenant_id FROM conversation_records WHERE conversation_records.id = message_records.conversation_id) WHERE tenant_id IS NULL;
UPDATE tool_call_records SET tenant_id = (SELECT tenant_id FROM conversation_records WHERE conversation_records.id = tool_call_records.conversation_id) WHERE tenant_id IS NULL;

-- Appointment-related backfill
UPDATE appointment_attendees SET tenant_id = (SELECT tenant_id FROM appointments WHERE appointments.id = appointment_attendees.appointment_id) WHERE tenant_id IS NULL;
UPDATE appointment_cases SET tenant_id = (SELECT tenant_id FROM appointments WHERE appointments.id = appointment_cases.appointment_id) WHERE tenant_id IS NULL;

-- For standalone tables with no parent, use a default tenant
-- (Run this only after identifying the default tenant ID)
-- UPDATE documents SET tenant_id = 'default-tenant-id' WHERE tenant_id IS NULL;

-- =====================================================
-- PHASE 3: ADD CONSTRAINTS (run after backfill verified)
-- =====================================================

-- Example for lead_activities (repeat pattern for all tables)
-- ALTER TABLE lead_activities ALTER COLUMN tenant_id SET NOT NULL;
-- ALTER TABLE lead_activities ADD CONSTRAINT fk_lead_activities_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- =====================================================
-- PHASE 4: CREATE INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_lead_activities_tenant ON lead_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_files_tenant ON lead_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lead_ai_insights_tenant ON lead_ai_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_scores_tenant ON ai_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_activities_tenant ON contact_activities(tenant_id);
CREATE INDEX IF NOT EXISTS idx_contact_ai_insights_tenant ON contact_ai_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deal_products_tenant ON deal_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_deal_files_tenant ON deal_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_tenant ON activity_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sla_notifications_tenant ON sla_notifications(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_tenant ON ticket_attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_message_records_tenant ON message_records(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tool_call_records_tenant ON tool_call_records(tenant_id);
-- ... continue for all tables

-- =====================================================
-- PHASE 5: ENABLE RLS (run in production carefully)
-- =====================================================

-- Enable RLS on all tenant-scoped tables
-- ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY tenant_isolation ON lead_activities USING (tenant_id = current_setting('app.current_tenant_id')::text);
-- ... repeat for all tables
```

## Prisma Schema Changes

See accompanying file: `packages/db/prisma/migrations/20260203_normalize_tenant_ids/schema-changes.prisma`

## Verification Queries

After migration, run these queries to verify no orphaned records:

```sql
-- Check for records without tenant_id
SELECT 'lead_activities' as table_name, COUNT(*) as orphaned FROM lead_activities WHERE tenant_id IS NULL
UNION ALL
SELECT 'contact_activities', COUNT(*) FROM contact_activities WHERE tenant_id IS NULL
UNION ALL
SELECT 'deal_products', COUNT(*) FROM deal_products WHERE tenant_id IS NULL
-- ... etc
```

## Rollback Plan

If issues arise:

1. **Disable RLS** (if enabled): `ALTER TABLE <table> DISABLE ROW LEVEL SECURITY;`
2. **Drop constraints**: `ALTER TABLE <table> DROP CONSTRAINT IF EXISTS fk_<table>_tenant;`
3. **Make nullable**: `ALTER TABLE <table> ALTER COLUMN tenant_id DROP NOT NULL;`
4. **Keep data**: Do NOT drop the `tenant_id` column - investigate and fix

## Timeline

| Phase | Duration | Risk |
|-------|----------|------|
| Phase 1: Add columns | 5 minutes | LOW |
| Phase 2: Backfill | 30 minutes | LOW |
| Phase 3: Add constraints | 10 minutes | MEDIUM |
| Phase 4: Add indexes | 15 minutes | LOW |
| Phase 5: Enable RLS | 30 minutes | HIGH |
| Phase 6: Update Prisma | 2 hours | MEDIUM |
| Phase 7: Update code | 4 hours | MEDIUM |

**Total: ~8 hours**

## Testing Requirements

1. **Unit Tests**: Update all seed files to include `tenantId`
2. **Integration Tests**: Verify RLS policies prevent cross-tenant access
3. **Security Tests**: Attempt SQL injection to bypass RLS
4. **Performance Tests**: Verify query performance with new indexes

## Links

- [ADR-004: Multi-tenancy Architecture](./ADR-004-multi-tenancy.md)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
