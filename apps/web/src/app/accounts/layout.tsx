import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Accounts',
};

export default function AccountsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <>{children}</>;
}
