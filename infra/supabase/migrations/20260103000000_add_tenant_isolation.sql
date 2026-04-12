-- ============================================
-- TENANT ISOLATION MIGRATION (IFC-127 Phase 2)
-- Adds tenantId to 25+ tables for complete tenant isolation
--
-- IMPORTANT: Run during maintenance window
-- Estimated duration: 5-15 minutes depending on data volume
-- ============================================

BEGIN;

-- ============================================
-- 1. DOMAIN EVENTS
-- ============================================
ALTER TABLE domain_events ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE domain_events de SET tenant_id = COALESCE(
  (SELECT tenant_id FROM leads WHERE id = de.aggregate_id AND de.aggregate_type = 'Lead'),
  (SELECT tenant_id FROM contacts WHERE id = de.aggregate_id AND de.aggregate_type = 'Contact'),
  (SELECT tenant_id FROM opportunities WHERE id = de.aggregate_id AND de.aggregate_type = 'Opportunity'),
  (SELECT tenant_id FROM accounts WHERE id = de.aggregate_id AND de.aggregate_type = 'Account'),
  (SELECT tenant_id FROM tasks WHERE id = de.aggregate_id AND de.aggregate_type = 'Task'),
  (SELECT tenant_id FROM tickets WHERE id = de.aggregate_id AND de.aggregate_type = 'Ticket'),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE domain_events ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_domain_events_tenant ON domain_events(tenant_id);

-- ============================================
-- 2. SECURITY EVENTS
-- ============================================
ALTER TABLE security_events ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE security_events se SET tenant_id = COALESCE(
  (SELECT tenant_id FROM users WHERE id = se.actor_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE security_events ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON security_events(tenant_id);

-- ============================================
-- 3. APPOINTMENTS
-- ============================================
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE appointments a SET tenant_id = COALESCE(
  (SELECT tenant_id FROM users WHERE id = a.organizer_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE appointments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id);

-- ============================================
-- 4. APPOINTMENT ATTENDEES
-- ============================================
ALTER TABLE appointment_attendees ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE appointment_attendees aa SET tenant_id = COALESCE(
  (SELECT tenant_id FROM appointments WHERE id = aa.appointment_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE appointment_attendees ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_attendees_tenant ON appointment_attendees(tenant_id);

-- ============================================
-- 5. APPOINTMENT CASES
-- ============================================
ALTER TABLE appointment_cases ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE appointment_cases ac SET tenant_id = COALESCE(
  (SELECT tenant_id FROM appointments WHERE id = ac.appointment_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE appointment_cases ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_cases_tenant ON appointment_cases(tenant_id);

-- ============================================
-- 6. DEAL PRODUCTS
-- ============================================
ALTER TABLE deal_products ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE deal_products dp SET tenant_id = COALESCE(
  (SELECT tenant_id FROM opportunities WHERE id = dp.opportunity_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE deal_products ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_products_tenant ON deal_products(tenant_id);

-- ============================================
-- 7. DEAL FILES
-- ============================================
ALTER TABLE deal_files ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE deal_files df SET tenant_id = COALESCE(
  (SELECT tenant_id FROM opportunities WHERE id = df.opportunity_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE deal_files ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deal_files_tenant ON deal_files(tenant_id);

-- ============================================
-- 8. ACTIVITY EVENTS
-- ============================================
ALTER TABLE activity_events ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE activity_events ae SET tenant_id = COALESCE(
  (SELECT tenant_id FROM opportunities WHERE id = ae.opportunity_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE activity_events ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activity_events_tenant ON activity_events(tenant_id);

-- ============================================
-- 9. AGENT ACTIONS
-- ============================================
ALTER TABLE agent_actions ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE agent_actions aa SET tenant_id = COALESCE(
  (SELECT tenant_id FROM users WHERE id = aa.created_by),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE agent_actions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_actions_tenant ON agent_actions(tenant_id);

-- ============================================
-- 10. CONTACT ACTIVITIES
-- ============================================
ALTER TABLE contact_activities ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE contact_activities ca SET tenant_id = COALESCE(
  (SELECT tenant_id FROM contacts WHERE id = ca.contact_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE contact_activities ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_activities_tenant ON contact_activities(tenant_id);

-- ============================================
-- 11. CHAIN VERSION AUDITS
-- ============================================
ALTER TABLE chain_version_audits ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE chain_version_audits cva SET tenant_id = COALESCE(
  (SELECT tenant_id FROM chain_versions WHERE id = cva.version_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE chain_version_audits ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chain_version_audits_tenant ON chain_version_audits(tenant_id);

-- ============================================
-- 12. ROLE PERMISSIONS
-- ============================================
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE role_permissions rp SET tenant_id = COALESCE(
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE role_permissions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_role_permissions_tenant ON role_permissions(tenant_id);

-- ============================================
-- 13. USER ROLE ASSIGNMENTS
-- ============================================
ALTER TABLE user_role_assignments ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE user_role_assignments ura SET tenant_id = COALESCE(
  (SELECT tenant_id FROM users WHERE id = ura.user_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE user_role_assignments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_role_assignments_tenant ON user_role_assignments(tenant_id);

-- ============================================
-- 14. USER PERMISSIONS
-- ============================================
ALTER TABLE user_permissions ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE user_permissions up SET tenant_id = COALESCE(
  (SELECT tenant_id FROM users WHERE id = up.user_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE user_permissions ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_permissions_tenant ON user_permissions(tenant_id);

-- ============================================
-- 15. CONTACT NOTES
-- ============================================
ALTER TABLE contact_notes ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE contact_notes cn SET tenant_id = COALESCE(
  (SELECT tenant_id FROM contacts WHERE id = cn.contact_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE contact_notes ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_notes_tenant ON contact_notes(tenant_id);

-- ============================================
-- 16. CONTACT AI INSIGHTS
-- ============================================
ALTER TABLE contact_ai_insights ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE contact_ai_insights cai SET tenant_id = COALESCE(
  (SELECT tenant_id FROM contacts WHERE id = cai.contact_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE contact_ai_insights ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_ai_insights_tenant ON contact_ai_insights(tenant_id);

-- ============================================
-- 17. WEBHOOK ENDPOINTS
-- ============================================
ALTER TABLE webhook_endpoints ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE webhook_endpoints we SET tenant_id = COALESCE(
  (SELECT tenant_id FROM users WHERE id = we.created_by),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE webhook_endpoints ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_tenant ON webhook_endpoints(tenant_id);

-- ============================================
-- 18. WEBHOOK DELIVERIES
-- ============================================
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE webhook_deliveries wd SET tenant_id = COALESCE(
  (SELECT tenant_id FROM webhook_endpoints WHERE id = wd.endpoint_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE webhook_deliveries ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_tenant ON webhook_deliveries(tenant_id);

-- ============================================
-- 19. API KEYS
-- ============================================
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE api_keys ak SET tenant_id = COALESCE(
  (SELECT tenant_id FROM users WHERE id = ak.user_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE api_keys ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

-- ============================================
-- 20. API USAGE RECORDS
-- ============================================
ALTER TABLE api_usage_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE api_usage_records aur SET tenant_id = COALESCE(
  (SELECT tenant_id FROM api_keys WHERE id = aur.api_key_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE api_usage_records ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_api_usage_records_tenant ON api_usage_records(tenant_id);

-- ============================================
-- 21. AI SCORES
-- ============================================
ALTER TABLE ai_scores ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE ai_scores ais SET tenant_id = COALESCE(
  (SELECT tenant_id FROM leads WHERE id = ais.lead_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE ai_scores ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_scores_tenant ON ai_scores(tenant_id);

-- ============================================
-- 22. SLA POLICIES
-- ============================================
ALTER TABLE sla_policies ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE sla_policies sp SET tenant_id = COALESCE(
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE sla_policies ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sla_policies_tenant ON sla_policies(tenant_id);

-- ============================================
-- 23. SLA NOTIFICATIONS
-- ============================================
ALTER TABLE sla_notifications ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE sla_notifications sn SET tenant_id = COALESCE(
  (SELECT tenant_id FROM tickets WHERE id = sn.ticket_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE sla_notifications ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sla_notifications_tenant ON sla_notifications(tenant_id);

-- ============================================
-- 24. TICKET ACTIVITIES
-- ============================================
ALTER TABLE ticket_activities ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE ticket_activities ta SET tenant_id = COALESCE(
  (SELECT tenant_id FROM tickets WHERE id = ta.ticket_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE ticket_activities ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_activities_tenant ON ticket_activities(tenant_id);

-- ============================================
-- 25. TICKET ATTACHMENTS
-- ============================================
ALTER TABLE ticket_attachments ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE ticket_attachments ta SET tenant_id = COALESCE(
  (SELECT tenant_id FROM tickets WHERE id = ta.ticket_id),
  (SELECT id FROM tenants WHERE slug = 'default' LIMIT 1)
) WHERE tenant_id IS NULL;

ALTER TABLE ticket_attachments ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_tenant ON ticket_attachments(tenant_id);

-- ============================================
-- ADD FOREIGN KEY CONSTRAINTS
-- ============================================

-- Note: Adding foreign keys after data migration to avoid constraint violations
ALTER TABLE domain_events ADD CONSTRAINT fk_domain_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE security_events ADD CONSTRAINT fk_security_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE appointments ADD CONSTRAINT fk_appointments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE appointment_attendees ADD CONSTRAINT fk_appointment_attendees_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE appointment_cases ADD CONSTRAINT fk_appointment_cases_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE deal_products ADD CONSTRAINT fk_deal_products_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE deal_files ADD CONSTRAINT fk_deal_files_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE activity_events ADD CONSTRAINT fk_activity_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE agent_actions ADD CONSTRAINT fk_agent_actions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE contact_activities ADD CONSTRAINT fk_contact_activities_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE chain_version_audits ADD CONSTRAINT fk_chain_version_audits_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE role_permissions ADD CONSTRAINT fk_role_permissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE user_role_assignments ADD CONSTRAINT fk_user_role_assignments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE user_permissions ADD CONSTRAINT fk_user_permissions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE contact_notes ADD CONSTRAINT fk_contact_notes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE contact_ai_insights ADD CONSTRAINT fk_contact_ai_insights_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE webhook_endpoints ADD CONSTRAINT fk_webhook_endpoints_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE webhook_deliveries ADD CONSTRAINT fk_webhook_deliveries_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE api_keys ADD CONSTRAINT fk_api_keys_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE api_usage_records ADD CONSTRAINT fk_api_usage_records_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE ai_scores ADD CONSTRAINT fk_ai_scores_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sla_policies ADD CONSTRAINT fk_sla_policies_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE sla_notifications ADD CONSTRAINT fk_sla_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE ticket_activities ADD CONSTRAINT fk_ticket_activities_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
ALTER TABLE ticket_attachments ADD CONSTRAINT fk_ticket_attachments_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (run manually after migration)
-- ============================================
--
-- Check for any NULL tenant_ids:
-- SELECT 'domain_events' as table_name, COUNT(*) as null_count FROM domain_events WHERE tenant_id IS NULL
-- UNION ALL
-- SELECT 'security_events', COUNT(*) FROM security_events WHERE tenant_id IS NULL
-- UNION ALL
-- ... (repeat for all tables)
--
-- Verify indexes exist:
-- SELECT indexname FROM pg_indexes WHERE tablename IN ('domain_events', 'security_events', ...) AND indexname LIKE '%tenant%';
