-- Case Document Migration - IFC-152
-- Implements document versioning, ACL, audit trails, and e-signature support

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Case Documents Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_documents (
  -- Identity
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,

  -- Versioning
  version_major INTEGER NOT NULL DEFAULT 1,
  version_minor INTEGER NOT NULL DEFAULT 0,
  version_patch INTEGER NOT NULL DEFAULT 0,
  parent_version_id UUID REFERENCES case_documents(id) ON DELETE SET NULL,
  is_latest_version BOOLEAN NOT NULL DEFAULT TRUE,

  -- Status
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  CHECK (status IN ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SIGNED', 'ARCHIVED', 'SUPERSEDED')),

  -- Metadata
  title VARCHAR(255) NOT NULL,
  description TEXT,
  document_type VARCHAR(50) NOT NULL,
  CHECK (document_type IN ('CONTRACT', 'AGREEMENT', 'EVIDENCE', 'CORRESPONDENCE', 'COURT_FILING', 'MEMO', 'REPORT', 'OTHER')),
  classification VARCHAR(50) NOT NULL DEFAULT 'INTERNAL',
  CHECK (classification IN ('PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'PRIVILEGED')),
  tags TEXT[] DEFAULT '{}',

  -- Relationships
  related_case_id UUID,
  related_contact_id UUID,

  -- Storage
  storage_key VARCHAR(500) NOT NULL,
  content_hash CHAR(64) NOT NULL, -- SHA-256 hash
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT NOT NULL,
  CHECK (size_bytes > 0),

  -- E-Signature
  signed_by UUID,
  signed_at TIMESTAMPTZ,
  signature_hash CHAR(64),
  signature_ip_address INET,
  signature_user_agent TEXT,

  -- Audit
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- GDPR & Legal Hold
  retention_until TIMESTAMPTZ, -- Legal hold or retention policy end date
  deleted_at TIMESTAMPTZ, -- Soft delete

  -- Constraints
  UNIQUE (tenant_id, id),
  CHECK (
    (signed_by IS NULL AND signed_at IS NULL AND signature_hash IS NULL) OR
    (signed_by IS NOT NULL AND signed_at IS NOT NULL AND signature_hash IS NOT NULL)
  )
);

-- ============================================================================
-- Access Control List (ACL) Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_document_acl (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,

  -- Principal (user, role, or tenant)
  principal_id UUID NOT NULL,
  principal_type VARCHAR(20) NOT NULL CHECK (principal_type IN ('USER', 'ROLE', 'TENANT')),

  -- Access level
  access_level VARCHAR(20) NOT NULL DEFAULT 'VIEW',
  CHECK (access_level IN ('NONE', 'VIEW', 'COMMENT', 'EDIT', 'ADMIN')),

  -- Grant metadata
  granted_by UUID NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,

  -- Constraints
  UNIQUE (document_id, principal_id),
  CHECK (expires_at IS NULL OR expires_at > granted_at)
);

-- ============================================================================
-- Document Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_document_audit (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,

  -- Event details
  event_type VARCHAR(50) NOT NULL,
  CHECK (event_type IN (
    'CREATED', 'UPDATED', 'VERSIONED', 'ACCESS_GRANTED', 'ACCESS_REVOKED',
    'SUBMITTED_FOR_REVIEW', 'APPROVED', 'REJECTED', 'SIGNED', 'ARCHIVED',
    'DELETED', 'LEGAL_HOLD_PLACED', 'LEGAL_HOLD_RELEASED'
  )),

  -- Actor
  user_id UUID NOT NULL,
  ip_address INET,
  user_agent TEXT,

  -- Change details
  changes JSONB, -- Before/after values for updates
  metadata JSONB, -- Additional event-specific data

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Primary lookups
CREATE INDEX idx_case_documents_tenant ON case_documents(tenant_id);
CREATE INDEX idx_case_documents_status ON case_documents(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_case_documents_latest_version ON case_documents(is_latest_version) WHERE is_latest_version = TRUE;
CREATE INDEX idx_case_documents_parent_version ON case_documents(parent_version_id) WHERE parent_version_id IS NOT NULL;

-- Relationship lookups
CREATE INDEX idx_case_documents_case ON case_documents(related_case_id) WHERE related_case_id IS NOT NULL;
CREATE INDEX idx_case_documents_contact ON case_documents(related_contact_id) WHERE related_contact_id IS NOT NULL;

-- Classification & retention
CREATE INDEX idx_case_documents_classification ON case_documents(classification);
CREATE INDEX idx_case_documents_retention ON case_documents(retention_until) WHERE retention_until IS NOT NULL;
CREATE INDEX idx_case_documents_deleted ON case_documents(deleted_at) WHERE deleted_at IS NOT NULL;

-- Full-text search on title
CREATE INDEX idx_case_documents_title_search ON case_documents USING GIN (to_tsvector('english', title));

-- ACL lookups
CREATE INDEX idx_case_document_acl_document ON case_document_acl(document_id);
CREATE INDEX idx_case_document_acl_principal ON case_document_acl(principal_id);
CREATE INDEX idx_case_document_acl_expires ON case_document_acl(expires_at) WHERE expires_at IS NOT NULL;

-- Audit log lookups
CREATE INDEX idx_case_document_audit_document ON case_document_audit(document_id);
CREATE INDEX idx_case_document_audit_user ON case_document_audit(user_id);
CREATE INDEX idx_case_document_audit_created ON case_document_audit(created_at DESC);
CREATE INDEX idx_case_document_audit_event_type ON case_document_audit(event_type);

-- ============================================================================
-- Triggers for Audit Trail
-- ============================================================================

-- Function to automatically log document changes
CREATE OR REPLACE FUNCTION audit_case_document_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO case_document_audit (
      document_id, tenant_id, event_type, user_id, metadata
    ) VALUES (
      NEW.id,
      NEW.tenant_id,
      'CREATED',
      NEW.created_by,
      jsonb_build_object(
        'title', NEW.title,
        'document_type', NEW.document_type,
        'classification', NEW.classification,
        'version', NEW.version_major || '.' || NEW.version_minor || '.' || NEW.version_patch
      )
    );

  ELSIF (TG_OP = 'UPDATE') THEN
    -- Log status changes
    IF (OLD.status IS DISTINCT FROM NEW.status) THEN
      INSERT INTO case_document_audit (
        document_id, tenant_id, event_type, user_id, changes
      ) VALUES (
        NEW.id,
        NEW.tenant_id,
        CASE NEW.status
          WHEN 'UNDER_REVIEW' THEN 'SUBMITTED_FOR_REVIEW'
          WHEN 'APPROVED' THEN 'APPROVED'
          WHEN 'SIGNED' THEN 'SIGNED'
          WHEN 'ARCHIVED' THEN 'ARCHIVED'
          ELSE 'UPDATED'
        END,
        NEW.updated_by,
        jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status)
      );
    END IF;

    -- Log retention changes
    IF (OLD.retention_until IS DISTINCT FROM NEW.retention_until) THEN
      IF (NEW.retention_until IS NOT NULL) THEN
        INSERT INTO case_document_audit (
          document_id, tenant_id, event_type, user_id, metadata
        ) VALUES (
          NEW.id,
          NEW.tenant_id,
          'LEGAL_HOLD_PLACED',
          NEW.updated_by,
          jsonb_build_object('retention_until', NEW.retention_until)
        );
      ELSE
        INSERT INTO case_document_audit (
          document_id, tenant_id, event_type, user_id, metadata
        ) VALUES (
          NEW.id,
          NEW.tenant_id,
          'LEGAL_HOLD_RELEASED',
          NEW.updated_by,
          jsonb_build_object('previous_retention_until', OLD.retention_until)
        );
      END IF;
    END IF;

    -- Log soft delete
    IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) THEN
      INSERT INTO case_document_audit (
        document_id, tenant_id, event_type, user_id, metadata
      ) VALUES (
        NEW.id,
        NEW.tenant_id,
        'DELETED',
        NEW.updated_by,
        jsonb_build_object('deleted_at', NEW.deleted_at)
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to case_documents table
DROP TRIGGER IF EXISTS trg_audit_case_documents ON case_documents;
CREATE TRIGGER trg_audit_case_documents
  AFTER INSERT OR UPDATE ON case_documents
  FOR EACH ROW
  EXECUTE FUNCTION audit_case_document_changes();

-- Function to log ACL changes
CREATE OR REPLACE FUNCTION audit_case_document_acl_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO case_document_audit (
      document_id, tenant_id, event_type, user_id, metadata
    ) VALUES (
      NEW.document_id,
      NEW.tenant_id,
      'ACCESS_GRANTED',
      NEW.granted_by,
      jsonb_build_object(
        'principal_id', NEW.principal_id,
        'principal_type', NEW.principal_type,
        'access_level', NEW.access_level,
        'expires_at', NEW.expires_at
      )
    );

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO case_document_audit (
      document_id, tenant_id, event_type, user_id, metadata
    ) VALUES (
      OLD.document_id,
      OLD.tenant_id,
      'ACCESS_REVOKED',
      (SELECT updated_by FROM case_documents WHERE id = OLD.document_id),
      jsonb_build_object(
        'principal_id', OLD.principal_id,
        'principal_type', OLD.principal_type,
        'access_level', OLD.access_level
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to ACL table
DROP TRIGGER IF EXISTS trg_audit_case_document_acl ON case_document_acl;
CREATE TRIGGER trg_audit_case_document_acl
  AFTER INSERT OR DELETE ON case_document_acl
  FOR EACH ROW
  EXECUTE FUNCTION audit_case_document_acl_changes();

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

ALTER TABLE case_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_document_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_document_audit ENABLE ROW LEVEL SECURITY;

-- Documents: Users can only see documents they have access to
CREATE POLICY case_documents_tenant_isolation ON case_documents
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND (
      -- Document creator
      created_by = current_setting('app.current_user_id')::uuid
      OR
      -- User has ACL entry
      EXISTS (
        SELECT 1 FROM case_document_acl acl
        WHERE acl.document_id = case_documents.id
          AND acl.principal_id = current_setting('app.current_user_id')::uuid
          AND acl.access_level != 'NONE'
          AND (acl.expires_at IS NULL OR acl.expires_at > NOW())
      )
      OR
      -- Admin role
      current_setting('app.current_user_role', TRUE) = 'ADMIN'
    )
  );

-- ACL: Users can view ACL for documents they can access
CREATE POLICY case_document_acl_tenant_isolation ON case_document_acl
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM case_documents d
      WHERE d.id = case_document_acl.document_id
        AND (
          d.created_by = current_setting('app.current_user_id')::uuid
          OR current_setting('app.current_user_role', TRUE) = 'ADMIN'
        )
    )
  );

-- Audit: Users can view audit logs for documents they can access
CREATE POLICY case_document_audit_tenant_isolation ON case_document_audit
  FOR SELECT
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM case_documents d
      WHERE d.id = case_document_audit.document_id
        AND (
          d.created_by = current_setting('app.current_user_id')::uuid
          OR current_setting('app.current_user_role', TRUE) = 'ADMIN'
        )
    )
  );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to get all versions of a document
CREATE OR REPLACE FUNCTION get_document_version_history(p_document_id UUID)
RETURNS TABLE (
  id UUID,
  version TEXT,
  status VARCHAR(50),
  created_at TIMESTAMPTZ,
  created_by UUID,
  is_latest BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE version_tree AS (
    -- Start with the specified document
    SELECT
      d.id,
      d.version_major || '.' || d.version_minor || '.' || d.version_patch AS version,
      d.status,
      d.created_at,
      d.created_by,
      d.is_latest_version AS is_latest,
      d.parent_version_id
    FROM case_documents d
    WHERE d.id = p_document_id

    UNION ALL

    -- Find parent versions
    SELECT
      d.id,
      d.version_major || '.' || d.version_minor || '.' || d.version_patch AS version,
      d.status,
      d.created_at,
      d.created_by,
      d.is_latest_version AS is_latest,
      d.parent_version_id
    FROM case_documents d
    INNER JOIN version_tree vt ON d.id = vt.parent_version_id
  )
  SELECT
    vt.id,
    vt.version,
    vt.status,
    vt.created_at,
    vt.created_by,
    vt.is_latest
  FROM version_tree vt
  ORDER BY vt.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has access to document
CREATE OR REPLACE FUNCTION user_has_document_access(
  p_user_id UUID,
  p_document_id UUID,
  p_required_level VARCHAR(20)
)
RETURNS BOOLEAN AS $$
DECLARE
  v_access_level VARCHAR(20);
  v_level_order TEXT[] := ARRAY['NONE', 'VIEW', 'COMMENT', 'EDIT', 'ADMIN'];
  v_user_level_index INT;
  v_required_level_index INT;
BEGIN
  -- Get user's access level
  SELECT access_level INTO v_access_level
  FROM case_document_acl
  WHERE document_id = p_document_id
    AND principal_id = p_user_id
    AND (expires_at IS NULL OR expires_at > NOW());

  IF v_access_level IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Compare access levels
  SELECT array_position(v_level_order, v_access_level) INTO v_user_level_index;
  SELECT array_position(v_level_order, p_required_level) INTO v_required_level_index;

  RETURN v_user_level_index >= v_required_level_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- Comments for Documentation
-- ============================================================================

COMMENT ON TABLE case_documents IS 'Case documents with versioning, e-signature, and GDPR compliance';
COMMENT ON TABLE case_document_acl IS 'Access Control List for granular document permissions';
COMMENT ON TABLE case_document_audit IS 'Immutable audit trail for all document operations';

COMMENT ON COLUMN case_documents.content_hash IS 'SHA-256 hash of document content for integrity verification';
COMMENT ON COLUMN case_documents.classification IS 'GDPR data classification affecting retention policy';
COMMENT ON COLUMN case_documents.retention_until IS 'Legal hold end date - prevents deletion before this date';
COMMENT ON COLUMN case_documents.signature_hash IS 'Cryptographic hash of e-signature for non-repudiation';
