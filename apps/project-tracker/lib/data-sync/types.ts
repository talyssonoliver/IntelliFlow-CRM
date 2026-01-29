/**
 * Data Sync Types
 */

export interface SyncResult {
  success: boolean;
  filesUpdated: string[];
  errors: string[];
  summary: {
    tasksProcessed: number;
    filesWritten: number;
    timeElapsed: number;
  };
}

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface DependencyNode {
  task_id: string;
  sprint: number;
  status: 'DONE' | 'IN_PROGRESS' | 'BLOCKED' | 'PLANNED' | 'BACKLOG' | 'FAILED';
  dependencies: string[];
  dependents: string[];
}

export interface CrossSprintDep {
  from_task: string;
  to_task: string;
  from_sprint: number;
  to_sprint: number;
  dependency_type: 'REQUIRED' | 'OPTIONAL' | 'BLOCKED_BY';
  description?: string;
}

export interface CriticalPath {
  name: string;
  tasks: string[];
  total_duration_estimate_minutes: number;
  completion_percentage: number;
  blocking_status: string;
}

export interface TaskRecord {
  'Task ID': string;
  Section?: string;
  Description?: string;
  Owner?: string;
  Dependencies?: string;
  CleanDependencies?: string;
  CrossQuarterDeps?: string;
  'Pre-requisites'?: string;
  'Definition of Done'?: string;
  Status?: string;
  KPIs?: string;
  'Target Sprint'?: string;
  'Artifacts To Track'?: string;
  'Validation Method'?: string;
  // PMBOK Schedule columns
  'Estimate (O/M/P)'?: string;
  'Planned Start'?: string;
  'Planned Finish'?: string;
  'Percent Complete'?: string;
  'Dependency Types'?: string;
}

export interface SafeUpdateResult {
  success: boolean;
  file: string;
  error?: string;
}
