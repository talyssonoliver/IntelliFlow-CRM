/**
 * Case Workflows Page — IFC-031
 *
 * Workflow builder UI for configuring case escalation and resolution flows.
 * CSS for React Flow (@xyflow/react) is imported at page level to prevent
 * FOUC (per NF-007 SSR safety rule — CSS must NOT be in the dynamic component).
 */

import '@xyflow/react/dist/style.css';
import type { Metadata } from 'next';
import { PageHeader } from '@/components/shared/page-header';
import { WorkflowBuilder } from '@/components/workflows/WorkflowBuilder';

export const metadata: Metadata = {
  title: 'Case Workflows | IntelliFlow CRM',
  description: 'Configure escalation and resolution workflows for cases.',
};

export default function CaseWorkflowsPage() {
  return (
    <div className="flex flex-col h-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Cases', href: '/cases' },
          { label: 'Case Workflows' },
        ]}
        title="Case Workflows"
        description="Configure escalation and resolution flows."
      />
      <div className="flex-1 overflow-hidden">
        <WorkflowBuilder />
      </div>
    </div>
  );
}
