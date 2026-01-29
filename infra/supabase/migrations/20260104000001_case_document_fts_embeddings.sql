-- IFC-155: Permissioned indexing for case documents and notes
-- Adds full-text search (FTS) and vector embeddings with tenant/case ACL filters

-- ============================================
-- CASE DOCUMENTS: FTS AND EMBEDDINGS
-- ============================================

-- Add embedding column for vector similarity search (1536 dimensions for OpenAI text-embedding-3-small)
ALTER TABLE case_documents
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add full-text search vector column
ALTER TABLE case_documents
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Add extracted_text column for OCR/text content (from IFC-154)
ALTER TABLE case_documents
ADD COLUMN IF NOT EXISTS extracted_text text;

-- Create trigger function to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION case_documents_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.extracted_text, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS case_documents_search_vector_trigger ON case_documents;
CREATE TRIGGER case_documents_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, description, extracted_text, tags ON case_documents
  FOR EACH ROW EXECUTE FUNCTION case_documents_search_vector_update();

-- GIN index for full-text search
CREATE INDEX IF NOT EXISTS idx_case_documents_search_vector
ON case_documents USING GIN(search_vector);

-- HNSW index for vector similarity search (pgvector)
-- Using HNSW for better query performance at slight cost of insert speed
CREATE INDEX IF NOT EXISTS idx_case_documents_embedding
ON case_documents USING hnsw(embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Partial index for active documents only (faster queries)
CREATE INDEX IF NOT EXISTS idx_case_documents_embedding_active
ON case_documents USING hnsw(embedding vector_cosine_ops)
WHERE deleted_at IS NULL AND is_latest_version = true;

-- Backfill search_vector for existing documents
UPDATE case_documents
SET search_vector =
  setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(extracted_text, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(array_to_string(tags, ' '), '')), 'D')
WHERE search_vector IS NULL;

-- ============================================
-- CONTACT NOTES: FTS AND EMBEDDINGS
-- ============================================

-- Add embedding column for vector similarity search
ALTER TABLE contact_notes
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Add full-text search vector column
ALTER TABLE contact_notes
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create trigger function for contact notes
CREATE OR REPLACE FUNCTION contact_notes_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.content, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS contact_notes_search_vector_trigger ON contact_notes;
CREATE TRIGGER contact_notes_search_vector_trigger
  BEFORE INSERT OR UPDATE OF content ON contact_notes
  FOR EACH ROW EXECUTE FUNCTION contact_notes_search_vector_update();

-- GIN index for full-text search on notes
CREATE INDEX IF NOT EXISTS idx_contact_notes_search_vector
ON contact_notes USING GIN(search_vector);

-- HNSW index for vector similarity search on notes
CREATE INDEX IF NOT EXISTS idx_contact_notes_embedding
ON contact_notes USING hnsw(embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Backfill search_vector for existing notes
UPDATE contact_notes
SET search_vector = to_tsvector('english', COALESCE(content, ''))
WHERE search_vector IS NULL;

-- ============================================
-- HELPER FUNCTIONS FOR SEARCH
-- ============================================

-- Function to search case documents with FTS ranking
CREATE OR REPLACE FUNCTION search_case_documents_fts(
  p_query text,
  p_tenant_id text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id text,
  title text,
  description text,
  rank float,
  snippet text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  ts_query := plainto_tsquery('english', p_query);

  RETURN QUERY
  SELECT
    cd.id::text,
    cd.title,
    cd.description,
    ts_rank_cd(cd.search_vector, ts_query)::float as rank,
    ts_headline('english',
      COALESCE(cd.title, '') || ' ' || COALESCE(cd.description, ''),
      ts_query,
      'StartSel=<b>,StopSel=</b>,MaxWords=50,MinWords=20'
    ) as snippet
  FROM case_documents cd
  WHERE cd.tenant_id = p_tenant_id
    AND cd.deleted_at IS NULL
    AND cd.is_latest_version = true
    AND cd.search_vector @@ ts_query
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$;

-- Function to search case documents by vector similarity
CREATE OR REPLACE FUNCTION search_case_documents_semantic(
  p_embedding vector(1536),
  p_tenant_id text,
  p_threshold float DEFAULT 0.7,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id text,
  title text,
  description text,
  similarity float
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cd.id::text,
    cd.title,
    cd.description,
    (1 - (cd.embedding <=> p_embedding))::float as similarity
  FROM case_documents cd
  WHERE cd.tenant_id = p_tenant_id
    AND cd.deleted_at IS NULL
    AND cd.is_latest_version = true
    AND cd.embedding IS NOT NULL
    AND (1 - (cd.embedding <=> p_embedding)) >= p_threshold
  ORDER BY cd.embedding <=> p_embedding
  LIMIT p_limit;
END;
$$;

-- Function to search contact notes with FTS ranking
CREATE OR REPLACE FUNCTION search_contact_notes_fts(
  p_query text,
  p_tenant_id text,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id text,
  content text,
  contact_id text,
  rank float,
  snippet text
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  ts_query tsquery;
BEGIN
  ts_query := plainto_tsquery('english', p_query);

  RETURN QUERY
  SELECT
    cn.id::text,
    cn.content,
    cn."contactId"::text as contact_id,
    ts_rank_cd(cn.search_vector, ts_query)::float as rank,
    ts_headline('english',
      cn.content,
      ts_query,
      'StartSel=<b>,StopSel=</b>,MaxWords=50,MinWords=20'
    ) as snippet
  FROM contact_notes cn
  WHERE cn."tenantId" = p_tenant_id
    AND cn.search_vector @@ ts_query
  ORDER BY rank DESC
  LIMIT p_limit;
END;
$$;

-- ============================================
-- RLS POLICIES FOR NEW COLUMNS
-- ============================================

-- Note: RLS is already enabled on these tables.
-- The embedding and search_vector columns are covered by existing tenant_id policies.

COMMENT ON COLUMN case_documents.embedding IS 'Vector embedding for semantic search (1536 dimensions, OpenAI text-embedding-3-small)';
COMMENT ON COLUMN case_documents.search_vector IS 'Full-text search vector, auto-updated via trigger';
COMMENT ON COLUMN case_documents.extracted_text IS 'Extracted text content from document (OCR, PDF parsing)';
COMMENT ON COLUMN contact_notes.embedding IS 'Vector embedding for semantic search (1536 dimensions)';
COMMENT ON COLUMN contact_notes.search_vector IS 'Full-text search vector, auto-updated via trigger';
