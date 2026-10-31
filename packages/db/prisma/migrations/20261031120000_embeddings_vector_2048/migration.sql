-- Embeddings move from Gemini (gemini-embedding-001 at 1536) to the free OpenRouter model
-- nvidia/nemotron-3-embed-1b:free (owner ruling 2026-10-31, gh #1108). That model returns only
-- 2048-dimension vectors (OpenRouter answers 400 "dimensions must be one of 2048" to any other
-- size), so the four embedding columns become vector(2048).
--
-- Class B (ADR-069 / docs/operations/agent-autonomy-policy.md): it rewrites populated rows. The
-- owner said yes to running it in production on 2026-10-31.
--   * Each column is changed and cleared in one statement (USING NULL): a vector cannot be cast to
--     another size, and vectors from different models are not comparable, so every stored
--     embedding has to be regenerated anyway. Embeddings are derived data; no source field changes.
--   * ALTER COLUMN TYPE takes an ACCESS EXCLUSIVE lock and rewrites the table. lock_timeout bounds
--     the wait for the lock; the four tables are small while there are no real customers.
--   * No index exists on these columns. pgvector cannot build an HNSW or IVFFlat index on a vector
--     column over 2000 dimensions, so a future similarity index must use halfvec(2048), for example
--     an expression index on (embedding::halfvec(2048)) halfvec_cosine_ops.
--   * The legacy Supabase functions search_*_by_embedding / match_*_by_embedding take vector(1536);
--     nothing calls them, and they are left alone.
--
-- Backfill: ContactEmbedWorker.enqueueMissingEmbeddings() runs when ai-worker boots. It queues one
-- job per contact whose embedding IS NULL, spaced to stay under the free model's rate limit, and
-- each job re-checks erasure and restriction before it writes. Restart ai-worker after the deploy to
-- trigger it. lead, lead_notes and contact_notes embeddings have no writer today, so they stay NULL
-- as before.
--
-- Recovery plan: re-running the backfill is safe (it only picks NULL rows; job ids dedupe a contact
-- already queued). Rollback = a migration back to vector(1536) USING NULL, EMBEDDING_PROVIDER=gemini
-- with GEMINI_API_KEY, and the same backfill to re-embed with Gemini. Production applies only through
-- the gated `prisma migrate deploy` workflow, before ai-worker ships.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "leads"
    ALTER COLUMN "embedding" TYPE vector(2048) USING NULL::vector(2048);

ALTER TABLE "lead_notes"
    ALTER COLUMN "embedding" TYPE vector(2048) USING NULL::vector(2048);

ALTER TABLE "contacts"
    ALTER COLUMN "embedding" TYPE vector(2048) USING NULL::vector(2048);

ALTER TABLE "contact_notes"
    ALTER COLUMN "embedding" TYPE vector(2048) USING NULL::vector(2048);
