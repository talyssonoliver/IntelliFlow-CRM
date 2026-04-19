-- Migration: add_message_content_gin_index
-- Reviewer follow-up: PrismaConversationSearchRepository.search() uses ILIKE '%query%'
-- on MessageRecord.content which causes a full-table scan at scale.
-- A GIN tsvector index over the content column enables fast full-text search via
-- to_tsvector / plainto_tsquery operators.
--
-- Note: Prisma's schema DSL does not support tsvector GIN syntax natively, so
-- this index is managed as a raw SQL migration rather than a @@index annotation.

-- Ensure pg_trgm is available for ILIKE fallback path (no-op if already installed)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIN index on to_tsvector('english', content) for efficient full-text search.
-- CONCURRENTLY is omitted here because migrations run outside transaction context
-- on Supabase; add CONCURRENTLY if applying manually on a live replica.
CREATE INDEX IF NOT EXISTS "message_record_content_gin"
    ON "message_records"
    USING GIN (to_tsvector('english', "content"));
