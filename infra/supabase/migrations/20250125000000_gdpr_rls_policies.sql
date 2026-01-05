-- GDPR-Specific RLS Extensions - IFC-058
-- Implements privacy by design and data minimization principles
--
-- Key GDPR Requirements:
-- - Data minimization (only collect/retain necessary data)
-- - Right to erasure (soft delete with anonymization)
-- - Right to access (DSAR support)
-- - Purpose limitation (audit data usage)
-- - Storage limitation (automated retention)

-- ============================================
-- GDPR METADATA TABLE
-- ============================================

-- Track GDPR-specific metadata for all personal data
CREATE TABLE IF NOT EXISTS gdpr_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  data_classification VARCHAR(50) NOT NULL CHECK (data_classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PRIVILEGED')),
  legal_basis VARCHAR(100) NOT NULL CHECK (legal_basis IN ('consent', 'contract', 'legal_obligation', 'vital_interests', 'public_task', 'legitimate_interests')),
  purpose TEXT NOT NULL,
  retention_period INTERVAL,
  deletion_scheduled_at TIMESTAMPTZ,
  anonymized_at TIMESTAMPTZ,
  subject_id UUID, -- Data subject (user)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Composite index for queries
  UNIQUE(table_name, record_id)
);

CREATE INDEX idx_gdpr_metadata_deletion_schedule ON gdpr_metadata(deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;
CREATE INDEX idx_gdpr_metadata_subject ON gdpr_metadata(subject_id);

-- Enable RLS on GDPR metadata
ALTER TABLE gdpr_metadata ENABLE ROW LEVEL SECURITY;

-- Only admins and DPO can view GDPR metadata
CREATE POLICY "gdpr_metadata_admin_only"
  ON gdpr_metadata
  FOR ALL
  USING (auth.is_admin());

-- ============================================
-- DATA SUBJECT ACCESS REQUEST (DSAR) TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS data_subject_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('access', 'erasure', 'rectification', 'portability', 'restriction', 'objection')),
  subject_id UUID NOT NULL,
  subject_email VARCHAR(255) NOT NULL,
  verification_token VARCHAR(255),
  verified_at TIMESTAMPTZ,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'processing', 'completed', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  data_export_url TEXT, -- S3/storage URL for data export
  notes TEXT,
  assigned_to UUID REFERENCES users(id),

  -- GDPR requires response within 30 days
  sla_deadline TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dsar_subject ON data_subject_requests(subject_id);
CREATE INDEX idx_dsar_status ON data_subject_requests(status);
CREATE INDEX idx_dsar_sla ON data_subject_requests(sla_deadline) WHERE status NOT IN ('completed', 'rejected');

ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own DSAR requests
CREATE POLICY "dsar_select_own"
  ON data_subject_requests
  FOR SELECT
  USING (subject_id = auth.user_id()::uuid OR auth.is_admin());

-- Only admins can manage DSAR requests
CREATE POLICY "dsar_manage_admin"
  ON data_subject_requests
  FOR ALL
  USING (auth.is_admin());

-- ============================================
-- LEGAL HOLD TABLE
-- ============================================

-- Prevents deletion of data under legal hold
CREATE TABLE IF NOT EXISTS legal_holds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_reference VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  hold_reason TEXT NOT NULL,
  placed_by UUID NOT NULL REFERENCES users(id),
  placed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  released_by UUID REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_legal_holds_active ON legal_holds(table_name, record_id) WHERE released_at IS NULL;

ALTER TABLE legal_holds ENABLE ROW LEVEL SECURITY;

-- Only admins and legal team can manage holds
CREATE POLICY "legal_holds_admin_only"
  ON legal_holds
  FOR ALL
  USING (auth.is_admin());

-- ============================================
-- RETENTION POLICY ENFORCEMENT
-- ============================================

-- Function to check if record can be deleted based on retention policy
CREATE OR REPLACE FUNCTION can_delete_record(
  p_table_name VARCHAR,
  p_record_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_legal_hold_exists BOOLEAN;
  v_retention_met BOOLEAN;
BEGIN
  -- Check for active legal hold
  SELECT EXISTS(
    SELECT 1 FROM legal_holds
    WHERE table_name = p_table_name
      AND record_id = p_record_id
      AND released_at IS NULL
  ) INTO v_legal_hold_exists;

  IF v_legal_hold_exists THEN
    RETURN FALSE; -- Cannot delete if under legal hold
  END IF;

  -- Check retention policy
  SELECT (
    deletion_scheduled_at IS NOT NULL
    AND deletion_scheduled_at <= NOW()
  ) INTO v_retention_met
  FROM gdpr_metadata
  WHERE table_name = p_table_name
    AND record_id = p_record_id;

  RETURN COALESCE(v_retention_met, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- DATA MINIMIZATION POLICIES
-- ============================================

-- Add data minimization flags to existing tables
ALTER TABLE leads ADD COLUMN IF NOT EXISTS data_minimized BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS data_minimized BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS data_minimized BOOLEAN DEFAULT FALSE;

-- Add anonymization timestamp
ALTER TABLE leads ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

-- Function to anonymize personal data (right to erasure)
CREATE OR REPLACE FUNCTION anonymize_record(
  p_table_name VARCHAR,
  p_record_id UUID
) RETURNS VOID AS $$
BEGIN
  -- Anonymize based on table
  CASE p_table_name
    WHEN 'leads' THEN
      UPDATE leads SET
        email = 'anonymized-' || id || '@deleted.local',
        first_name = 'Anonymized',
        last_name = 'User',
        phone = NULL,
        company = 'Anonymized Company',
        title = NULL,
        notes = NULL,
        data_minimized = TRUE,
        anonymized_at = NOW()
      WHERE id = p_record_id;

    WHEN 'contacts' THEN
      UPDATE contacts SET
        email = 'anonymized-' || id || '@deleted.local',
        first_name = 'Anonymized',
        last_name = 'User',
        phone = NULL,
        mobile = NULL,
        title = NULL,
        notes = NULL,
        data_minimized = TRUE,
        anonymized_at = NOW()
      WHERE id = p_record_id;

    WHEN 'accounts' THEN
      UPDATE accounts SET
        name = 'Anonymized Account ' || id,
        website = NULL,
        phone = NULL,
        billing_address = NULL,
        shipping_address = NULL,
        notes = NULL,
        data_minimized = TRUE,
        anonymized_at = NOW()
      WHERE id = p_record_id;
  END CASE;

  -- Update GDPR metadata
  UPDATE gdpr_metadata
  SET anonymized_at = NOW()
  WHERE table_name = p_table_name
    AND record_id = p_record_id;

  -- Audit the anonymization
  INSERT INTO audit_logs (
    entity_type,
    entity_id,
    action,
    "userId",
    metadata
  ) VALUES (
    p_table_name,
    p_record_id,
    'ANONYMIZE',
    NULL,
    jsonb_build_object(
      'reason', 'GDPR right to erasure',
      'timestamp', NOW()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- AUTOMATED RETENTION ENFORCEMENT
-- ============================================

-- Function to schedule deletion based on retention policy
CREATE OR REPLACE FUNCTION schedule_deletion_by_retention()
RETURNS VOID AS $$
DECLARE
  v_record RECORD;
BEGIN
  -- PUBLIC data: 7 years retention
  UPDATE gdpr_metadata
  SET deletion_scheduled_at = created_at + INTERVAL '7 years'
  WHERE data_classification = 'PUBLIC'
    AND deletion_scheduled_at IS NULL
    AND anonymized_at IS NULL;

  -- INTERNAL data: 3 years retention
  UPDATE gdpr_metadata
  SET deletion_scheduled_at = created_at + INTERVAL '3 years'
  WHERE data_classification = 'INTERNAL'
    AND deletion_scheduled_at IS NULL
    AND anonymized_at IS NULL;

  -- CONFIDENTIAL data: 10 years retention, manual review required
  UPDATE gdpr_metadata
  SET deletion_scheduled_at = created_at + INTERVAL '10 years'
  WHERE data_classification = 'CONFIDENTIAL'
    AND deletion_scheduled_at IS NULL
    AND anonymized_at IS NULL;

  -- PRIVILEGED data: Permanent, no auto-deletion
  -- These remain indefinitely unless manually deleted

  -- Process scheduled deletions (anonymization)
  FOR v_record IN
    SELECT table_name, record_id
    FROM gdpr_metadata
    WHERE deletion_scheduled_at <= NOW()
      AND anonymized_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM legal_holds
        WHERE table_name = gdpr_metadata.table_name
          AND record_id = gdpr_metadata.record_id
          AND released_at IS NULL
      )
  LOOP
    PERFORM anonymize_record(v_record.table_name, v_record.record_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- GDPR AUDIT TRIGGERS
-- ============================================

-- Trigger to create GDPR metadata on record creation
CREATE OR REPLACE FUNCTION create_gdpr_metadata_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO gdpr_metadata (
    table_name,
    record_id,
    data_classification,
    legal_basis,
    purpose,
    subject_id
  ) VALUES (
    TG_TABLE_NAME,
    NEW.id,
    COALESCE(NEW.data_classification, 'INTERNAL'),
    'legitimate_interests', -- Default, should be set explicitly
    'CRM operation',
    COALESCE(NEW."ownerId", NEW."userId")
  )
  ON CONFLICT (table_name, record_id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to relevant tables
DROP TRIGGER IF EXISTS gdpr_metadata_leads ON leads;
CREATE TRIGGER gdpr_metadata_leads
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION create_gdpr_metadata_trigger();

DROP TRIGGER IF EXISTS gdpr_metadata_contacts ON contacts;
CREATE TRIGGER gdpr_metadata_contacts
  AFTER INSERT ON contacts
  FOR EACH ROW
  EXECUTE FUNCTION create_gdpr_metadata_trigger();

DROP TRIGGER IF EXISTS gdpr_metadata_accounts ON accounts;
CREATE TRIGGER gdpr_metadata_accounts
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION create_gdpr_metadata_trigger();

-- ============================================
-- CONSENT MANAGEMENT
-- ============================================

CREATE TABLE IF NOT EXISTS consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_id UUID NOT NULL,
  purpose VARCHAR(100) NOT NULL, -- 'marketing', 'analytics', 'third_party_sharing', etc.
  given BOOLEAN NOT NULL DEFAULT FALSE,
  given_at TIMESTAMPTZ,
  withdrawn_at TIMESTAMPTZ,
  consent_text TEXT NOT NULL, -- Exact text shown to user
  ip_address INET,
  user_agent TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consents_subject ON consents(subject_id, purpose);

ALTER TABLE consents ENABLE ROW LEVEL SECURITY;

-- Users can view their own consents
CREATE POLICY "consents_select_own"
  ON consents
  FOR SELECT
  USING (subject_id = auth.user_id()::uuid OR auth.is_admin());

-- Users can update their own consents
CREATE POLICY "consents_update_own"
  ON consents
  FOR UPDATE
  USING (subject_id = auth.user_id()::uuid)
  WITH CHECK (subject_id = auth.user_id()::uuid);

-- ============================================
-- REPORTING FUNCTIONS
-- ============================================

-- Function to generate GDPR compliance report
CREATE OR REPLACE FUNCTION gdpr_compliance_report()
RETURNS TABLE (
  metric VARCHAR,
  value BIGINT,
  status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT 'total_records'::VARCHAR, COUNT(*)::BIGINT, 'info'::VARCHAR
  FROM gdpr_metadata;

  RETURN QUERY
  SELECT 'anonymized_records'::VARCHAR, COUNT(*)::BIGINT, 'success'::VARCHAR
  FROM gdpr_metadata WHERE anonymized_at IS NOT NULL;

  RETURN QUERY
  SELECT 'overdue_deletions'::VARCHAR, COUNT(*)::BIGINT,
    CASE WHEN COUNT(*) > 0 THEN 'warning' ELSE 'success' END::VARCHAR
  FROM gdpr_metadata
  WHERE deletion_scheduled_at <= NOW()
    AND anonymized_at IS NULL;

  RETURN QUERY
  SELECT 'active_legal_holds'::VARCHAR, COUNT(*)::BIGINT, 'info'::VARCHAR
  FROM legal_holds WHERE released_at IS NULL;

  RETURN QUERY
  SELECT 'pending_dsar'::VARCHAR, COUNT(*)::BIGINT,
    CASE WHEN COUNT(*) > 5 THEN 'warning' ELSE 'success' END::VARCHAR
  FROM data_subject_requests
  WHERE status IN ('pending', 'verified', 'processing');

  RETURN QUERY
  SELECT 'overdue_dsar'::VARCHAR, COUNT(*)::BIGINT,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'success' END::VARCHAR
  FROM data_subject_requests
  WHERE sla_deadline < NOW()
    AND status NOT IN ('completed', 'rejected');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SCHEDULED JOB SETUP
-- ============================================

-- This should be called daily via cron/scheduler
-- Example: Run at 2 AM daily
-- SELECT cron.schedule('gdpr-retention-enforcement', '0 2 * * *', 'SELECT schedule_deletion_by_retention();');

-- ============================================
-- TESTING FUNCTIONS
-- ============================================

-- Function to verify GDPR compliance for a table
CREATE OR REPLACE FUNCTION test_gdpr_compliance(p_table_name VARCHAR)
RETURNS TABLE (
  test_name VARCHAR,
  passed BOOLEAN,
  details TEXT
) AS $$
BEGIN
  -- Test 1: All records have GDPR metadata
  RETURN QUERY
  SELECT
    'metadata_coverage'::VARCHAR,
    COUNT(*) = (SELECT COUNT(*) FROM pg_catalog.pg_class WHERE relname = p_table_name),
    format('Metadata exists for %s records', COUNT(*))
  FROM gdpr_metadata
  WHERE table_name = p_table_name;

  -- Test 2: Legal basis is always set
  RETURN QUERY
  SELECT
    'legal_basis_set'::VARCHAR,
    COUNT(*) = 0,
    format('%s records missing legal basis', COUNT(*))
  FROM gdpr_metadata
  WHERE table_name = p_table_name
    AND legal_basis IS NULL;

  -- Test 3: No overdue anonymizations without legal hold
  RETURN QUERY
  SELECT
    'no_overdue_deletions'::VARCHAR,
    COUNT(*) = 0,
    format('%s overdue anonymizations', COUNT(*))
  FROM gdpr_metadata g
  WHERE g.table_name = p_table_name
    AND g.deletion_scheduled_at <= NOW()
    AND g.anonymized_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM legal_holds lh
      WHERE lh.table_name = g.table_name
        AND lh.record_id = g.record_id
        AND lh.released_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
