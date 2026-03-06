import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help Center',
};

export default function HelpCenterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
