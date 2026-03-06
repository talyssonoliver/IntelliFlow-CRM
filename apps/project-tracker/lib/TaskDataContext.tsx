'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
} from 'react';
import type { Task, SprintNumber, TaskStatus } from './types';

/**
 * Shared Task Data Context
 *
 * This context provides a single source of truth for task data across all views.
 * Views can subscribe to this context to get consistent data and status counts.
 */

export interface TaskSummary {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  not_started: number;
  failed: number;
}

export interface SectionData {
  name: string;
  total: number;
  done: number;
  progress: number;
}

export interface TaskDataState {
  // Core data
  allTasks: Task[];
  filteredTasks: Task[];
  sections: string[];
  sprints: SprintNumber[];

  // Current selection
  currentSprint: SprintNumber;

  // Pre-computed metrics (from unified-data API)
  statusCounts: TaskSummary;
  sectionData: SectionData[];

  // Metadata
  lastUpdated: Date | null;
  isLoading: boolean;
  error: string | null;
}

export interface TaskDataContextType extends TaskDataState {
  // Actions
  setCurrentSprint: (sprint: SprintNumber) => void;
  refreshData: () => Promise<void>;
  selectTask: (task: Task | null) => void;
  selectedTask: Task | null;
}

const defaultSummary: TaskSummary = {
  total: 0,
  done: 0,
  in_progress: 0,
  blocked: 0,
  not_started: 0,
  failed: 0,
};

const TaskDataContext = createContext<TaskDataContextType | null>(null);

export function useTaskData(): TaskDataContextType {
  const context = useContext(TaskDataContext);
  if (!context) {
    throw new Error('useTaskData must be used within a TaskDataProvider');
  }
  return context;
}

interface TaskDataProviderProps {
  children: ReactNode;
}

export function TaskDataProvider({ children }: TaskDataProviderProps) {
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [sprints, setSprints] = useState<SprintNumber[]>([]);
  const [currentSprint, setCurrentSprintState] = useState<SprintNumber>(0);
  const [statusCounts, setStatusCounts] = useState<TaskSummary>(defaultSummary);
  const [sectionData, setSectionData] = useState<SectionData[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Compute filtered tasks based on current sprint
  const filteredTasks =
    currentSprint === 'all' ? allTasks : allTasks.filter((t) => t.sprint === currentSprint);

  // Load data from unified API
  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const timestamp = Date.now();
      const response = await fetch(`/api/unified-data?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load data');
      }

      const data = await response.json();

      // Transform unified data to Task format
      const tasks: Task[] = data.tasks.map((t: any) => ({
        id: t.id,
        section: t.section,
        description: t.description,
        owner: t.owner,
        dependencies: t.dependencies,
        cleanDependencies: t.clean_dependencies,
        crossQuarterDeps: false,
        prerequisites: t.prerequisites,
        dod: t.dod,
        status: t.status as TaskStatus,
        kpis: t.kpis,
        sprint: t.sprint,
        artifacts: t.artifacts,
        validation: t.validation,
      }));

      setAllTasks(tasks);
      setSections(data.unique_sections);
      setSprints(data.unique_sprints);
      setStatusCounts(data.status_counts);
      setSectionData(
        data.sections.map((s: any) => ({
          name: s.name,
          total: s.total,
          done: s.done,
          progress: s.progress,
        }))
      );
      setLastUpdated(new Date(data.last_modified));

      // Auto-select first sprint if none selected
      if (data.unique_sprints.length > 0 && currentSprint === 0) {
        setCurrentSprintState(data.unique_sprints[0]);
      }

      // Sync metrics after loading
      await fetch('/api/sync-metrics', { method: 'POST', cache: 'no-store' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      console.error('Error loading data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentSprint]);

  // Set sprint and trigger re-computation
  const setCurrentSprint = useCallback((sprint: SprintNumber) => {
    setCurrentSprintState(sprint);
  }, []);

  // Select a task (for modal display)
  const selectTask = useCallback((task: Task | null) => {
    setSelectedTask(task);
  }, []);

  // Load data on mount
  useEffect(() => {
    refreshData();
  }, []);

  // Subscribe to SSE for real-time updates
  useEffect(() => {
    let eventSource: EventSource | null = null;

    const connectSSE = () => {
      eventSource = new EventSource('/api/metrics/watch');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.source === 'csv') {
            console.log('[TaskDataContext] CSV changed, reloading...');
            refreshData();
          }
        } catch (err) {
          console.error('[TaskDataContext] SSE parse error:', err);
        }
      };

      eventSource.onerror = () => {
        eventSource?.close();
        setTimeout(connectSSE, 5000);
      };
    };

    connectSSE();

    return () => {
      eventSource?.close();
    };
  }, [refreshData]);

  const value: TaskDataContextType = {
    allTasks,
    filteredTasks,
    sections,
    sprints,
    currentSprint,
    statusCounts,
    sectionData,
    lastUpdated,
    isLoading,
    error,
    setCurrentSprint,
    refreshData,
    selectTask,
    selectedTask,
  };

  return <TaskDataContext.Provider value={value}>{children}</TaskDataContext.Provider>;
}

/**
 * Hook to get status counts for a specific sprint
 * Useful for views that need sprint-specific counts
 */
export function useSprintStatusCounts(sprint: SprintNumber): TaskSummary {
  const { allTasks, statusCounts } = useTaskData();

  // If 'all', return global counts
  if (sprint === 'all') {
    return statusCounts;
  }

  // Otherwise, compute for specific sprint
  const sprintTasks = allTasks.filter((t) => t.sprint === sprint);

  const counts: TaskSummary = {
    total: sprintTasks.length,
    done: 0,
    in_progress: 0,
    blocked: 0,
    not_started: 0,
    failed: 0,
  };

  for (const task of sprintTasks) {
    const status = task.status.toLowerCase();
    if (status === 'completed' || status === 'done') {
      counts.done++;
    } else if (status === 'in progress' || status === 'validating') {
      counts.in_progress++;
    } else if (status === 'blocked' || status === 'needs human') {
      counts.blocked++;
    } else if (status === 'failed') {
      counts.failed++;
      counts.blocked++; // Failed also counts as blocked
    } else {
      counts.not_started++;
    }
  }

  return counts;
}
