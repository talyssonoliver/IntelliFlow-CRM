import type { Metadata } from 'next';
import { UnsavedChangesProvider } from '@/hooks/useUnsavedChanges';

export const metadata: Metadata = {
  title: 'Contacts',
};

export default function ContactsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <UnsavedChangesProvider>{children}</UnsavedChangesProvider>;
}
