'use client';

/**
 * FileUploader — Drag-and-drop file upload component (PG-047)
 *
 * Reusable component for staging files before form submission.
 * Supports drag-and-drop, click-to-browse, client-side validation.
 *
 * @implements AC-004 (drag-and-drop + click-to-browse)
 * @implements AC-005 (filename, size, remove button)
 * @implements AC-006 (max 10MB per file, max 5 files)
 * @implements NF-003 (WCAG 2.1 AA — ARIA labels, keyboard accessible)
 * @implements NF-005 (client-side validation)
 */

import { useCallback, useRef, useState } from 'react';

const DEFAULT_MAX_FILES = 5;
const DEFAULT_MAX_SIZE_MB = 10;

const DEFAULT_ACCEPTED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/zip',
];

export interface FileUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxFiles?: number;
  maxSizeMB?: number;
  disabled?: boolean;
  acceptedTypes?: string[];
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${units[i]}`;
}

function getFileTypeIcon(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type === 'application/pdf') return 'picture_as_pdf';
  if (type === 'application/zip') return 'folder_zip';
  return 'description';
}

export function FileUploader({
  files,
  onChange,
  maxFiles = DEFAULT_MAX_FILES,
  maxSizeMB = DEFAULT_MAX_SIZE_MB,
  disabled = false,
  acceptedTypes = DEFAULT_ACCEPTED_TYPES,
}: Readonly<FileUploaderProps>) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateAndAddFiles = useCallback(
    (newFiles: File[]) => {
      const validationErrors: string[] = [];
      const validFiles: File[] = [];

      for (const file of newFiles) {
        if (files.length + validFiles.length >= maxFiles) {
          validationErrors.push(`Maximum ${maxFiles} files allowed`);
          break;
        }
        if (file.size > maxSizeBytes) {
          validationErrors.push(`"${file.name}" exceeds ${maxSizeMB}MB limit`);
          continue;
        }
        if (!acceptedTypes.includes(file.type)) {
          validationErrors.push(`"${file.name}" has an unsupported file type`);
          continue;
        }
        validFiles.push(file);
      }

      setErrors(validationErrors);
      if (validFiles.length > 0) {
        onChange([...files, ...validFiles]);
      }
    },
    [files, onChange, maxFiles, maxSizeBytes, maxSizeMB, acceptedTypes]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const droppedFiles = Array.from(e.dataTransfer.files);
      validateAndAddFiles(droppedFiles);
    },
    [disabled, validateAndAddFiles]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return;
      const selected = Array.from(e.target.files);
      validateAndAddFiles(selected);
      // Reset input so same file can be re-selected
      e.target.value = '';
    },
    [validateAndAddFiles]
  );

  const handleRemove = useCallback(
    (index: number) => {
      const updated = files.filter((_, i) => i !== index);
      onChange(updated);
      setErrors([]);
    },
    [files, onChange]
  );

  const handleBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  let dropZoneClass: string;
  if (disabled) {
    dropZoneClass =
      'cursor-not-allowed border-slate-200 dark:border-slate-700 bg-slate-100/50 dark:bg-slate-800/30 opacity-60';
  } else if (isDragOver) {
    dropZoneClass = 'border-[#137fec] bg-[#137fec]/5';
  } else {
    dropZoneClass = 'border-slate-300 dark:border-slate-600 hover:border-[#137fec]/50';
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor="file-upload-input"
        className="block text-sm font-semibold text-slate-700 dark:text-slate-300"
      >
        Attachments
      </label>

      {/* Drop zone visual chrome — aria-hidden so drag events on this purely
          visual affordance don't create a11y violations. Keyboard/AT users
          interact via the browse button and file input below. */}
      <div
        aria-hidden="true"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative rounded-lg border-2 border-dashed p-4 text-center transition-colors ${dropZoneClass}`}
      >
        <span className="material-symbols-outlined text-2xl text-slate-400 dark:text-slate-500 mb-1 block">
          cloud_upload
        </span>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Drag &amp; drop files here, or click &quot;Browse&quot; below
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Max {maxSizeMB}MB per file, up to {maxFiles} files
        </p>
      </div>

      {/* Accessible upload button — visible to AT, outside the aria-hidden
          drop zone so screen-reader users can activate file selection. */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleBrowseClick}
          disabled={disabled}
          className="text-[#137fec] text-sm font-medium hover:underline focus:outline-none focus:ring-2 focus:ring-[#137fec]/20 rounded"
        >
          Browse files
        </button>
        <input
          id="file-upload-input"
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedTypes.join(',')}
          onChange={handleFileSelect}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* Error messages */}
      {errors.length > 0 && (
        <div role="alert" className="space-y-1">
          {errors.map((error, i) => (
            <p key={i} className="text-xs text-red-500">
              {error}
            </p>
          ))}
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm"
            >
              <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-lg">
                {getFileTypeIcon(file.type)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="truncate font-medium text-slate-900 dark:text-white">{file.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                className="text-slate-400 hover:text-red-500 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-[#137fec]/20 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
