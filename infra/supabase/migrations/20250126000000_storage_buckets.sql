-- Storage Bucket Setup for IntelliFlow CRM
-- Run this script to create and configure storage buckets with RLS policies
--
-- Usage:
--   psql -h localhost -p 54322 -U postgres -d postgres -f storage-setup.sql
-- Or via Supabase CLI:
--   supabase db execute -f infra/supabase/storage-setup.sql

-- ============================================
-- CREATE STORAGE BUCKETS
-- ============================================

-- Clean up existing buckets (careful in production!)
-- DELETE FROM storage.buckets WHERE name IN ('avatars', 'documents', 'email-attachments', 'ai-generated', 'imports', 'exports');

-- Create avatars bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152, -- 2MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create documents bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create email-attachments bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-attachments',
  'email-attachments',
  false,
  26214400, -- 25MB
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/zip'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create ai-generated bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-generated',
  'ai-generated',
  false,
  10485760, -- 10MB
  ARRAY['application/json', 'text/plain', 'text/csv', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create imports bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,
  104857600, -- 100MB
  ARRAY[
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Create exports bucket (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'exports',
  'exports',
  false,
  104857600, -- 100MB
  ARRAY[
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ============================================
-- ENABLE RLS ON STORAGE
-- ============================================

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STORAGE HELPER FUNCTIONS
-- ============================================

-- Extract folder name from path
CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
  parts text[];
BEGIN
  parts := string_to_array(name, '/');
  RETURN parts;
END;
$$;

-- ============================================
-- AVATARS BUCKET POLICIES
-- ============================================

-- Anyone can read avatars (public bucket)
CREATE POLICY "avatars_select_public"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users can upload to their own folder
CREATE POLICY "avatars_insert_own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own avatars
CREATE POLICY "avatars_update_own"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own avatars
CREATE POLICY "avatars_delete_own"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================
-- DOCUMENTS BUCKET POLICIES
-- ============================================

-- Users can view their own documents, managers can view team docs, admins can view all
CREATE POLICY "documents_select"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_manager()
      OR auth.is_admin()
    )
  );

-- Authenticated users can upload documents to their folder
CREATE POLICY "documents_insert_own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can update their own documents, admins can update all
CREATE POLICY "documents_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_admin()
    )
  )
  WITH CHECK (bucket_id = 'documents');

-- Users can delete their own documents, admins can delete all
CREATE POLICY "documents_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'documents'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_admin()
    )
  );

-- ============================================
-- EMAIL ATTACHMENTS BUCKET POLICIES
-- ============================================

-- Authenticated users can view email attachments
CREATE POLICY "email_attachments_select"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'email-attachments'
    AND auth.role() = 'authenticated'
  );

-- Authenticated users can upload email attachments
CREATE POLICY "email_attachments_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND auth.role() = 'authenticated'
  );

-- Users can delete their own attachments, admins can delete all
CREATE POLICY "email_attachments_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'email-attachments'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_admin()
    )
  );

-- ============================================
-- AI-GENERATED BUCKET POLICIES
-- ============================================

-- Users can view their own AI-generated content, managers can view team content, admins all
CREATE POLICY "ai_generated_select"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'ai-generated'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_manager()
      OR auth.is_admin()
    )
  );

-- Only admins can upload AI-generated content (system operation)
CREATE POLICY "ai_generated_insert_admin"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'ai-generated'
    AND auth.is_admin()
  );

-- Only admins can delete AI-generated content
CREATE POLICY "ai_generated_delete_admin"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'ai-generated'
    AND auth.is_admin()
  );

-- ============================================
-- IMPORTS BUCKET POLICIES
-- ============================================

-- Users can view their own imports, admins can view all
CREATE POLICY "imports_select"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'imports'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_admin()
    )
  );

-- Authenticated users can upload imports to their folder
CREATE POLICY "imports_insert_own"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'imports'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Users can delete their own imports, admins can delete all
CREATE POLICY "imports_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'imports'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_admin()
    )
  );

-- ============================================
-- EXPORTS BUCKET POLICIES
-- ============================================

-- Users can view their own exports
CREATE POLICY "exports_select_own"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'exports'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Only admins can upload exports (system operation)
CREATE POLICY "exports_insert_admin"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'exports'
    AND auth.is_admin()
  );

-- Users can delete their own exports, admins can delete all
CREATE POLICY "exports_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'exports'
    AND auth.role() = 'authenticated'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR auth.is_admin()
    )
  );

-- ============================================
-- BUCKET POLICIES (for listing buckets)
-- ============================================

-- Authenticated users can view all buckets
CREATE POLICY "buckets_select_authenticated"
  ON storage.buckets
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- View created buckets
-- SELECT * FROM storage.buckets ORDER BY created_at;

-- View storage policies
-- SELECT * FROM pg_policies WHERE schemaname = 'storage' ORDER BY tablename, policyname;

-- Test storage access (set JWT claims first)
-- SET request.jwt.claims = '{"sub": "test-user-id", "role": "authenticated"}';
-- SELECT * FROM storage.objects WHERE bucket_id = 'documents';
-- RESET request.jwt.claims;

-- ============================================
-- NOTES
-- ============================================

-- 1. File organization should follow pattern: {bucket}/{userId}/{filename}
-- 2. Use signed URLs for temporary access to private files
-- 3. Implement client-side file size validation before upload
-- 4. Consider implementing virus scanning for uploaded files
-- 5. Set up lifecycle policies in production for auto-deletion
-- 6. Monitor storage usage and set up alerts for quota limits
