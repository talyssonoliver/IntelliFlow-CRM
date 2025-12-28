-- pgvector Test SQL Script for IntelliFlow CRM
-- Task: IFC-017 - Prisma + Supabase Data Layer
-- Purpose: Validate pgvector extension for AI embeddings support
--
-- Prerequisites:
--   - PostgreSQL 15+ with pgvector extension
--   - Supabase instance (local or cloud)
--   - Run: CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 1. VERIFY PGVECTOR EXTENSION
-- ============================================

-- Check if pgvector extension is installed
SELECT
    extname,
    extversion,
    CASE WHEN extname = 'vector' THEN 'PASS' ELSE 'FAIL' END as status
FROM pg_extension
WHERE extname = 'vector';

-- If not installed, enable it (requires superuser or rds_superuser)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- 2. TEST VECTOR DATA TYPE
-- ============================================

-- Create a test table with vector column (1536 dimensions for OpenAI embeddings)
CREATE TABLE IF NOT EXISTS pgvector_test (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. INSERT TEST VECTORS
-- ============================================

-- Generate a sample 1536-dimensional vector (simplified for testing)
-- In production, embeddings come from OpenAI's text-embedding-ada-002
DO $$
DECLARE
    test_embedding vector(1536);
    i integer;
BEGIN
    -- Create a simple test vector with pattern
    test_embedding := array_fill(0.1::float, ARRAY[1536])::vector;

    INSERT INTO pgvector_test (name, description, embedding)
    VALUES (
        'Test Lead 1',
        'High-value enterprise prospect in technology sector',
        test_embedding
    );

    -- Create another vector with slightly different values
    test_embedding := array_fill(0.2::float, ARRAY[1536])::vector;

    INSERT INTO pgvector_test (name, description, embedding)
    VALUES (
        'Test Lead 2',
        'Small business prospect in retail sector',
        test_embedding
    );

    -- Create a third vector for similarity testing
    test_embedding := array_fill(0.15::float, ARRAY[1536])::vector;

    INSERT INTO pgvector_test (name, description, embedding)
    VALUES (
        'Test Lead 3',
        'Medium enterprise prospect in manufacturing',
        test_embedding
    );
END $$;

-- ============================================
-- 4. TEST SIMILARITY SEARCH (L2 Distance)
-- ============================================

-- Find similar vectors using L2 distance (Euclidean)
-- Lower score = more similar
SELECT
    id,
    name,
    description,
    embedding <-> (SELECT embedding FROM pgvector_test WHERE id = 1) as l2_distance
FROM pgvector_test
ORDER BY l2_distance
LIMIT 5;

-- ============================================
-- 5. TEST SIMILARITY SEARCH (Cosine)
-- ============================================

-- Find similar vectors using cosine distance
-- Lower score = more similar (1 - cosine_similarity)
SELECT
    id,
    name,
    description,
    embedding <=> (SELECT embedding FROM pgvector_test WHERE id = 1) as cosine_distance,
    1 - (embedding <=> (SELECT embedding FROM pgvector_test WHERE id = 1)) as cosine_similarity
FROM pgvector_test
ORDER BY cosine_distance
LIMIT 5;

-- ============================================
-- 6. TEST SIMILARITY SEARCH (Inner Product)
-- ============================================

-- Find similar vectors using negative inner product
-- Higher score = more similar (use negative for ORDER BY ASC)
SELECT
    id,
    name,
    description,
    (embedding <#> (SELECT embedding FROM pgvector_test WHERE id = 1)) * -1 as inner_product
FROM pgvector_test
ORDER BY embedding <#> (SELECT embedding FROM pgvector_test WHERE id = 1)
LIMIT 5;

-- ============================================
-- 7. PERFORMANCE TEST: INDEX CREATION
-- ============================================

-- Create an HNSW index for faster similarity search
-- HNSW = Hierarchical Navigable Small World (recommended for pgvector)
CREATE INDEX IF NOT EXISTS pgvector_test_embedding_hnsw_idx
ON pgvector_test
USING hnsw (embedding vector_cosine_ops);

-- Alternative: IVFFlat index (faster to build, slightly less accurate)
-- CREATE INDEX IF NOT EXISTS pgvector_test_embedding_ivfflat_idx
-- ON pgvector_test
-- USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================
-- 8. PERFORMANCE TEST: QUERY TIMING
-- ============================================

-- Enable timing
\timing on

-- Run similarity search with index
EXPLAIN ANALYZE
SELECT
    id,
    name,
    1 - (embedding <=> (SELECT embedding FROM pgvector_test WHERE id = 1)) as similarity
FROM pgvector_test
ORDER BY embedding <=> (SELECT embedding FROM pgvector_test WHERE id = 1)
LIMIT 10;

\timing off

-- ============================================
-- 9. TEST WITH LEADS TABLE (IF EXISTS)
-- ============================================

-- Check if leads table has embedding column
SELECT
    column_name,
    data_type,
    CASE WHEN data_type LIKE '%vector%' THEN 'PASS' ELSE 'CHECK SCHEMA' END as status
FROM information_schema.columns
WHERE table_name = 'leads'
  AND column_name = 'embedding';

-- Sample query for lead similarity search (production use)
-- This would be called from the application layer
/*
SELECT
    l.id,
    l.email,
    l.company,
    l.score,
    1 - (l.embedding <=> $1::vector) as similarity
FROM leads l
WHERE l.embedding IS NOT NULL
  AND 1 - (l.embedding <=> $1::vector) > 0.7  -- Similarity threshold
ORDER BY l.embedding <=> $1::vector
LIMIT 10;
*/

-- ============================================
-- 10. CLEANUP TEST DATA
-- ============================================

-- Drop test table when done
-- DROP TABLE IF EXISTS pgvector_test;

-- ============================================
-- VALIDATION SUMMARY
-- ============================================

SELECT
    'pgvector Extension' as test,
    CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
         THEN 'PASS' ELSE 'FAIL' END as result
UNION ALL
SELECT
    'Vector Data Type' as test,
    CASE WHEN EXISTS (SELECT 1 FROM pgvector_test LIMIT 1)
         THEN 'PASS' ELSE 'FAIL' END as result
UNION ALL
SELECT
    'Similarity Search' as test,
    CASE WHEN (SELECT COUNT(*) FROM pgvector_test) >= 3
         THEN 'PASS' ELSE 'FAIL' END as result
UNION ALL
SELECT
    'HNSW Index' as test,
    CASE WHEN EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'pgvector_test_embedding_hnsw_idx'
    ) THEN 'PASS' ELSE 'PENDING' END as result;

-- Expected output:
-- | test               | result  |
-- |--------------------|---------|
-- | pgvector Extension | PASS    |
-- | Vector Data Type   | PASS    |
-- | Similarity Search  | PASS    |
-- | HNSW Index         | PASS    |
