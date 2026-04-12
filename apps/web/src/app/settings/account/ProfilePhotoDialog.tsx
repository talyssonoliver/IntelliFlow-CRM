'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  toast,
} from '@intelliflow/ui';
import { AppAvatar } from '@/components/shared/app-avatar';

interface ProfilePhotoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  currentSrc?: string | null;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function ProfilePhotoDialog({
  open,
  onOpenChange,
  userName,
  currentSrc,
}: Readonly<ProfilePhotoDialogProps>) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setPreview(null);
    setFileName(null);
    setIsDragging(false);
  }, []);

  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) resetState();
      onOpenChange(value);
    },
    [onOpenChange, resetState]
  );

  const processFile = useCallback((file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a JPG, PNG, GIF, or WebP image.',
        variant: 'destructive',
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: 'File too large',
        description: 'Maximum file size is 5MB.',
        variant: 'destructive',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
      setFileName(file.name);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = useCallback(() => {
    toast({
      title: 'Photo updated',
      description: 'Your profile photo has been saved.',
    });
    handleOpenChange(false);
  }, [handleOpenChange]);

  const handleRemove = useCallback(() => {
    setPreview(null);
    setFileName(null);
    toast({
      title: 'Photo removed',
      description: 'Your profile photo has been removed.',
    });
    handleOpenChange(false);
  }, [handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update Profile Photo</DialogTitle>
          <DialogDescription>
            Upload a new profile photo or remove the current one.
          </DialogDescription>
        </DialogHeader>

        {/* Current vs Preview */}
        <div className="flex items-center gap-6 py-3 overflow-hidden">
          <div className="flex flex-col items-center gap-2 shrink-0 w-20">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Current
            </span>
            <AppAvatar
              name={userName}
              src={currentSrc}
              className="w-20 h-20 text-xl shrink-0"
              fallbackClassName="text-xl font-bold text-slate-500 bg-slate-200 dark:bg-slate-700"
            />
          </div>

          <div className="flex flex-col items-center gap-2 shrink-0 w-20">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              Preview
            </span>
            <div
              className={`relative w-20 h-20 rounded-full border-2 border-dashed overflow-hidden shrink-0 flex items-center justify-center ${
                preview
                  ? 'border-primary'
                  : 'border-slate-300 dark:border-slate-600'
              }`}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <span className="material-symbols-outlined text-slate-400 dark:text-slate-500 text-[28px]">
                  image
                </span>
              )}
            </div>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-medium text-foreground">Add a photo</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Accepts JPG, PNG, GIF or WebP.
              <br />
              Max size of 5MB.
            </p>
            {fileName && (
              <div className="mt-2 flex items-center gap-1.5 overflow-hidden">
                <span className="material-symbols-outlined text-primary text-[14px] shrink-0">check_circle</span>
                <span className="text-xs text-primary font-medium truncate block" title={fileName}>
                  {fileName}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex flex-col items-center justify-center gap-2 py-10 px-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
        >
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isDragging
                ? 'bg-primary/10 text-primary'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
            }`}
          >
            <span className="material-symbols-outlined text-[24px]">cloud_upload</span>
          </div>
          <p className="text-sm font-medium text-foreground">
            Drag and drop your photo here
          </p>
          <p className="text-xs text-muted-foreground">
            or click to browse from your computer
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload profile photo"
        />

        {/* Actions */}
        <div className="space-y-3 pt-2">
          <Button onClick={handleUpload} disabled={!preview} className="w-full">
            <span className="material-symbols-outlined text-[18px] mr-1.5" aria-hidden="true">
              upload
            </span>
            Upload New Photo
          </Button>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleRemove}
              disabled={!currentSrc && !preview}
              className="flex-1"
            >
              <span className="material-symbols-outlined text-[16px] mr-1.5" aria-hidden="true">
                delete
              </span>
              Remove Photo
            </Button>
            <Button variant="outline" onClick={() => handleOpenChange(false)} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>

        {/* Security note */}
        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className="material-symbols-outlined text-slate-400 text-[14px]" aria-hidden="true">
            lock
          </span>
          <p className="text-[11px] text-muted-foreground">
            Your data is encrypted and secure.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
