-- Migration: Consolidate AuditLog into AuditLogEntry
-- Per ADR-008, we consolidate to a single comprehensive audit table

-- Step 1: Migrate existing data from audit_logs to audit_log_entries
INSERT INTO audit_log_entries (
  id,
  tenant_id,
  event_type,
  event_version,
  event_id,
  timestamp,
  actor_type,
  actor_id,
  resource_type,
  resource_id,
  action,
  before_state,
  after_state,
  ip_address,
  user_agent,
  data_classification,
  permission_granted
)
SELECT
  id,
  tenant_id,
  action AS event_type,  -- Map action string to event_type
  'v1' AS event_version,
  gen_random_uuid()::text AS event_id,
  created_at AS timestamp,
  'USER' AS actor_type,
  user_id AS actor_id,
  entity_type AS resource_type,
  entity_id AS resource_id,
  CASE
    WHEN UPPER(action) = 'CREATE' THEN 'CREATE'
    WHEN UPPER(action) = 'UPDATE' THEN 'UPDATE'
    WHEN UPPER(action) = 'DELETE' THEN 'DELETE'
    WHEN UPPER(action) = 'READ' THEN 'READ'
    ELSE 'READ'
  END AS action,
  old_value AS before_state,
  new_value AS after_state,
  ip_address,
  user_agent,
  'INTERNAL' AS data_classification,
  true AS permission_granted
FROM audit_logs
WHERE NOT EXISTS (
  SELECT 1 FROM audit_log_entries WHERE audit_log_entries.id = audit_logs.id
);

-- Step 2: Drop the old audit_logs table
DROP TABLE IF EXISTS audit_logs;
