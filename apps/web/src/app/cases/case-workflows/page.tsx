/**
 * Case Workflows Page — IFC-031
 *
 * Workflow builder UI for configuring case escalation and resolution flows.
 * CSS for React Flow (@xyflow/react) is imported at page level to prevent
 * FOUC (per NF-007 SSR safety rule — CSS must NOT be in the dynamic component).
 */

import '@xyflow/react/dist/style.css';
import type { Metadata } from 'next';
import { WorkflowBuilder } from '@/components/workflows/WorkflowBuilder';

export const metadata: Metadata = {
  title: 'Case Workflows | IntelliFlow CRM',
  description: 'Configure escalation and resolution workflows for cases.',
};

export default function CaseWorkflowsPage() {
  // WorkflowBuilder owns its own PageHeader so it can switch
  // breadcrumbs + actions between list and canvas views.
  return (
    <div className="flex flex-col h-full">
      <WorkflowBuilder />
    </div>
  );
}
