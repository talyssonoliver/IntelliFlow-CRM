'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@intelliflow/ui';
import { getMimeTypeIcon } from './document-utils';
import type { DocumentViewerProps } from './types';

// =============================================================================
// DocumentViewer Component
// =============================================================================

export function DocumentViewer({
  documentId: _documentId,
  storageUrl,
  mimeType,
  fileName,
  onClose,
  className = '',
}: Readonly<DocumentViewerProps>) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [textContent, setTextContent] = useState<string | null>(null);

  // ─── Set loading false for non-previewable types ─────────────────────────────

  const isPreviewable =
    mimeType === 'application/pdf' ||
    mimeType.startsWith('image/') ||
    mimeType === 'text/plain' ||
    mimeType === 'text/html';

  useEffect(() => {
    if (!isPreviewable) {
      setIsLoading(false);
    }
  }, [isPreviewable]);

  // ─── Content Loading ────────────────────────────────────────────────────────

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  // ─── Fullscreen Toggle ──────────────────────────────────────────────────────

  const containerRef = useRef<HTMLDivElement>(null);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // Fullscreen not supported or permission denied
    }
  }, []);

  // ─── Print (PDF only) ──────────────────────────────────────────────────────

  const handlePrint = useCallback(() => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  }, []);

  // ─── Render Content by MIME Type ────────────────────────────────────────────

  const renderContent = () => {
    if (hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center" role="alert">
          <span className="material-symbols-outlined text-5xl text-red-400">error</span>
          <p className="mt-4 text-lg font-medium text-slate-900 dark:text-white">
            Failed to load document
          </p>
          <p className="mt-2 text-sm text-slate-500">
            The document could not be displayed. Try downloading it instead.
          </p>
          <a
            href={storageUrl}
            download={fileName}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          >
            <span className="material-symbols-outlined text-sm">download</span>{' '}
            Download {fileName}
          </a>
        </div>
      );
    }

    // PDF → iframe with sandbox
    if (mimeType === 'application/pdf') {
      return (
        <iframe
          ref={iframeRef}
          src={storageUrl}
          title={fileName}
          sandbox="allow-same-origin"
          className="w-full h-full min-h-[600px] border-0"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          data-testid="pdf-viewer"
        />
      );
    }

    // Images → <img> tag
    if (mimeType.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center p-4 overflow-auto">
          <img
            src={storageUrl}
            alt={fileName}
            className="max-w-full max-h-[80vh] object-contain"
            onLoad={handleImageLoad}
            onError={handleImageError}
            data-testid="image-viewer"
          />
        </div>
      );
    }

    // text/plain → <pre> block
    if (mimeType === 'text/plain') {
      if (textContent === null && isLoading) {
        // Fetch text content
        fetch(storageUrl)
          .then((res) => res.text())
          .then((text) => {
            setTextContent(text);
            setIsLoading(false);
          })
          .catch(() => {
            setHasError(true);
            setIsLoading(false);
          });
      }
      return (
        <pre
          className="w-full p-6 overflow-auto bg-slate-50 dark:bg-slate-900 text-sm font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap"
          data-testid="text-viewer"
        >
          {textContent ?? ''}
        </pre>
      );
    }

    // text/html → strict sandboxed iframe
    if (mimeType === 'text/html') {
      return (
        <iframe
          ref={iframeRef}
          src={storageUrl}
          title={fileName}
          sandbox=""
          className="w-full h-full min-h-[600px] border-0"
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          data-testid="html-viewer"
        />
      );
    }

    // Unsupported types → download fallback
    const iconName = getMimeTypeIcon(mimeType);
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        data-testid="download-fallback"
      >
        <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-700">
          <span className="material-symbols-outlined text-5xl text-primary">{iconName}</span>
        </div>
        <p className="mt-4 text-lg font-medium text-slate-900 dark:text-white">{fileName}</p>
        <p className="mt-2 text-sm text-slate-500">
          This file type cannot be previewed in the browser.
        </p>
        <a
          href={storageUrl}
          download={fileName}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
          aria-label={`Download ${fileName}`}
        >
          <span className="material-symbols-outlined text-sm">download</span>{' '}
          Download
        </a>
      </div>
    );
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 ${className}`}
      data-testid="document-viewer"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-700">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
          {fileName}
        </span>
        <div className="flex items-center gap-2">
          {mimeType === 'application/pdf' && (
            <Button variant="ghost" size="sm" onClick={handlePrint} aria-label="Print document">
              <span className="material-symbols-outlined text-[18px]">print</span>
            </Button>
          )}
          <a href={storageUrl} download={fileName} aria-label={`Download ${fileName}`}>
            <Button variant="ghost" size="sm" asChild>
              <span>
                <span className="material-symbols-outlined text-[18px]">download</span>
              </span>
            </Button>
          </a>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </Button>
          {onClose && (
            // eslint-disable-next-line jsx-a11y/no-autofocus
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close viewer" autoFocus>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </Button>
          )}
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 top-12 flex items-center justify-center bg-white/80 dark:bg-slate-900/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-500">Loading document...</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">{renderContent()}</div>
    </div>
  );
}
