import type { Metadata } from 'next';
import { UnsavedChangesProvider } from '@/hooks/useUnsavedChanges';

export const metadata: Metadata = {
  title: 'Leads',
};

export default function LeadsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <UnsavedChangesProvider>{children}</UnsavedChangesProvider>;
}
