import type { Metadata } from 'next';
import { GovernanceSidebar } from '@/components/governance';

export const metadata: Metadata = {
  title: 'Governance | IntelliFlow CRM',
  description: 'Compliance monitoring, ADR registry, and policy management',
};

export default function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <GovernanceSidebar />
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
