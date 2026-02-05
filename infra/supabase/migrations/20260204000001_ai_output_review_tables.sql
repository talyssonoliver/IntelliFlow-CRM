-- =====================================================
-- IFC-178: AI Output Review Tables
-- Human-in-the-loop review for AI-generated outputs
-- =====================================================

-- Create tables for AI Output Review feature
-- Note: Enums (AIOutputType, ReviewStatus, ReviewDecision) already exist from prisma db push

-- Main review table
CREATE TABLE IF NOT EXISTS ai_output_reviews (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    output_type "AIOutputType" NOT NULL,
    output_payload JSONB NOT NULL,
    confidence DOUBLE PRECISION NOT NULL,
    status "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    sla_deadline TIMESTAMP(3) NOT NULL,
    escalation_depth INTEGER NOT NULL DEFAULT 0,
    locked_by TEXT,
    locked_at TIMESTAMP(3),
    lock_expires_at TIMESTAMP(3),
    reviewer_id TEXT,
    review_decision "ReviewDecision",
    review_notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Audit trail table (immutable - append only)
CREATE TABLE IF NOT EXISTS ai_output_review_audit (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    review_id TEXT NOT NULL REFERENCES ai_output_reviews(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    actor_id TEXT,
    actor_type TEXT NOT NULL DEFAULT 'USER',
    metadata JSONB,
    timestamp TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ai_output_reviews
CREATE INDEX IF NOT EXISTS ai_output_reviews_tenant_id_idx ON ai_output_reviews(tenant_id);
CREATE INDEX IF NOT EXISTS ai_output_reviews_tenant_status_idx ON ai_output_reviews(tenant_id, status);
CREATE INDEX IF NOT EXISTS ai_output_reviews_tenant_created_idx ON ai_output_reviews(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_output_reviews_status_sla_idx ON ai_output_reviews(status, sla_deadline);
CREATE INDEX IF NOT EXISTS ai_output_reviews_locked_by_idx ON ai_output_reviews(locked_by);
CREATE INDEX IF NOT EXISTS ai_output_reviews_reviewer_idx ON ai_output_reviews(reviewer_id);

-- Indexes for ai_output_review_audit
CREATE INDEX IF NOT EXISTS ai_output_review_audit_review_idx ON ai_output_review_audit(review_id);
CREATE INDEX IF NOT EXISTS ai_output_review_audit_event_idx ON ai_output_review_audit(event_type);
CREATE INDEX IF NOT EXISTS ai_output_review_audit_timestamp_idx ON ai_output_review_audit(timestamp DESC);
CREATE INDEX IF NOT EXISTS ai_output_review_audit_actor_idx ON ai_output_review_audit(actor_id);
