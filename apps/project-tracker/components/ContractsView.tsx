'use client';

import { Task } from '@/lib/types';
import ContractComplianceDashboard from './ContractComplianceDashboard';
import ContractAnalyticsView from './ContractAnalyticsView';
import GateValidationTable, { DEFAULT_GATES } from './GateValidationTable';

interface ContractsViewProps {
  tasks: Task[];
  sprint: number | string;
}

export default function ContractsView({ tasks, sprint }: ContractsViewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Contract Enforcement</h1>
          <p className="text-gray-600">
            Machine-enforceable execution contracts for Sprint {sprint}
          </p>
        </div>
      </div>

      {/* Contract Compliance Dashboard */}
      <ContractComplianceDashboard tasks={tasks} sprint={sprint} />

      {/* Gate Validation Table */}
      <GateValidationTable gates={DEFAULT_GATES} sprint={sprint} />

      {/* Contract Analytics */}
      <ContractAnalyticsView tasks={tasks} />
    </div>
  );
}
