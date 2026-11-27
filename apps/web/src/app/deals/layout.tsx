import type { Metadata } from 'next';
import { UnsavedChangesProvider } from '@/hooks/useUnsavedChanges';

export const metadata: Metadata = {
  title: 'Deals',
};

// The new-deal page tracks unsaved edits through useFormUnsavedChanges, which needs this
// provider (leads and contacts layouts wrap theirs the same way).
export default function DealsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <UnsavedChangesProvider>{children}</UnsavedChangesProvider>;
}
