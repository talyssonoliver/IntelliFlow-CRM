import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tickets',
};

export default function TicketsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
