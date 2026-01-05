-- ============================================
-- CONVERSATION RECORDS RLS & GDPR COMPLIANCE (IFC-148)
-- Adds Row Level Security and GDPR compliance functions
-- for conversation_records, message_records, and tool_call_records
--
-- Run AFTER: 20260103000001_update_rls_policies.sql
-- ============================================

BEGIN;

-- ============================================
-- 1. ENABLE RLS ON CONVERSATION TABLES
-- ============================================

ALTER TABLE conversation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_call_records ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. TENANT ISOLATION POLICIES
-- ============================================

-- Conversation Records - Full tenant isolation
CREATE POLICY "conversation_records_tenant_isolation" ON conversation_records
FOR ALL USING (tenant_id = auth.tenant_id());

-- Message Records - Tenant isolation via conversation
CREATE POLICY "message_records_tenant_isolation" ON message_records
FOR ALL USING (
  conversation_id IN (
    SELECT id FROM conversation_records
    WHERE tenant_id = auth.tenant_id()
  )
);

-- Tool Call Records - Tenant isolation via conversation
CREATE POLICY "tool_call_records_tenant_isolation" ON tool_call_records
FOR ALL USING (
  conversation_id IN (
    SELECT id FROM conversation_records
    WHERE tenant_id = auth.tenant_id()
  )
);

-- ============================================
-- 3. SERVICE ROLE BYPASS POLICIES
-- Allow service role to bypass RLS for system operations
-- ============================================

CREATE POLICY "conversation_records_service_role" ON conversation_records
FOR ALL USING (auth.is_service_role());

CREATE POLICY "message_records_service_role" ON message_records
FOR ALL USING (auth.is_service_role());

CREATE POLICY "tool_call_records_service_role" ON tool_call_records
FOR ALL USING (auth.is_service_role());

-- ============================================
-- 4. GDPR DATA RETENTION FUNCTION
-- Enforces retention policy by deleting/archiving old conversations
-- ============================================

CREATE OR REPLACE FUNCTION enforce_conversation_retention()
RETURNS TABLE (
  deleted_conversations INTEGER,
  archived_conversations INTEGER,
  affected_messages INTEGER,
  affected_tool_calls INTEGER
) AS $$
DECLARE
  v_deleted_count INTEGER := 0;
  v_archived_count INTEGER := 0;
  v_message_count INTEGER := 0;
  v_tool_call_count INTEGER := 0;
BEGIN
  -- Archive conversations older than 90 days that are ended
  UPDATE conversation_records
  SET status = 'ARCHIVED'
  WHERE status = 'ENDED'
    AND ended_at < NOW() - INTERVAL '90 days'
    AND status != 'ARCHIVED';

  GET DIAGNOSTICS v_archived_count = ROW_COUNT;

  -- Delete conversations past retention date (already archived)
  -- First count affected child records
  SELECT COUNT(*) INTO v_message_count
  FROM message_records m
  INNER JOIN conversation_records c ON m.conversation_id = c.id
  WHERE c.retention_expires_at IS NOT NULL
    AND c.retention_expires_at < NOW()
    AND c.status IN ('ENDED', 'ARCHIVED', 'DELETED');

  SELECT COUNT(*) INTO v_tool_call_count
  FROM tool_call_records t
  INNER JOIN conversation_records c ON t.conversation_id = c.id
  WHERE c.retention_expires_at IS NOT NULL
    AND c.retention_expires_at < NOW()
    AND c.status IN ('ENDED', 'ARCHIVED', 'DELETED');

  -- Delete conversations (cascade will handle messages and tool calls)
  DELETE FROM conversation_records
  WHERE retention_expires_at IS NOT NULL
    AND retention_expires_at < NOW()
    AND status IN ('ENDED', 'ARCHIVED', 'DELETED');

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN QUERY SELECT
    v_deleted_count AS deleted_conversations,
    v_archived_count AS archived_conversations,
    v_message_count AS affected_messages,
    v_tool_call_count AS affected_tool_calls;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. GDPR ANONYMIZATION FUNCTION
-- Anonymizes conversation data for a specific user (DSAR erasure)
-- ============================================

CREATE OR REPLACE FUNCTION anonymize_conversation_data(p_user_id TEXT)
RETURNS TABLE (
  anonymized_conversations INTEGER,
  anonymized_messages INTEGER,
  anonymized_tool_calls INTEGER
) AS $$
DECLARE
  v_conv_count INTEGER := 0;
  v_msg_count INTEGER := 0;
  v_tool_count INTEGER := 0;
BEGIN
  -- Anonymize conversation records
  UPDATE conversation_records
  SET
    user_name = 'ANONYMIZED',
    ip_address = NULL,
    user_agent = NULL,
    summary = NULL,
    title = CASE WHEN title IS NOT NULL THEN '[ANONYMIZED]' ELSE NULL END,
    feedback_text = CASE WHEN feedback_text IS NOT NULL THEN '[REDACTED]' ELSE NULL END,
    embedding = NULL,
    updated_at = NOW()
  WHERE user_id = p_user_id;

  GET DIAGNOSTICS v_conv_count = ROW_COUNT;

  -- Anonymize user messages (keep assistant/system messages for context)
  UPDATE message_records m
  SET
    content = '[REDACTED BY DSAR REQUEST]',
    edited_content = NULL,
    attachments = NULL,
    embedding = NULL
  FROM conversation_records c
  WHERE m.conversation_id = c.id
    AND c.user_id = p_user_id
    AND m.role = 'USER';

  GET DIAGNOSTICS v_msg_count = ROW_COUNT;

  -- Clear sensitive data from tool calls (keep audit trail)
  UPDATE tool_call_records t
  SET
    input_parameters = '{"redacted": true}'::jsonb,
    output_result = '{"redacted": true}'::jsonb,
    rollback_data = NULL,
    change_description = CASE
      WHEN change_description IS NOT NULL
      THEN '[REDACTED BY DSAR REQUEST]'
      ELSE NULL
    END
  FROM conversation_records c
  WHERE t.conversation_id = c.id
    AND c.user_id = p_user_id;

  GET DIAGNOSTICS v_tool_count = ROW_COUNT;

  RETURN QUERY SELECT
    v_conv_count AS anonymized_conversations,
    v_msg_count AS anonymized_messages,
    v_tool_count AS anonymized_tool_calls;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 6. CONVERSATION ACCESS EXPORT FUNCTION
-- Exports all conversation data for a user (DSAR access)
-- ============================================

CREATE OR REPLACE FUNCTION export_user_conversations(p_user_id TEXT)
RETURNS TABLE (
  conversation_data JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT jsonb_agg(
    jsonb_build_object(
      'conversation', jsonb_build_object(
        'id', c.id,
        'sessionId', c.session_id,
        'title', c.title,
        'summary', c.summary,
        'contextType', c.context_type,
        'contextName', c.context_name,
        'channel', c.channel,
        'status', c.status,
        'startedAt', c.started_at,
        'endedAt', c.ended_at,
        'messageCount', c.message_count,
        'toolCallCount', c.tool_call_count,
        'userRating', c.user_rating,
        'feedbackText', c.feedback_text
      ),
      'messages', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', m.id,
            'role', m.role,
            'content', m.content,
            'contentType', m.content_type,
            'createdAt', m.created_at
          ) ORDER BY m.created_at
        ), '[]'::jsonb)
        FROM message_records m
        WHERE m.conversation_id = c.id
      ),
      'toolCalls', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'toolName', t.tool_name,
            'toolType', t.tool_type,
            'status', t.status,
            'startedAt', t.started_at,
            'completedAt', t.completed_at,
            'affectedEntity', t.affected_entity,
            'changeDescription', t.change_description
          ) ORDER BY t.started_at
        ), '[]'::jsonb)
        FROM tool_call_records t
        WHERE t.conversation_id = c.id
      )
    )
  ) AS conversation_data
  FROM conversation_records c
  WHERE c.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- 7. ADDITIONAL INDEXES FOR PERFORMANCE
-- ============================================

-- Retention expiry index for cleanup jobs
CREATE INDEX IF NOT EXISTS idx_conversation_records_retention
ON conversation_records(retention_expires_at)
WHERE retention_expires_at IS NOT NULL AND status IN ('ENDED', 'ARCHIVED');

-- User lookup index for DSAR
CREATE INDEX IF NOT EXISTS idx_conversation_records_user
ON conversation_records(user_id);

-- Context lookup index for case integration
CREATE INDEX IF NOT EXISTS idx_conversation_records_context
ON conversation_records(context_type, context_id)
WHERE context_id IS NOT NULL;

-- Status index for archival jobs
CREATE INDEX IF NOT EXISTS idx_conversation_records_status_ended
ON conversation_records(ended_at)
WHERE status = 'ENDED';

COMMIT;

-- ============================================
-- POST-MIGRATION VERIFICATION
-- ============================================
--
-- Run these queries to verify RLS is working:
--
-- 1. Check RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('conversation_records', 'message_records', 'tool_call_records');
--
-- 2. List policies:
-- SELECT tablename, policyname FROM pg_policies
-- WHERE tablename LIKE '%conversation%' OR tablename LIKE '%message%' OR tablename LIKE '%tool_call%';
--
-- 3. Test retention function (dry run):
-- SELECT * FROM enforce_conversation_retention();
--
-- 4. Test anonymization (requires test user ID):
-- SELECT * FROM anonymize_conversation_data('test-user-id');
