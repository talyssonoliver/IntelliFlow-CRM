import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Deals',
};

export default function DealsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
