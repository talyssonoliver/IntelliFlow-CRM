'use client';

import { useCallback, useRef, useState } from 'react';

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

function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'image';
  if (type.includes('pdf') || type.includes('document') || type.includes('text'))
    return 'description';
  return 'attach_file';
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
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- drag/drop handlers required on drop zone */}
      <section
        aria-label="File drop zone"
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
        <span className="material-symbols-outlined text-base mr-2" aria-hidden="true">
          attach_file
        </span>
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
      </section>

      {/* File size errors */}
      {oversizedFiles.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          <span>{oversizedFiles.map((f) => f.name).join(', ')} exceeds 25MB limit</span>
        </div>
      )}
      {totalExceeded && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            error
          </span>
          <span>Total size exceeds 50MB limit ({formatFileSize(totalSize)})</span>
        </div>
      )}

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              attach_file
            </span>
            <span>{files.length}</span> file{files.length === 1 ? '' : 's'} attached
          </div>
          {files.map((file, i) => {
            const iconName = getFileIcon(file.type);
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
                  <span
                    className="material-symbols-outlined text-base text-muted-foreground"
                    aria-hidden="true"
                  >
                    {iconName}
                  </span>
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
                  <span className="material-symbols-outlined text-base" aria-hidden="true">
                    close
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
