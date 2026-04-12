-- Migration: 20260122100000_add_missing_constraints
-- Description: Add missing foreign key and CHECK constraints identified in schema review
-- Author: Claude Code
-- Date: 2026-01-22

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

-- Agent Availability: userId -> users
ALTER TABLE agent_availability
ADD CONSTRAINT agent_availability_userId_fkey
FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;

-- Agent Skills: userId -> users
ALTER TABLE agent_skills
ADD CONSTRAINT agent_skills_userId_fkey
FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;

-- Deal Renewals: originalDealId -> opportunities
ALTER TABLE deal_renewals
ADD CONSTRAINT deal_renewals_originalDealId_fkey
FOREIGN KEY ("originalDealId") REFERENCES opportunities(id) ON DELETE RESTRICT;

-- Deal Renewals: renewalDealId -> opportunities (nullable, so SET NULL on delete)
ALTER TABLE deal_renewals
ADD CONSTRAINT deal_renewals_renewalDealId_fkey
FOREIGN KEY ("renewalDealId") REFERENCES opportunities(id) ON DELETE SET NULL;

-- Calendar Events: ownerId -> users (nullable)
ALTER TABLE calendar_events
ADD CONSTRAINT calendar_events_ownerId_fkey
FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE SET NULL;

-- Documents: contactId -> contacts (nullable)
ALTER TABLE documents
ADD CONSTRAINT documents_contactId_fkey
FOREIGN KEY ("contactId") REFERENCES contacts(id) ON DELETE SET NULL;

-- Documents: accountId -> accounts (nullable)
ALTER TABLE documents
ADD CONSTRAINT documents_accountId_fkey
FOREIGN KEY ("accountId") REFERENCES accounts(id) ON DELETE SET NULL;

-- Documents: dealId -> opportunities (nullable)
ALTER TABLE documents
ADD CONSTRAINT documents_dealId_fkey
FOREIGN KEY ("dealId") REFERENCES opportunities(id) ON DELETE SET NULL;

-- Documents: ticketId -> tickets (nullable)
ALTER TABLE documents
ADD CONSTRAINT documents_ticketId_fkey
FOREIGN KEY ("ticketId") REFERENCES tickets(id) ON DELETE SET NULL;

-- ============================================================================
-- CHECK CONSTRAINTS - Score Validations
-- ============================================================================

-- AI Scores: score must be 0-100
ALTER TABLE ai_scores
ADD CONSTRAINT chk_ai_scores_score_range
CHECK (score >= 0 AND score <= 100);

-- AI Scores: confidence must be 0-1
ALTER TABLE ai_scores
ADD CONSTRAINT chk_ai_scores_confidence_range
CHECK (confidence >= 0 AND confidence <= 1);

-- Account Health Scores: overallScore must be 0-100
ALTER TABLE account_health_scores
ADD CONSTRAINT chk_health_overall_score_range
CHECK ("overallScore" >= 0 AND "overallScore" <= 100);

-- Account Health Scores: usageScore must be 0-100 (nullable)
ALTER TABLE account_health_scores
ADD CONSTRAINT chk_health_usage_score_range
CHECK ("usageScore" IS NULL OR ("usageScore" >= 0 AND "usageScore" <= 100));

-- Account Health Scores: engagementScore must be 0-100 (nullable)
ALTER TABLE account_health_scores
ADD CONSTRAINT chk_health_engagement_score_range
CHECK ("engagementScore" IS NULL OR ("engagementScore" >= 0 AND "engagementScore" <= 100));

-- Account Health Scores: supportScore must be 0-100 (nullable)
ALTER TABLE account_health_scores
ADD CONSTRAINT chk_health_support_score_range
CHECK ("supportScore" IS NULL OR ("supportScore" >= 0 AND "supportScore" <= 100));

-- Account Health Scores: paymentScore must be 0-100 (nullable)
ALTER TABLE account_health_scores
ADD CONSTRAINT chk_health_payment_score_range
CHECK ("paymentScore" IS NULL OR ("paymentScore" >= 0 AND "paymentScore" <= 100));

-- ============================================================================
-- CHECK CONSTRAINTS - Percentage Validations
-- ============================================================================

-- AB Experiments: trafficPercent must be 0-100
ALTER TABLE ab_experiments
ADD CONSTRAINT chk_experiments_traffic_percent_range
CHECK ("trafficPercent" >= 0 AND "trafficPercent" <= 100);

-- ============================================================================
-- CHECK CONSTRAINTS - Additional Score Validations
-- ============================================================================

-- Contact AI Insights: conversionProbability must be 0-100
ALTER TABLE contact_ai_insights
ADD CONSTRAINT chk_contact_insights_conversion_range
CHECK ("conversionProbability" >= 0 AND "conversionProbability" <= 100);

-- Contact AI Insights: engagementScore must be 0-100
ALTER TABLE contact_ai_insights
ADD CONSTRAINT chk_contact_insights_engagement_range
CHECK ("engagementScore" >= 0 AND "engagementScore" <= 100);

-- Agent Actions: confidenceScore must be 0-100
ALTER TABLE agent_actions
ADD CONSTRAINT chk_agent_actions_confidence_range
CHECK ("confidenceScore" >= 0 AND "confidenceScore" <= 100);

-- AI Insights: confidence must be 0-100
ALTER TABLE ai_insights
ADD CONSTRAINT chk_ai_insights_confidence_range
CHECK (confidence >= 0 AND confidence <= 100);

-- Opportunities: probability must be 0-100
ALTER TABLE opportunities
ADD CONSTRAINT chk_opportunities_probability_range
CHECK (probability >= 0 AND probability <= 100);

-- ============================================================================
-- INDEXES for new Foreign Keys (if not already existing)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_agent_availability_userId ON agent_availability("userId");
CREATE INDEX IF NOT EXISTS idx_agent_skills_userId ON agent_skills("userId");
CREATE INDEX IF NOT EXISTS idx_deal_renewals_originalDealId ON deal_renewals("originalDealId");
CREATE INDEX IF NOT EXISTS idx_deal_renewals_renewalDealId ON deal_renewals("renewalDealId");
CREATE INDEX IF NOT EXISTS idx_documents_contactId ON documents("contactId");
CREATE INDEX IF NOT EXISTS idx_documents_accountId ON documents("accountId");
CREATE INDEX IF NOT EXISTS idx_documents_dealId ON documents("dealId");
CREATE INDEX IF NOT EXISTS idx_documents_ticketId ON documents("ticketId");

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Verify foreign keys were created
DO $$
DECLARE
  fk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'FOREIGN KEY'
    AND constraint_name IN (
      'agent_availability_userId_fkey',
      'agent_skills_userId_fkey',
      'deal_renewals_originalDealId_fkey',
      'deal_renewals_renewalDealId_fkey',
      'calendar_events_ownerId_fkey',
      'documents_contactId_fkey',
      'documents_accountId_fkey',
      'documents_dealId_fkey',
      'documents_ticketId_fkey'
    );

  IF fk_count < 9 THEN
    RAISE WARNING 'Expected 9 foreign keys, found %', fk_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All 9 foreign key constraints created';
  END IF;
END $$;

-- Verify check constraints were created
DO $$
DECLARE
  chk_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO chk_count
  FROM information_schema.table_constraints
  WHERE constraint_type = 'CHECK'
    AND constraint_name LIKE 'chk_%';

  RAISE NOTICE 'Created % CHECK constraints', chk_count;
END $$;
