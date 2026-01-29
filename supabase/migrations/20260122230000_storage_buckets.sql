-- =============================================================================
-- Storage Buckets for Document Ingestion Pipeline
-- =============================================================================
-- Created: 2026-01-22
-- Purpose: Create storage buckets required by SupabaseStorageAdapter
-- Used by: packages/adapters/src/storage/SupabaseStorageAdapter.ts
-- =============================================================================

-- Create quarantine bucket for file ingestion (temporary holding before AV scan)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'case-documents-quarantine',
  'case-documents-quarantine',
  false,
  52428800,  -- 50MB limit
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'image/jpeg', 'image/png', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Create primary documents bucket for permanent storage (after AV scan passes)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES (
  'case-documents',
  'case-documents',
  false,
  52428800  -- 50MB limit
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- RLS Policies for Storage Buckets
-- =============================================================================

-- Quarantine bucket: Service role only (no direct user access)
-- Files are uploaded here during ingestion, then moved to primary after AV scan
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage quarantine'
  ) THEN
    CREATE POLICY "Service role can manage quarantine"
    ON storage.objects FOR ALL
    TO service_role
    USING (bucket_id = 'case-documents-quarantine');
  END IF;
END $$;

-- Documents bucket: Authenticated users can read their own documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can read own documents'
  ) THEN
    CREATE POLICY "Authenticated users can read own documents"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'case-documents' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- Documents bucket: Service role can manage all documents
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage documents'
  ) THEN
    CREATE POLICY "Service role can manage documents"
    ON storage.objects FOR ALL
    TO service_role
    USING (bucket_id = 'case-documents');
  END IF;
END $$;
