import type { Metadata } from 'next';
import GovernanceLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'Governance',
};

export default function GovernanceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <GovernanceLayoutShell>{children}</GovernanceLayoutShell>;
}
