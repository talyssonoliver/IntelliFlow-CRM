import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent Approvals | IntelliFlow CRM',
  description: 'Review and approve AI agent-initiated changes',
};

export default function AgentApprovalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
