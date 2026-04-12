import type { Metadata } from 'next';
import AgentApprovalsLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'AI Agent Approvals',
};

export default function AgentApprovalsLayout({
  children,
}: Readonly<{ readonly children: React.ReactNode }>) {
  return <AgentApprovalsLayoutShell>{children}</AgentApprovalsLayoutShell>;
}
