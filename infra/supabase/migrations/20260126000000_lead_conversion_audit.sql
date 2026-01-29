-- Lead Conversion Audit Table
-- FLOW-006: Lead to Contact Conversion Logic
-- Task: IFC-061
--
-- Tracks lead-to-contact conversions for audit purposes.
-- Includes idempotency support and complete conversion snapshot.

-- Create the lead_conversion_audit table
CREATE TABLE IF NOT EXISTS lead_conversion_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  account_id UUID,
  tenant_id UUID NOT NULL,
  converted_by TEXT NOT NULL,
  conversion_snapshot JSONB NOT NULL,
  idempotency_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure a lead can only be converted once per tenant
  CONSTRAINT unique_lead_conversion UNIQUE (lead_id, tenant_id)
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_conversion_audit_lead ON lead_conversion_audit(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversion_audit_tenant ON lead_conversion_audit(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversion_audit_idempotency ON lead_conversion_audit(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_conversion_audit_created ON lead_conversion_audit(created_at);

-- Row Level Security
ALTER TABLE lead_conversion_audit ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see conversions for their tenant
CREATE POLICY "tenant_isolation" ON lead_conversion_audit
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Policy: Service role can do anything
CREATE POLICY "service_role_all" ON lead_conversion_audit
  FOR ALL
  TO service_role
  USING (true);

-- Comment on table
COMMENT ON TABLE lead_conversion_audit IS 'Audit trail for lead-to-contact conversions (FLOW-006, IFC-061)';
COMMENT ON COLUMN lead_conversion_audit.conversion_snapshot IS 'Complete snapshot of lead data at conversion time (JSONB)';
COMMENT ON COLUMN lead_conversion_audit.idempotency_key IS 'Unique key to prevent duplicate conversions during retries';

-- TTL policy: 90-day retention (run daily at 3 AM)
-- Note: Requires pg_cron extension to be enabled
-- SELECT cron.schedule('cleanup-conversion-audit', '0 3 * * *', $$
--   DELETE FROM lead_conversion_audit WHERE created_at < NOW() - INTERVAL '90 days';
-- $$);
