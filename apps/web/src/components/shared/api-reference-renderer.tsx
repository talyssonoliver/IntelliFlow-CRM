'use client';

import { ApiReferenceReact } from '@scalar/api-reference-react';
import '@scalar/api-reference-react/style.css';

interface ApiReferenceRendererProps {
  configuration: Record<string, unknown>;
}

export function ApiReferenceRenderer({ configuration }: Readonly<ApiReferenceRendererProps>) {
  return <ApiReferenceReact configuration={configuration} />;
}
