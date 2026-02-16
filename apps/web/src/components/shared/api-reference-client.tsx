'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { ErrorBoundary } from 'react-error-boundary';
import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

interface ApiReferenceClientProps {
  specUrl: string;
}

export function ApiReferenceClient({ specUrl }: ApiReferenceClientProps) {
  const { resolvedTheme } = useTheme();
  const [spec, setSpec] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    fetch(specUrl, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load: ${res.statusText}`);
        return res.json();
      })
      .then((data) => {
        setSpec(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setError(err.message);
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [specUrl]);

  if (isLoading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="flex items-center justify-center py-12"
      >
        <span className="text-muted-foreground">Loading API documentation...</span>
        <span className="sr-only">Loading API reference, please wait...</span>
      </div>
    );
  }

  if (error || !spec) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="mx-8 rounded-lg border border-destructive bg-destructive/10 p-6"
      >
        <h2 className="text-lg font-semibold text-destructive">Error Loading API Reference</h2>
        <p className="text-sm text-destructive/90 mt-1">{error || 'Unknown error'}</p>
        <button onClick={() => window.location.reload()} className="mt-4 text-sm underline">
          Retry
        </button>
      </div>
    );
  }

  return (
    <ErrorBoundary
      fallback={<div className="p-8 text-destructive">Failed to render API reference.</div>}
    >
      <div className="h-full overflow-auto" style={{ contain: 'strict' }}>
        <ApiReferenceReact
          configuration={{
            spec: { content: spec },
            darkMode: resolvedTheme === 'dark',
            layout: 'modern',
            showSidebar: true,
            searchHotKey: 'k',
            defaultHttpClient: { targetKey: 'javascript', clientKey: 'fetch' },
          }}
        />
      </div>
      <div aria-live="polite" className="sr-only">
        API documentation loaded successfully
      </div>
    </ErrorBoundary>
  );
}
