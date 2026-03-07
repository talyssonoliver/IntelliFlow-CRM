import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documents',
};

export default function DocumentsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
