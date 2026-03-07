'use client';

import { useCallback, useRef, useState } from 'react';
import { Paperclip, X, FileText, Image, File, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttachmentManagerProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  maxFileSize?: number; // bytes, default 25MB
  maxTotalSize?: number; // bytes, default 50MB
  className?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
  if (type.startsWith('image/')) return Image;
  if (type.includes('pdf') || type.includes('document') || type.includes('text')) return FileText;
  return File;
}

export function AttachmentManager({
  files,
  onFilesChange,
  maxFileSize = 25 * 1024 * 1024,
  maxTotalSize = 50 * 1024 * 1024,
  className,
}: Readonly<AttachmentManagerProps>) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const oversizedFiles = files.filter((f) => f.size > maxFileSize);
  const totalExceeded = totalSize > maxTotalSize;

  const addFiles = useCallback(
    (newFiles: FileList | File[]) => {
      const arr = Array.from(newFiles);
      onFilesChange([...files, ...arr]);
    },
    [files, onFilesChange]
  );

  const removeFile = useCallback(
    (index: number) => {
      onFilesChange(files.filter((_, i) => i !== index));
    },
    [files, onFilesChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  return (
    <div className={cn('space-y-2', className)}>
      {/* Drop zone */}
      <div // NOSONAR typescript:S6848 — drop zone is a non-interactive container; drag events (onDragOver/onDrop) are valid on any element per HTML spec
        data-testid="drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex items-center justify-center rounded-md border-2 border-dashed p-3 text-sm text-muted-foreground transition-colors',
          isDragOver
            ? 'border-primary bg-primary/5 ring-2 ring-primary/20 highlight'
            : 'border-border'
        )}
      >
        <Paperclip className="mr-2 h-4 w-4" />
        <span>Drop files here or</span>
        <button
          type="button"
          aria-label="Attach file"
          className="ml-1 font-medium text-primary underline-offset-2 hover:underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded"
          onClick={() => fileInputRef.current?.click()}
        >
          browse
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* File size errors */}
      {oversizedFiles.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>{oversizedFiles.map((f) => f.name).join(', ')} exceeds 25MB limit</span>
        </div>
      )}
      {totalExceeded && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span>Total size exceeds 50MB limit ({formatFileSize(totalSize)})</span>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="h-3 w-3" />
            <span>{files.length}</span>{' '}file{files.length === 1 ? '' : 's'} attached
          </div>
          {files.map((file, i) => {
            const Icon = getFileIcon(file.type);
            const isImage = file.type.startsWith('image/');
            return (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                {isImage ? (
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="h-8 w-8 rounded object-cover"
                  />
                ) : (
                  <Icon className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="flex-1 truncate">
                  <div className="truncate font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">{formatFileSize(file.size)}</div>
                </div>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={() => removeFile(i)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
