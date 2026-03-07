import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contacts',
};

export default function ContactsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
