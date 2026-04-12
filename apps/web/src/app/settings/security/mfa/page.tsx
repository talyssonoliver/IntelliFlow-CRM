'use client';

/**
 * MFA Management Dashboard
 * PG-125: AC-001, AC-002, AC-004, AC-010, AC-011, AC-012
 */

import dynamic from 'next/dynamic';
import { MfaLoading } from './MfaLoading';

const MfaContent = dynamic(() => import('./MfaContent'), {
  ssr: false,
  loading: () => <MfaLoading />,
});

export default function MfaManagementPage() {
  return <MfaContent />;
}
