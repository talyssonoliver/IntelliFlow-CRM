'use client';

import { useState, useRef, useCallback } from 'react';
import { Button, Card, toast } from '@intelliflow/ui';
import {
  formatFileSize,
  sanitizeFileName,
  ACCEPTED_EXTENSIONS,
  ACCEPTED_FILE_TYPES,
  MAX_FILE_SIZE_MB,
} from './document-utils';
import type { DocumentUploadProps, DocumentClassification } from './types';
import { trpc } from '@/lib/trpc';

// =============================================================================
// DocumentUpload Component
// =============================================================================

const CLASSIFICATION_OPTIONS: { value: DocumentClassification; label: string }[] = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'CONFIDENTIAL', label: 'Confidential' },
  { value: 'PRIVILEGED', label: 'Privileged' },
];

export function DocumentUpload({
  tenantId: _tenantId,
  userId: _userId,
  relatedCaseId: _relatedCaseId,
  relatedContactId: _relatedContactId,
  onUploadComplete,
  onCancel,
  maxFileSizeMB = MAX_FILE_SIZE_MB,
}: Readonly<DocumentUploadProps>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // tRPC mutation: creates the document record server-side (server generates storageKey per AC-011)
  const createDocumentMutation = trpc.documents.create.useMutation();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classification, setClassification] = useState<DocumentClassification>('INTERNAL');
  const [tags, setTags] = useState('');
  const [fileHash, setFileHash] = useState<string | null>(null);

  // ─── File Validation ──────────────────────────────────────────────────────

  const validateFile = useCallback(
    (file: Readonly<File>): string | null => {
      const extension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ACCEPTED_EXTENSIONS.includes(extension) && !ACCEPTED_FILE_TYPES.includes(file.type)) {
        return `File type "${extension}" is not supported. Accepted: ${ACCEPTED_EXTENSIONS.join(', ')}`;
      }
      const maxBytes = maxFileSizeMB * 1024 * 1024;
      if (file.size > maxBytes) {
        return `File size (${formatFileSize(file.size)}) exceeds ${maxFileSizeMB}MB limit.`;
      }
      return null;
    },
    [maxFileSizeMB]
  );

  // ─── SHA-256 Hash ─────────────────────────────────────────────────────────

  const computeHash = useCallback(async (file: Readonly<File>): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }, []);

  // ─── File Selection ───────────────────────────────────────────────────────

  const handleFileSelect = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        toast({ title: 'Invalid file', description: error, variant: 'destructive' });
        return;
      }
      setSelectedFile(file);
      setTitle((prev) => prev || sanitizeFileName(file.name.replace(/\.[^/.]+$/, '')));
      try {
        const hash = await computeHash(file);
        setFileHash(hash);
      } catch {
        // Hash computation failure is non-fatal
        setFileHash(null);
      }
    },
    [validateFile, computeHash]
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const removeFile = useCallback(() => {
    setSelectedFile(null);
    setFileHash(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ─── Drag & Drop ──────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFileSelect(file);
    },
    [handleFileSelect]
  );

  // ─── Submit ───────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent) => {
      e.preventDefault();
      if (!selectedFile || !title.trim()) {
        toast({
          title: 'Missing required fields',
          description: 'Please select a file and enter a title.',
          variant: 'destructive',
        });
        return;
      }

      setIsUploading(true);
      setUploadProgress(0);

      try {
        // Simulate progress (actual upload progress would come from XHR/fetch)
        const progressInterval = setInterval(() => {
          setUploadProgress((p) => Math.min(p + 10, 90));
        }, 200);

        // Server generates storageKey — not client (SR-02)
        const tagArray = tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);

        // Derive a documentType from the file MIME type for the required API field.
        // The full document type selector UI is tracked in IFC-152.
        const mimeType = selectedFile.type || 'application/octet-stream';
        let documentType:
          | 'OTHER'
          | 'CONTRACT'
          | 'AGREEMENT'
          | 'EVIDENCE'
          | 'CORRESPONDENCE'
          | 'REPORT'
          | 'COURT_FILING'
          | 'MEMO';
        if (mimeType.startsWith('image/')) {
          documentType = 'EVIDENCE';
        } else if (
          mimeType.includes('pdf') ||
          mimeType.includes('msword') ||
          mimeType.includes('officedocument')
        ) {
          documentType = 'CONTRACT';
        } else {
          documentType = 'OTHER';
        }

        const contentHash = fileHash ?? '';
        if (!contentHash) {
          throw new Error('File hash not computed yet. Please wait a moment and try again.');
        }

        // Call documents.create — server generates storageKey (AC-011)
        const result = await createDocumentMutation.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          documentType: documentType,
          classification: classification,
          tags: tagArray,
          relatedCaseId: _relatedCaseId,
          relatedContactId: _relatedContactId,
          contentHash,
          mimeType,
          sizeBytes: selectedFile.size,
        });

        clearInterval(progressInterval);
        setUploadProgress(100);

        toast({ title: 'Document uploaded successfully' });
        onUploadComplete?.(result.id);
      } catch (err) {
        toast({
          title: 'Upload failed',
          description: err instanceof Error ? err.message : 'An error occurred during upload.',
          variant: 'destructive',
        });
      } finally {
        setIsUploading(false);
      }
    },
    [
      selectedFile,
      title,
      description,
      classification,
      tags,
      fileHash,
      _relatedCaseId,
      _relatedContactId,
      createDocumentMutation,
      onUploadComplete,
    ]
  );

  // ─── Cancel ───────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    setSelectedFile(null);
    setFileHash(null);
    setTitle('');
    setDescription('');
    setClassification('INTERNAL');
    setTags('');
    setUploadProgress(0);
    onCancel?.();
  }, [onCancel]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Drop Zone */}
      {}
      <button // NOSONAR — file drop zone with nested interactive elements (Remove button)
        type="button"
        tabIndex={0}
        aria-label="Drop files here or click to browse"
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${isDragging ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-600 hover:border-primary/50'}
          ${selectedFile ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-300' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        data-testid="dropzone"
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleFileInputChange}
          tabIndex={-1}
        />

        {selectedFile ? (
          <div className="space-y-2">
            <span className="material-symbols-outlined text-4xl text-emerald-500">
              check_circle
            </span>
            <p className="font-medium text-slate-900 dark:text-white">{selectedFile.name}</p>
            <p className="text-sm text-slate-500">{formatFileSize(selectedFile.size)}</p>
            {fileHash && (
              <p className="text-xs text-slate-400 font-mono truncate max-w-md mx-auto">
                SHA-256: {fileHash.slice(0, 16)}...
              </p>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                removeFile();
              }}
              aria-label="Remove selected file"
            >
              Remove file
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <span className="material-symbols-outlined text-4xl text-slate-400">cloud_upload</span>
            <p className="text-slate-700 dark:text-slate-300">
              Drag and drop a file here, or{' '}
              <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-sm text-slate-500">
              Accepted: {ACCEPTED_EXTENSIONS.join(', ')} (max {maxFileSizeMB}MB)
            </p>
          </div>
        )}
      </button>

      {/* Upload Progress */}
      {}
      {isUploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
            <span>Uploading...</span>
            <span>{uploadProgress}%</span>
          </div>
          <progress
            value={uploadProgress}
            max={100}
            aria-label="Upload progress"
            className="w-full h-2 rounded-full appearance-none [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-slate-200 dark:[&::-webkit-progress-bar]:bg-slate-700 [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary"
          />
        </div>
      )}
      {}

      {/* Metadata Form */}
      <Card className="p-6 space-y-4">
        <div>
          <label
            htmlFor="doc-title"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Title <span className="text-red-500">*</span>
          </label>
          <input
            id="doc-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            placeholder="Enter document title"
            aria-required="true"
          />
        </div>

        <div>
          <label
            htmlFor="doc-classification"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Classification
          </label>
          <select
            id="doc-classification"
            value={classification}
            onChange={(e) => setClassification(e.target.value as DocumentClassification)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            {CLASSIFICATION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="doc-tags"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Tags
          </label>
          <input
            id="doc-tags"
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            placeholder="Comma-separated tags (e.g., Legal, Contract, NDA)"
          />
        </div>

        <div>
          <label
            htmlFor="doc-description"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
          >
            Description
          </label>
          <textarea
            id="doc-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            placeholder="Optional description"
          />
        </div>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={handleCancel} disabled={isUploading}>
          Cancel
        </Button>
        <Button type="submit" disabled={!selectedFile || !title.trim() || isUploading}>
          {isUploading ? 'Uploading...' : 'Upload Document'}
        </Button>
      </div>
    </form>
  );
}
