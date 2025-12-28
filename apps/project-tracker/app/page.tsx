'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Upload,
  BarChart3,
  Kanban,
  Settings,
  FileText,
  RefreshCw,
  Activity,
  Server,
  Shield,
  Terminal,
  Zap,
} from 'lucide-react';
import { parseCSV, type ParsedCSVData } from '@/lib/csv-parser';
import { useTaskData } from '@/lib/TaskDataContext';
import type { SprintNumber } from '@/lib/types';
import DashboardView from '@/components/DashboardView';
import KanbanView from '@/components/KanbanView';
import AnalyticsView from '@/components/AnalyticsView';
import SettingsView from '@/components/SettingsView';
import MetricsView from '@/components/MetricsView';
import GovernanceView from '@/components/GovernanceView';
import AuditView from '@/components/AuditView';
import ContractsView from '@/components/ContractsView';
import TaskModal from '@/components/TaskModal';
import SprintExecutionView from '@/components/SprintExecutionView';

type Page =
  | 'dashboard'
  | 'kanban'
  | 'analytics'
  | 'metrics'
  | 'governance'
  | 'contracts'
  | 'audit'
  | 'settings'
  | 'sprint-execution';

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');

  // Use shared context for all task data
  const {
    allTasks,
    filteredTasks,
    sections,
    sprints,
    currentSprint,
    setCurrentSprint,
    isLoading,
    lastUpdated,
    refreshData,
    selectTask,
    selectedTask,
  } = useTaskData();

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const data: ParsedCSVData = await parseCSV(file);
        // After uploading, sync to server and refresh
        await fetch('/api/sync-metrics', { method: 'POST' });
        await refreshData();
        console.log('CSV uploaded and synced:', data.tasks.length, 'tasks');
      } catch (error) {
        console.error('Error parsing CSV:', error);
        alert('Failed to parse CSV file. Please check the format.');
      }
    },
    [refreshData]
  );

  const handleTaskClick = useCallback(
    (task: any) => {
      selectTask(task);
    },
    [selectTask]
  );

  const handleCloseModal = useCallback(() => {
    selectTask(null);
  }, [selectTask]);

  const handleSprintChange = useCallback(
    (value: string) => {
      let sprint: SprintNumber;
      if (value === 'all') {
        sprint = 'all';
      } else if (value === 'Continuous') {
        sprint = 'Continuous';
      } else {
        sprint = Number.parseInt(value, 10);
      }
      setCurrentSprint(sprint);
    },
    [setCurrentSprint]
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <FileText className="w-6 h-6" />
                IntelliFlow CRM Tracker
              </h1>
              {lastUpdated && (
                <p className="text-xs text-gray-400 mt-1">
                  Last updated: {lastUpdated.toLocaleTimeString()}
                </p>
              )}
            </div>

            <div className="flex items-center gap-4">
              {/* Sprint Selector */}
              {sprints.length > 0 && (
                <select
                  value={currentSprint}
                  onChange={(e) => handleSprintChange(e.target.value)}
                  className="bg-gray-800 text-white px-4 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Sprints</option>
                  {sprints.map((sprint) => (
                    <option key={sprint} value={sprint}>
                      Sprint {sprint} ({allTasks.filter((t) => t.sprint === sprint).length})
                    </option>
                  ))}
                </select>
              )}

              {/* Refresh Button */}
              <button
                onClick={refreshData}
                disabled={isLoading}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded-lg transition-colors"
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="font-medium">Refresh</span>
              </button>

              {/* Upload Button */}
              <label className="relative cursor-pointer">
                <div className="flex items-center gap-2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded-lg transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="font-medium">Upload CSV</span>
                </div>
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex gap-2 mt-4 overflow-x-auto">
            <button
              onClick={() => setCurrentPage('dashboard')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={() => setCurrentPage('kanban')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'kanban'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Kanban className="w-4 h-4" />
              Kanban
            </button>
            <button
              onClick={() => setCurrentPage('analytics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'analytics'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              Analytics
            </button>
            <button
              onClick={() => setCurrentPage('metrics')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'metrics'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Activity className="w-4 h-4" />
              Metrics
            </button>
            <button
              onClick={() => setCurrentPage('sprint-execution')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'sprint-execution'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Zap className="w-4 h-4" />
              Execution
            </button>
            <button
              onClick={() => setCurrentPage('governance')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'governance'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Shield className="w-4 h-4" />
              Governance
            </button>
            <button
              onClick={() => setCurrentPage('contracts')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'contracts'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Contracts
            </button>
            <button
              onClick={() => setCurrentPage('audit')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'audit'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Terminal className="w-4 h-4" />
              Audit
            </button>
            <button
              onClick={() => setCurrentPage('settings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                currentPage === 'settings'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <Link
              href="/swarm"
              className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold shadow-lg"
            >
              <Server className="w-4 h-4" />
              Swarm Control
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {!isLoading && allTasks.length === 0 && (
          <div className="text-center py-12">
            <Upload className="w-16 h-16 mx-auto text-gray-400 mb-4" />
            <h2 className="text-2xl font-semibold text-gray-700 mb-2">No Data Loaded</h2>
            <p className="text-gray-500 mb-6">Upload your Sprint_plan.csv to get started</p>
            <label className="inline-block cursor-pointer">
              <div className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-colors">
                Choose File
              </div>
              <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        )}

        {!isLoading && allTasks.length > 0 && (
          <>
            {currentPage === 'dashboard' && (
              <DashboardView
                tasks={filteredTasks}
                sections={sections}
                onTaskClick={handleTaskClick}
                sprint={currentSprint}
              />
            )}
            {currentPage === 'kanban' && (
              <KanbanView tasks={filteredTasks} onTaskClick={handleTaskClick} />
            )}
            {currentPage === 'analytics' && (
              <AnalyticsView tasks={filteredTasks} sections={sections} />
            )}
            {currentPage === 'metrics' && <MetricsView selectedSprint={currentSprint} />}
            {currentPage === 'governance' && <GovernanceView selectedSprint={currentSprint} />}
            {currentPage === 'contracts' && (
              <ContractsView tasks={filteredTasks} sprint={currentSprint} />
            )}
            {currentPage === 'audit' && <AuditView />}
            {currentPage === 'settings' && <SettingsView />}
            {currentPage === 'sprint-execution' && (
              <SprintExecutionView
                sprintNumber={typeof currentSprint === 'number' ? currentSprint : undefined}
              />
            )}
          </>
        )}
      </main>

      {/* Task Modal */}
      {selectedTask && <TaskModal task={selectedTask} onClose={handleCloseModal} />}
    </div>
  );
}
