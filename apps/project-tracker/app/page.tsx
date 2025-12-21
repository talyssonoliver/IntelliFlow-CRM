'use client';

import { useState, useCallback, useEffect } from 'react';
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
} from 'lucide-react';
import { parseCSV, parseCSVText, type ParsedCSVData } from '@/lib/csv-parser';
import type { Task, SprintNumber } from '@/lib/types';
import DashboardView from '@/components/DashboardView';
import KanbanView from '@/components/KanbanView';
import AnalyticsView from '@/components/AnalyticsView';
import SettingsView from '@/components/SettingsView';
import MetricsView from '@/components/MetricsView';
import GovernanceView from '@/components/GovernanceView';
import AuditView from '@/components/AuditView';
import TaskModal from '@/components/TaskModal';

type Page = 'dashboard' | 'kanban' | 'analytics' | 'metrics' | 'governance' | 'audit' | 'settings';

export default function Home() {
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [sprints, setSprints] = useState<SprintNumber[]>([]);
  const [currentSprint, setCurrentSprint] = useState<SprintNumber>(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      const data: ParsedCSVData = await parseCSV(file);
      setAllTasks(data.tasks);
      setSections(data.sections);
      setSprints(data.sprints);
      if (data.sprints.length > 0) {
        setCurrentSprint(data.sprints[0]);
      }
    } catch (error) {
      console.error('Error parsing CSV:', error);
      alert('Failed to parse CSV file. Please check the format.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedTask(null);
  }, []);

  // Sync metrics from CSV
  const syncMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/sync-metrics', {
        method: 'POST',
        cache: 'no-store',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Metrics synced successfully:', result);
        return true;
      } else {
        console.error('Sync failed:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('Error syncing metrics:', error);
      return false;
    }
  }, []);

  // Load Sprint_plan.csv
  const loadSprintPlan = useCallback(async () => {
    setIsLoading(true);
    try {
      // Add timestamp to prevent caching
      const timestamp = Date.now();
      const response = await fetch(`/api/sprint-plan?t=${timestamp}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
      });
      if (!response.ok) {
        throw new Error('Failed to load Sprint plan');
      }
      const csvText = await response.text();
      const data: ParsedCSVData = parseCSVText(csvText);

      // Debug logging
      console.log('CSV loaded at:', new Date().toLocaleTimeString());
      console.log('Total tasks:', data.tasks.length);
      console.log('Task statuses:', {
        planned: data.tasks.filter((t) => t.status === 'Planned').length,
        inProgress: data.tasks.filter((t) => t.status === 'In Progress').length,
        completed: data.tasks.filter((t) => t.status === 'Completed').length,
        blocked: data.tasks.filter((t) => t.status === 'Blocked').length,
      });

      setAllTasks(data.tasks);
      setSections(data.sections);
      setSprints(data.sprints);
      setLastUpdated(new Date());
      if (data.sprints.length > 0 && currentSprint === 0) {
        setCurrentSprint(data.sprints[0]);
      }

      // Auto-sync metrics after loading CSV
      console.log('Auto-syncing metrics...');
      await syncMetrics();
    } catch (error) {
      console.error('Error loading Sprint plan:', error);
      // Don't show alert on auto-load failure, user can still upload manually
    } finally {
      setIsLoading(false);
    }
  }, [currentSprint, syncMetrics]);

  // Auto-load on mount only (no polling)
  useEffect(() => {
    loadSprintPlan();
  }, [loadSprintPlan]);

  const filteredTasks =
    currentSprint === 'all' ? allTasks : allTasks.filter((t) => t.sprint === currentSprint);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gray-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
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
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === 'all') {
                      setCurrentSprint('all');
                    } else if (value === 'Continuous') {
                      setCurrentSprint('Continuous');
                    } else {
                      setCurrentSprint(Number.parseInt(value, 10));
                    }
                  }}
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
                onClick={loadSprintPlan}
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
            {currentPage === 'audit' && <AuditView />}
            {currentPage === 'settings' && <SettingsView />}
          </>
        )}
      </main>

      {/* Task Modal */}
      {selectedTask && <TaskModal task={selectedTask} onClose={handleCloseModal} />}
    </div>
  );
}
