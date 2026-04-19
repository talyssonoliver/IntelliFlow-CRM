'use client';

import dynamic from 'next/dynamic';
import { DocumentSettingsLoading } from './DocumentSettingsLoading';

const DocumentSettingsContent = dynamic(() => import('./DocumentSettingsContent'), {
  ssr: false,
  loading: () => <DocumentSettingsLoading />,
});

export default function DocumentSettingsPage() {
  return <DocumentSettingsContent />;
}
