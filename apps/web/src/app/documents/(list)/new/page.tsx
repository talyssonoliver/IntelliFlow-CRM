'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';

// Document types from domain model (matching API schema)
type DocumentType = 'CONTRACT' | 'AGREEMENT' | 'EVIDENCE' | 'CORRESPONDENCE' | 'COURT_FILING' | 'MEMO' | 'REPORT' | 'OTHER';
type DocumentClassification = 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'PRIVILEGED';

// Form data structure
interface DocumentFormData {
  // File
  file: File | null;
  // Metadata
  title: string;
  description: string;
  documentType: DocumentType;
  classification: DocumentClassification;
  tags: string[];
  // Relations
  relatedCaseId: string;
  relatedContactId: string;
}

const initialFormData: DocumentFormData = {
  file: null,
  title: '',
  description: '',
  documentType: 'OTHER' as DocumentType, // Default to OTHER until user selects
  classification: 'INTERNAL' as DocumentClassification,
  tags: [],
  relatedCaseId: '',
  relatedContactId: '',
};

// Document type options
const documentTypeOptions = [
  { value: '', label: 'Select document type...' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'AGREEMENT', label: 'Agreement' },
  { value: 'MOTION', label: 'Motion' },
  { value: 'BRIEF', label: 'Brief' },
  { value: 'EVIDENCE', label: 'Evidence' },
  { value: 'CORRESPONDENCE', label: 'Correspondence' },
  { value: 'MEMO', label: 'Memo' },
  { value: 'REPORT', label: 'Report' },
  { value: 'OTHER', label: 'Other' },
];

// Classification options
const classificationOptions = [
  { value: 'PUBLIC', label: 'Public' },
  { value: 'INTERNAL', label: 'Internal' },
  { value: 'CONFIDENTIAL', label: 'Confidential' },
  { value: 'PRIVILEGED', label: 'Privileged (Attorney-Client)' },
];

// Predefined tags
const availableTags = [
  'Legal', 'HR', 'Finance', 'Sales', 'Marketing', 'Operations',
  'Contract', 'Agreement', 'NDA', 'Employment', 'Compliance',
  'Litigation', 'Discovery', 'Due Diligence', 'Real Estate',
];

export default function UploadDocumentPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<DocumentFormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof DocumentFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [tagInput, setTagInput] = useState('');

  // tRPC mutation for creating documents
  const createDocument = trpc.documents.create.useMutation();

  // Update form field
  const updateField = (field: keyof DocumentFormData, value: DocumentFormData[keyof DocumentFormData]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user types
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    // Validate file
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/png',
      'image/jpeg',
    ];

    if (file.size > maxSize) {
      setErrors(prev => ({ ...prev, file: 'File size must be less than 50MB' }));
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      setErrors(prev => ({ ...prev, file: 'File type not supported. Please upload PDF, Word, Excel, Text, or Image files.' }));
      return;
    }

    updateField('file', file);

    // Auto-fill title if empty
    if (!formData.title) {
      const fileName = file.name.replace(/\.[^/.]+$/, ''); // Remove extension
      updateField('title', fileName);
    }
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Remove selected file
  const handleRemoveFile = () => {
    updateField('file', null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Add tag
  const handleAddTag = (tag: string) => {
    if (tag && !formData.tags.includes(tag)) {
      updateField('tags', [...formData.tags, tag]);
      setTagInput('');
    }
  };

  // Remove tag
  const handleRemoveTag = (tag: string) => {
    updateField('tags', formData.tags.filter(t => t !== tag));
  };

  // Handle tag input key press
  const handleTagInputKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      handleAddTag(tagInput.trim());
    }
  };

  // Calculate SHA-256 hash of file
  const calculateFileHash = async (file: File): Promise<string> => {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof DocumentFormData, string>> = {};

    if (!formData.file) {
      newErrors.file = 'Please select a file to upload';
    }

    if (!formData.title.trim()) {
      newErrors.title = 'Document title is required';
    }

    if (!formData.documentType) {
      newErrors.documentType = 'Please select a document type';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 100);

      const file = formData.file!;

      // Calculate file hash
      setUploadProgress(30);
      const sha256Hash = await calculateFileHash(file);

      // NOTE: In a production system, you would upload the file to Supabase Storage
      // or another storage service and get the storageKey. For now, we'll simulate it.
      // TODO: Integrate with Supabase Storage:
      // const { data, error } = await supabase.storage
      //   .from('documents')
      //   .upload(`${Date.now()}-${file.name}`, file);
      // const storageKey = data?.path || '';

      const storageKey = `documents/${Date.now()}-${file.name}`;

      setUploadProgress(50);

      // Create document via tRPC mutation
      await createDocument.mutateAsync({
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        documentType: formData.documentType,
        classification: formData.classification,
        tags: formData.tags,
        storageKey,
        sizeBytes: file.size,
        mimeType: file.type,
        contentHash: sha256Hash, // API expects 'contentHash' not 'sha256Hash'
        relatedCaseId: formData.relatedCaseId || undefined,
        relatedContactId: formData.relatedContactId || undefined,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Success - redirect to documents list
      setTimeout(() => {
        router.push('/documents');
      }, 500);
    } catch (error) {
      console.error('Failed to upload document:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload document. Please try again.';
      alert(errorMessage);
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number) => {
    const kb = bytes / 1024;
    const mb = kb / 1024;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    return `${kb.toFixed(0)} KB`;
  };

  // Get file icon based on type
  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return 'picture_as_pdf';
    if (type.includes('word') || type.includes('document')) return 'description';
    if (type.includes('excel') || type.includes('sheet')) return 'table_chart';
    if (type.includes('image')) return 'image';
    return 'insert_drive_file';
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/documents" className="hover:text-[#137fec]">
          Documents
        </Link>
        <span className="material-symbols-outlined text-[16px]">chevron_right</span>
        <span className="text-slate-900 dark:text-white font-medium">Upload Document</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">
          Upload Document
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-base">
          Upload a new document with metadata, classification, and access control.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl">
        {/* File Upload */}
        <Card className="mb-6 bg-white dark:bg-[#1e2936] border-[#e2e8f0] dark:border-[#334155]">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">File Upload</h2>

            {!formData.file ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-[#137fec] bg-[#137fec]/5'
                    : 'border-slate-300 dark:border-slate-700 hover:border-[#137fec] hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <span className="material-symbols-outlined text-[64px] text-slate-400 mb-4 block">cloud_upload</span>
                <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                  Drop your file here, or click to browse
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                  Supports PDF, Word, Excel, Text, and Image files up to 50MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileInputChange}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.png,.jpg,.jpeg"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 transition-colors"
                >
                  Select File
                </button>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-[#137fec]/10 rounded-lg">
                    <span className="material-symbols-outlined text-[32px] text-[#137fec]">
                      {getFileIcon(formData.file.type)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white truncate">{formData.file.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{formatFileSize(formData.file.size)}</p>
                    {uploadProgress > 0 && uploadProgress < 100 && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                          <span>Uploading...</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#137fec] transition-all duration-300"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {uploadProgress === 100 && (
                      <div className="mt-2 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                        <span className="material-symbols-outlined text-[16px]">check_circle</span>
                        Upload complete
                      </div>
                    )}
                  </div>
                  {!isSubmitting && (
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <span className="material-symbols-outlined text-[20px]">close</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {errors.file && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.file}</p>
            )}
          </div>
        </Card>

        {/* Document Metadata */}
        <Card className="mb-6 bg-white dark:bg-[#1e2936] border-[#e2e8f0] dark:border-[#334155]">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Document Information</h2>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => updateField('title', e.target.value)}
                  className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] transition-colors ${
                    errors.title ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                  placeholder="Enter document title"
                />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.title}</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateField('description', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] transition-colors resize-none"
                  placeholder="Enter document description (optional)"
                />
              </div>

              {/* Document Type and Classification */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Document Type */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Document Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.documentType}
                    onChange={(e) => updateField('documentType', e.target.value)}
                    className={`w-full px-4 py-2 border rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] transition-colors ${
                      errors.documentType ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {documentTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.documentType && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.documentType}</p>
                  )}
                </div>

                {/* Classification */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Classification
                  </label>
                  <select
                    value={formData.classification}
                    onChange={(e) => updateField('classification', e.target.value)}
                    className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] transition-colors"
                  >
                    {classificationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Tags
                </label>
                <div className="space-y-3">
                  {/* Selected Tags */}
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[#137fec]/10 text-[#137fec]"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-[#137fec]/70"
                          >
                            <span className="material-symbols-outlined text-[14px]">close</span>
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tag Input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={handleTagInputKeyPress}
                      className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] transition-colors"
                      placeholder="Type a tag and press Enter"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTag(tagInput.trim())}
                      disabled={!tagInput.trim()}
                      className="px-4 py-2 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Add
                    </button>
                  </div>

                  {/* Suggested Tags */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 mr-2">Suggested:</span>
                    {availableTags
                      .filter(tag => !formData.tags.includes(tag))
                      .slice(0, 8)
                      .map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => handleAddTag(tag)}
                          className="px-2 py-0.5 rounded text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 transition-colors"
                        >
                          + {tag}
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Related Items (Optional) */}
        <Card className="mb-6 bg-white dark:bg-[#1e2936] border-[#e2e8f0] dark:border-[#334155]">
          <div className="p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Related Items (Optional)</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Related Case */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Related Case
                </label>
                <input
                  type="text"
                  value={formData.relatedCaseId}
                  onChange={(e) => updateField('relatedCaseId', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] transition-colors"
                  placeholder="Search for a case..."
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Link this document to a specific case
                </p>
              </div>

              {/* Related Contact */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Related Contact
                </label>
                <input
                  type="text"
                  value={formData.relatedContactId}
                  onChange={(e) => updateField('relatedContactId', e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-[#1e2936] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#137fec] transition-colors"
                  placeholder="Search for a contact..."
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Link this document to a specific contact
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* Form Actions */}
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/documents"
            className="px-6 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex items-center gap-2 px-6 py-2.5 bg-[#137fec] text-white text-sm font-semibold rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
          >
            {isSubmitting ? (
              <>
                <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                Uploading...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[18px]">upload</span>
                Upload Document
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
