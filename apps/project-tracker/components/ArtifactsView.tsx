'use client';

import * as React from 'react';
import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  FolderOpen,
  Clock,
  ChevronDown,
  Trash2,
  BarChart3,
  Package,
  Code,
  FileCode,
  Settings,
  Book,
  Wrench,
  TestTube,
  HardDrive,
  Archive,
  EyeOff,
  Play,
  Activity,
  Square,
  CheckSquare,
  Loader2,
  History,
  User,
  Calendar,
  Sparkles,
  Download,
} from 'lucide-react';

// =============================================================================
// TYPES
// =============================================================================

type FileCategory =
  | 'app-source' | 'package-source' | 'test-source'
  | 'attestation' | 'benchmark' | 'coverage' | 'report' | 'metric' | 'log' | 'generated'
  | 'ci-config' | 'infra-config' | 'tool-config' | 'claude-config'
  | 'docs' | 'readme' | 'tool' | 'script' | 'misc';

type DirectoryType =
  | 'apps' | 'packages' | 'docs' | 'infra' | 'scripts' | 'tools'
  | 'artifacts' | 'tests' | '.claude' | '.github' | '.specify' | 'root';

interface FileEntry {
  path: string;
  absolutePath: string;
  exists: boolean;
  type: 'file' | 'directory';
  size: number;
  lastModified: string;
  linkedTasks: string[];
  isOrphan: boolean;
  category: FileCategory;
  directory: DirectoryType;
  extension: string;
  isTestFile: boolean;
  hasTest: boolean;
}

interface DirectorySummary {
  directory: DirectoryType;
  fileCount: number;
  totalSize: number;
  linkedCount: number;
  orphanCount: number;
  byExtension: Record<string, number>;
}

interface CodebaseHealth {
  totalFiles: number;
  totalSize: number;
  linkedFiles: number;
  orphanFiles: number;
  missingFiles: number;
  documentationCoverage: number;
  testCoverage: number;
  byDirectory: DirectorySummary[];
  byCategory: Record<FileCategory, number>;
  byExtension: Record<string, number>;
  lastScanAt: string;
}

interface MissingFile {
  path: string;
  expectedBy: string[];
  prefix: 'ARTIFACT' | 'EVIDENCE' | 'FILE';
}

interface CleanupSuggestion {
  path: string;
  reason: string;
  category: 'orphan' | 'large-file' | 'stale' | 'duplicate-name';
  size: number;
  lastModified: string;
  priority: 'high' | 'medium' | 'low';
}

interface RegistryResponse {
  files: FileEntry[];
  health: CodebaseHealth;
  missing: MissingFile[];
  cleanup: CleanupSuggestion[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface CodeAnalysisResult {
  source: string;
  timestamp?: string;
  knip?: {
    success: boolean;
    data?: {
      files: string[];
      dependencies: string[];
      devDependencies: string[];
      exports: Array<{ file: string; exports: string[] }>;
      types: Array<{ file: string; types: string[] }>;
    };
    summary?: {
      unusedFiles: number;
      unusedDeps: number;
      unusedExports: number;
      unusedTypes: number;
    };
    error?: string;
  };
  depcheck?: {
    success: boolean;
    data?: {
      dependencies: string[];
      devDependencies: string[];
      missing: Record<string, string[]>;
    };
    summary?: {
      unusedDeps: number;
      unusedDevDeps: number;
      missingDeps: number;
    };
    error?: string;
  };
}

interface ActionResult {
  path: string;
  success: boolean;
  error?: string;
  newPath?: string;
}

interface ActionResponse {
  action: string;
  total: number;
  success: number;
  failed: number;
  results: ActionResult[];
}

interface FileHistoryEntry {
  path: string;
  exists: boolean;
  createdAt: string | null;
  createdBy: string | null;
  createdInCommit: string | null;
  createdPurpose: string | null;
  createdTaskId: string | null;
  lastModifiedAt: string | null;
  lastModifiedBy: string | null;
  lastModifiedCommit: string | null;
  lastModifiedMessage: string | null;
  daysSinceModified: number | null;
  isStale: boolean;
  staleReason: string | null;
  fsCreatedAt: string | null;
  fsModifiedAt: string | null;
}

interface HistoryResponse {
  summary: {
    totalFiles: number;
    staleFiles: number;
    trackedInGit: number;
    untrackedFiles: number;
    withTaskId: number;
    staleDaysThreshold: number;
  };
  files: FileHistoryEntry[];
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDirectoryIcon(dir: DirectoryType) {
  const icons: Record<DirectoryType, React.ReactNode> = {
    apps: <Code className="w-4 h-4" />,
    packages: <Package className="w-4 h-4" />,
    docs: <Book className="w-4 h-4" />,
    infra: <Settings className="w-4 h-4" />,
    scripts: <FileCode className="w-4 h-4" />,
    tools: <Wrench className="w-4 h-4" />,
    artifacts: <FolderOpen className="w-4 h-4" />,
    tests: <TestTube className="w-4 h-4" />,
    '.claude': <Settings className="w-4 h-4" />,
    '.github': <Settings className="w-4 h-4" />,
    '.specify': <FileText className="w-4 h-4" />,
    root: <HardDrive className="w-4 h-4" />,
  };
  return icons[dir] || <FolderOpen className="w-4 h-4" />;
}

function getDirectoryColor(dir: DirectoryType): string {
  const colors: Record<DirectoryType, string> = {
    apps: 'bg-blue-100 text-blue-800',
    packages: 'bg-purple-100 text-purple-800',
    docs: 'bg-green-100 text-green-800',
    infra: 'bg-orange-100 text-orange-800',
    scripts: 'bg-cyan-100 text-cyan-800',
    tools: 'bg-yellow-100 text-yellow-800',
    artifacts: 'bg-gray-100 text-gray-800',
    tests: 'bg-pink-100 text-pink-800',
    '.claude': 'bg-indigo-100 text-indigo-800',
    '.github': 'bg-slate-100 text-slate-800',
    '.specify': 'bg-teal-100 text-teal-800',
    root: 'bg-stone-100 text-stone-800',
  };
  return colors[dir] || 'bg-gray-100 text-gray-800';
}

function getPriorityColor(priority: 'high' | 'medium' | 'low'): string {
  const colors = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-gray-100 text-gray-600 border-gray-200',
  };
  return colors[priority];
}

// =============================================================================
// COMPONENT
// =============================================================================

interface ArtifactsViewProps {
  readonly onTaskClick?: (taskId: string) => void;
}

type ViewTab = 'overview' | 'files' | 'cleanup' | 'missing' | 'history' | 'code-health';

export default function ArtifactsView({ onTaskClick }: ArtifactsViewProps) {
  const [data, setData] = useState<RegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('overview');
  const [directoryFilter, setDirectoryFilter] = useState<DirectoryType | 'all'>('all');
  const [orphanFilter, setOrphanFilter] = useState<'all' | 'orphans' | 'linked'>('all');
  const [page, setPage] = useState(1);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Cleanup action states
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Code analysis states
  const [codeAnalysis, setCodeAnalysis] = useState<CodeAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  // History states
  const [historyData, setHistoryData] = useState<HistoryResponse | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<'all' | 'stale' | 'with-task'>('all');
  const [staleDays, setStaleDays] = useState(30);

  // Prompt generation states
  const [generatingPrompt, setGeneratingPrompt] = useState<string | null>(null);
  const [generatedPrompt, setGeneratedPrompt] = useState<{ dir: string; content: string } | null>(null);

  // Folder navigation state
  const [currentPath, setCurrentPath] = useState<string>(''); // Empty = root

  const fetchData = useCallback(async (refresh = false) => {
    setLoading(true);
    setError(null);

    try {
      // Fetch ALL files (large pageSize to get everything)
      const params = new URLSearchParams({
        page: '1',
        pageSize: '10000',
        scope: 'all',
      });

      if (refresh) {
        params.set('refresh', 'true');
      }

      if (directoryFilter !== 'all') {
        params.set('directory', directoryFilter);
      }

      if (orphanFilter === 'orphans') {
        params.set('orphans', 'true');
      } else if (orphanFilter === 'linked') {
        params.set('linked', 'true');
      }

      const response = await fetch(`/api/artifacts?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch data');
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [page, directoryFilter, orphanFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleDir = (dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) {
        next.delete(dir);
      } else {
        next.add(dir);
      }
      return next;
    });
  };

  // Toggle selection for cleanup item
  const toggleSelection = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Select/deselect all cleanup items
  const toggleSelectAll = () => {
    if (selectedPaths.size === cleanup.length) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(cleanup.map((item) => item.path)));
    }
  };

  // Execute cleanup action
  const executeAction = async (action: 'delete' | 'archive' | 'ignore') => {
    if (selectedPaths.size === 0) return;

    setActionLoading(action);
    setActionMessage(null);

    try {
      const response = await fetch('/api/artifacts/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          paths: Array.from(selectedPaths),
        }),
      });

      const result: ActionResponse = await response.json();

      if (!response.ok) {
        throw new Error(result.action || 'Action failed');
      }

      setActionMessage({
        type: result.failed > 0 ? 'error' : 'success',
        text: `${action}: ${result.success}/${result.total} successful${result.failed > 0 ? `, ${result.failed} failed` : ''}`,
      });

      // Clear selection and refresh
      setSelectedPaths(new Set());
      fetchData(true);
    } catch (err) {
      setActionMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Action failed',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Fetch code analysis
  const fetchCodeAnalysis = async (runFresh = false) => {
    setAnalysisLoading(true);

    try {
      const response = await fetch('/api/code-analysis', {
        method: runFresh ? 'POST' : 'GET',
      });

      const result = await response.json();
      setCodeAnalysis(result);
    } catch (err) {
      console.error('Failed to fetch code analysis:', err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // Load cached analysis on mount
  useEffect(() => {
    fetchCodeAnalysis(false);
  }, []);

  // Fetch file history
  const fetchHistory = async (staleOnly = false) => {
    setHistoryLoading(true);

    try {
      const params = new URLSearchParams({
        staleDays: staleDays.toString(),
      });

      if (staleOnly) {
        params.set('stale', 'true');
      }

      const response = await fetch(`/api/artifacts/history?${params}`);
      const result = await response.json();
      setHistoryData(result);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Load history when tab is activated
  useEffect(() => {
    if (activeTab === 'history' && !historyData && !historyLoading) {
      fetchHistory();
    }
  }, [activeTab, historyData, historyLoading]);

  // Generate file audit prompt for a folder path
  const generateFileAuditPrompt = async (folderPath: string) => {
    setGeneratingPrompt(folderPath);

    try {
      // Get files at this folder path (not just top-level directory)
      const folderFiles = files.filter((f) => f.path.startsWith(folderPath + '/'));
      const orphanFiles = folderFiles.filter((f) => f.isOrphan);
      const linkedFiles = folderFiles.filter((f) => !f.isOrphan);

      // Generate the prompt
      const prompt = `# File Audit Prompt for \`${folderPath}/\`

## Mission Brief

You are auditing the **${folderPath}/** folder to identify files that need to be:
1. **Linked to an existing task** in Sprint_plan.csv
2. **Created as a new EXP (Exception) task** for proper documentation/refactoring

**Folder Path**: ${folderPath}
**Total Files**: ${folderFiles.length}
**Orphan Files**: ${orphanFiles.length} (not linked to any task)
**Linked Files**: ${linkedFiles.length}

---

## Orphan Files Requiring Review

These files exist but are NOT linked to any task in Sprint_plan.csv:

| File | Size | Last Modified | Suggested Action |
|------|------|---------------|------------------|
${orphanFiles.slice(0, 50).map((f) => `| \`${f.path}\` | ${formatBytes(f.size)} | ${formatDate(f.lastModified)} | _Review needed_ |`).join('\n')}
${orphanFiles.length > 50 ? `\n*...and ${orphanFiles.length - 50} more orphan files*\n` : ''}

---

## Action Required

For each orphan file, determine:

### Option 1: Link to Existing Task
If the file was created as part of an existing task:
1. Find the relevant task ID (IFC-XXX, ENV-XXX-AI, etc.)
2. Add the file path to the task's "Artifacts To Track" column
3. Format: \`ARTIFACT:${folderPath}/filename.ext\` or \`FILE:${folderPath}/filename.ext\`

### Option 2: Create EXP (Exception) Task
If the file needs documentation or is of unclear purpose:

\`\`\`csv
Task ID,Section,Description,Owner,Dependencies,Pre-requisites,Definition of Done,KPIs,Validation Method,Target Sprint,Artifacts To Track,Status
EXP-${folderPath.toUpperCase().replace(/[^A-Z0-9]/g, '-').slice(0, 20)}-001,Cleanup,Audit and document ${folderPath} orphan files,Dev Team (STOA-Quality),None,FILE:audit-matrix.yml,Files reviewed and documented; unused files removed or archived; remaining files linked to tasks,100% files accounted for,AUDIT:manual-review,Continuous,"EVIDENCE:artifacts/attestations/EXP-${folderPath.replace(/\//g, '-').slice(0, 15)}-001/context_ack.json",Backlog
\`\`\`

### Option 3: Delete/Archive
If the file is:
- Generated/build artifact that shouldn't be tracked
- Outdated and no longer needed
- Duplicate of another file

Use the **Artifacts** tab → **Cleanup** to archive or delete.

---

## Linked Files (Reference)

These files ARE already linked to tasks:

${linkedFiles.slice(0, 20).map((f) => `- \`${f.path}\` → ${f.linkedTasks.join(', ')}`).join('\n')}
${linkedFiles.length > 20 ? `\n*...and ${linkedFiles.length - 20} more linked files*` : ''}

---

## Next Steps

1. Review each orphan file to understand its purpose
2. Determine if it belongs to an existing task
3. Create EXP tasks for unclear files
4. Update Sprint_plan.csv with new artifacts
5. Run \`/sync-metrics\` to update the dashboard

---

*Generated by IntelliFlow CRM Project Tracker*
*${new Date().toISOString()}*
`;

      setGeneratedPrompt({ dir: folderPath, content: prompt });
    } catch (err) {
      console.error('Failed to generate prompt:', err);
    } finally {
      setGeneratingPrompt(null);
    }
  };

  // Download prompt as markdown file
  const downloadPrompt = () => {
    if (!generatedPrompt) return;

    const blob = new Blob([generatedPrompt.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FileAudit_${generatedPrompt.dir.replace(/\//g, '_')}_prompt.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center gap-2 text-red-700">
          <XCircle className="w-5 h-5" />
          <span className="font-medium">Error loading codebase data</span>
        </div>
        <p className="text-red-600 mt-2">{error}</p>
        <button
          onClick={() => fetchData(true)}
          className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  const health = data?.health;
  const files = data?.files || [];
  const missing = data?.missing || [];
  const cleanup = data?.cleanup || [];

  // Get folders and files at current path level for navigation
  const getFolderContents = (basePath: string) => {
    // Get all files under this path
    const filesAtPath = basePath === ''
      ? files
      : files.filter((f) => f.path.startsWith(basePath + '/'));

    // Build folder structure
    const folderMap = new Map<string, {
      path: string;
      name: string;
      fileCount: number;
      totalSize: number;
      linkedCount: number;
      orphanCount: number;
      hasSubFolders: boolean;
    }>();

    // Files directly in current folder (not in subfolders)
    const directFiles: FileEntry[] = [];

    filesAtPath.forEach((file) => {
      // Get the relative path from basePath
      const relativePath = basePath === '' ? file.path : file.path.slice(basePath.length + 1);
      const parts = relativePath.split('/');

      if (parts.length === 1) {
        // Direct file in this folder
        directFiles.push(file);
      } else {
        // File is in a subfolder
        const folderName = parts[0];
        const folderPath = basePath === '' ? folderName : `${basePath}/${folderName}`;

        if (!folderMap.has(folderPath)) {
          folderMap.set(folderPath, {
            path: folderPath,
            name: folderName,
            fileCount: 0,
            totalSize: 0,
            linkedCount: 0,
            orphanCount: 0,
            hasSubFolders: false,
          });
        }

        const folder = folderMap.get(folderPath)!;
        folder.fileCount++;
        folder.totalSize += file.size;
        if (file.isOrphan) {
          folder.orphanCount++;
        } else {
          folder.linkedCount++;
        }

        // Check if has subfolders (more than one level deep)
        if (parts.length > 2) {
          folder.hasSubFolders = true;
        }
      }
    });

    // Convert to sorted array
    const folders = Array.from(folderMap.values()).sort((a, b) => {
      // Sort by orphan count (descending) then by name
      if (b.orphanCount !== a.orphanCount) {
        return b.orphanCount - a.orphanCount;
      }
      return a.name.localeCompare(b.name);
    });

    return { folders, directFiles };
  };

  const getBreadcrumbs = () => {
    if (!currentPath) return [];
    return currentPath.split('/').map((part, index, arr) => ({
      name: part,
      path: arr.slice(0, index + 1).join('/'),
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Codebase Registry</h2>
          <p className="text-sm text-gray-500 mt-1">
            Full project file tracking, health metrics, and cleanup suggestions
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={loading}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
            loading
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Scanning...' : 'Refresh'}
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-4">
          {[
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'files', label: 'All Files', icon: FolderOpen },
            { id: 'cleanup', label: 'Cleanup', icon: Trash2, badge: cleanup.length },
            { id: 'missing', label: 'Missing', icon: XCircle, badge: missing.length },
            { id: 'history', label: 'History', icon: History, badge: historyData?.summary?.staleFiles },
            { id: 'code-health', label: 'Code Health', icon: Activity, badge: codeAnalysis?.knip?.summary?.unusedFiles },
          ].map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as ViewTab)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                activeTab === id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
              {badge !== undefined && badge > 0 && (
                <span className="px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Loading State */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && health && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Files</p>
                  <p className="text-3xl font-bold text-gray-900">{health.totalFiles.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Size</p>
                  <p className="text-3xl font-bold text-gray-900">{formatBytes(health.totalSize)}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <HardDrive className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Test Coverage</p>
                  <p className="text-3xl font-bold text-green-600">{health.testCoverage.toFixed(1)}%</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <TestTube className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Orphan Files</p>
                  <p className="text-3xl font-bold text-yellow-600">{health.orphanFiles.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Directory Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Directory Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {health.byDirectory.map((dir) => (
                <div
                  key={dir.directory}
                  className={`p-4 rounded-lg border cursor-pointer transition-all hover:shadow-md ${getDirectoryColor(dir.directory)}`}
                  onClick={() => {
                    setDirectoryFilter(dir.directory);
                    setActiveTab('files');
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {getDirectoryIcon(dir.directory)}
                    <span className="font-medium">{dir.directory}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="opacity-75">Files:</span> {dir.fileCount}
                    </div>
                    <div>
                      <span className="opacity-75">Size:</span> {formatBytes(dir.totalSize)}
                    </div>
                    <div>
                      <span className="opacity-75">Linked:</span> {dir.linkedCount}
                    </div>
                    <div>
                      <span className="opacity-75">Orphans:</span> {dir.orphanCount}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Health Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">File Types</h3>
              <div className="space-y-2">
                {Object.entries(health.byExtension)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([ext, count]) => (
                    <div key={ext} className="flex items-center justify-between">
                      <span className="text-sm font-mono text-gray-600">{ext || 'no ext'}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${(count / health.totalFiles) * 100}%` }}
                          />
                        </div>
                        <span className="text-sm text-gray-500 w-12 text-right">{count}</span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Linked vs Orphans</h3>
              <div className="flex items-center justify-center h-48">
                <div className="relative w-48 h-48">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#e5e7eb"
                      strokeWidth="20"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="20"
                      strokeDasharray={`${(health.linkedFiles / health.totalFiles) * 251.2} 251.2`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-gray-900">
                      {((health.linkedFiles / health.totalFiles) * 100).toFixed(0)}%
                    </span>
                    <span className="text-sm text-gray-500">Linked</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-center gap-6 mt-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full" />
                  <span className="text-sm text-gray-600">Linked ({health.linkedFiles})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-gray-300 rounded-full" />
                  <span className="text-sm text-gray-600">Orphans ({health.orphanFiles})</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Files Tab */}
      {activeTab === 'files' && (() => {
        const { folders, directFiles } = getFolderContents(currentPath);
        const breadcrumbs = getBreadcrumbs();
        const pathFiles = files.filter((f) =>
          currentPath === '' ? true : f.path.startsWith(currentPath + '/')
        );
        const pathOrphans = pathFiles.filter((f) => f.isOrphan).length;
        const pathLinked = pathFiles.filter((f) => !f.isOrphan).length;

        return (
          <div className="flex flex-col h-full min-h-[600px] space-y-4">
            {/* Generated Prompt Modal */}
            {generatedPrompt && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col m-4">
                  <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-semibold text-gray-900">
                      File Audit Prompt: {generatedPrompt.dir}/
                    </h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={downloadPrompt}
                        className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(generatedPrompt.content);
                        }}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => setGeneratedPrompt(null)}
                        className="px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-sm"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto p-6">
                    <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 bg-gray-50 p-4 rounded">
                      {generatedPrompt.content}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* Breadcrumb Navigation */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setCurrentPath('')}
                    className={`flex items-center gap-1 px-2 py-1 rounded text-sm font-medium transition-colors ${
                      currentPath === ''
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Root
                  </button>
                  {breadcrumbs.map((crumb, index) => (
                    <React.Fragment key={crumb.path}>
                      <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg]" />
                      <button
                        onClick={() => setCurrentPath(crumb.path)}
                        className={`px-2 py-1 rounded text-sm font-medium transition-colors ${
                          index === breadcrumbs.length - 1
                            ? 'bg-blue-100 text-blue-700'
                            : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {crumb.name}
                      </button>
                    </React.Fragment>
                  ))}
                </div>

                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    {pathFiles.length} files
                  </span>
                  <span className="text-green-600">{pathLinked} linked</span>
                  <span className="text-yellow-600">{pathOrphans} orphans</span>
                  {pathOrphans > 0 && currentPath && (
                    <button
                      onClick={() => generateFileAuditPrompt(currentPath)}
                      disabled={generatingPrompt === currentPath}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 text-purple-700 rounded text-sm font-medium hover:bg-purple-200"
                    >
                      {generatingPrompt === currentPath ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      Audit This Folder
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Folders Grid */}
            {folders.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {folders.map((folder) => (
                  <div
                    key={folder.path}
                    className="bg-white rounded-lg shadow hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <button
                          onClick={() => setCurrentPath(folder.path)}
                          className="flex items-center gap-2 text-left flex-1 min-w-0"
                        >
                          <FolderOpen className="w-5 h-5 text-blue-500 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 truncate">{folder.name}</p>
                            <p className="text-xs text-gray-500">
                              {folder.fileCount} files · {formatBytes(folder.totalSize)}
                            </p>
                          </div>
                        </button>
                        {folder.hasSubFolders && (
                          <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg] flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-xs">
                        <span className="text-green-600">{folder.linkedCount} linked</span>
                        <span className="text-yellow-600">{folder.orphanCount} orphans</span>
                      </div>
                      {folder.orphanCount > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            generateFileAuditPrompt(folder.path);
                          }}
                          disabled={generatingPrompt === folder.path}
                          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium hover:bg-purple-100"
                        >
                          {generatingPrompt === folder.path ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          Audit
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Direct Files at This Level */}
            {directFiles.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b">
                  <h4 className="font-medium text-gray-700">
                    Files in {currentPath || 'root'} ({directFiles.length})
                  </h4>
                </div>
                <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                  {directFiles.map((file) => (
                    <div
                      key={file.path}
                      className={`px-4 py-3 flex items-center justify-between hover:bg-gray-50 ${
                        file.isOrphan ? 'bg-yellow-50' : ''
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span className="text-sm font-mono text-gray-900 truncate">
                            {file.path.split('/').pop()}
                          </span>
                          {file.isOrphan && (
                            <span className="px-2 py-0.5 text-xs bg-yellow-200 text-yellow-800 rounded">
                              Orphan
                            </span>
                          )}
                          {file.isTestFile && (
                            <span className="px-2 py-0.5 text-xs bg-pink-100 text-pink-700 rounded">
                              Test
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span>{formatBytes(file.size)}</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatDate(file.lastModified)}
                          </span>
                        </div>
                      </div>
                      {file.linkedTasks.length > 0 && (
                        <div className="flex items-center gap-1 ml-4">
                          {file.linkedTasks.slice(0, 2).map((taskId) => (
                            <button
                              key={taskId}
                              onClick={() => onTaskClick?.(taskId)}
                              className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            >
                              {taskId}
                            </button>
                          ))}
                          {file.linkedTasks.length > 2 && (
                            <span className="text-xs text-gray-500">
                              +{file.linkedTasks.length - 2}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {folders.length === 0 && directFiles.length === 0 && (
              <div className="bg-gray-50 rounded-lg p-8 text-center">
                <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No files found at this path</p>
                {currentPath && (
                  <button
                    onClick={() => setCurrentPath('')}
                    className="mt-4 text-blue-600 hover:underline"
                  >
                    Go back to root
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {/* Cleanup Tab */}
      {activeTab === 'cleanup' && (
        <div className="space-y-4">
          {cleanup.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-800">All Clear!</h3>
              <p className="text-green-600 mt-2">No cleanup suggestions at this time.</p>
            </div>
          ) : (
            <>
              {/* Action Message */}
              {actionMessage && (
                <div className={`p-4 rounded-lg border ${
                  actionMessage.type === 'success'
                    ? 'bg-green-50 border-green-200 text-green-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}>
                  {actionMessage.text}
                </div>
              )}

              {/* Warning Banner */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    <span className="font-medium text-yellow-800">
                      {cleanup.length} cleanup suggestions found
                    </span>
                  </div>
                  <span className="text-sm text-yellow-700">
                    {selectedPaths.size > 0 && `${selectedPaths.size} selected`}
                  </span>
                </div>
                <p className="text-yellow-700 text-sm mt-1">
                  Select files and use the actions below to clean up your codebase.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 bg-white rounded-lg shadow p-4">
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center gap-2 px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 text-sm"
                >
                  {selectedPaths.size === cleanup.length ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-400" />
                  )}
                  {selectedPaths.size === cleanup.length ? 'Deselect All' : 'Select All'}
                </button>

                <div className="h-6 w-px bg-gray-300" />

                <button
                  onClick={() => executeAction('archive')}
                  disabled={selectedPaths.size === 0 || actionLoading !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {actionLoading === 'archive' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Archive className="w-4 h-4" />
                  )}
                  Archive
                </button>

                <button
                  onClick={() => executeAction('ignore')}
                  disabled={selectedPaths.size === 0 || actionLoading !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-gray-600 text-white hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {actionLoading === 'ignore' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                  Ignore
                </button>

                <button
                  onClick={() => executeAction('delete')}
                  disabled={selectedPaths.size === 0 || actionLoading !== null}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {actionLoading === 'delete' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  Delete
                </button>

                <div className="flex-1" />

                <span className="text-sm text-gray-500">
                  Archive moves to artifacts/archive/, Ignore adds to .artifactignore
                </span>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-12">
                        <button onClick={toggleSelectAll} className="hover:text-gray-700">
                          {selectedPaths.size === cleanup.length ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Priority
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        File Path
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Reason
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Size
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {cleanup.map((item, index) => (
                      <tr
                        key={`${item.path}-${item.category}-${index}`}
                        className={`hover:bg-gray-50 cursor-pointer ${
                          selectedPaths.has(item.path) ? 'bg-blue-50' : ''
                        }`}
                        onClick={() => toggleSelection(item.path)}
                      >
                        <td className="px-4 py-4">
                          {selectedPaths.has(item.path) ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 text-xs rounded border ${getPriorityColor(item.priority)}`}>
                            {item.priority}
                          </span>
                        </td>
                        <td className="px-4 py-4 font-mono text-sm text-gray-900 max-w-md truncate">
                          {item.path}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 max-w-sm">
                          {item.reason}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {formatBytes(item.size)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Missing Tab */}
      {activeTab === 'missing' && (
        <div className="space-y-4">
          {missing.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-800">All Files Present</h3>
              <p className="text-green-600 mt-2">No missing files detected.</p>
            </div>
          ) : (
            <>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-red-600" />
                  <span className="font-medium text-red-800">
                    {missing.length} expected files are missing
                  </span>
                </div>
                <p className="text-red-700 text-sm mt-1">
                  These files are referenced in Sprint_plan.csv but don't exist.
                </p>
              </div>

              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Expected Path
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Required By
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {missing.map((item, index) => (
                      <tr key={`${item.path}-${item.prefix}-${index}`} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded ${
                            item.prefix === 'ARTIFACT' ? 'bg-blue-100 text-blue-800' :
                            item.prefix === 'EVIDENCE' ? 'bg-purple-100 text-purple-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {item.prefix}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-sm text-gray-900">
                          {item.path}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {item.expectedBy.map((taskId) => (
                              <button
                                key={taskId}
                                onClick={() => onTaskClick?.(taskId)}
                                className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                              >
                                {taskId}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Header with controls */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">File History & Staleness</h3>
              <p className="text-sm text-gray-500">
                Track when and why files were created, and identify stale/outdated files
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600">Stale after:</label>
                <select
                  value={staleDays}
                  onChange={(e) => setStaleDays(Number(e.target.value))}
                  className="px-2 py-1 rounded border border-gray-300 text-sm"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
              <button
                onClick={() => fetchHistory(historyFilter === 'stale')}
                disabled={historyLoading}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                  historyLoading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {historyLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                {historyLoading ? 'Scanning...' : 'Scan History'}
              </button>
            </div>
          </div>

          {/* Loading State */}
          {historyLoading && !historyData && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Scanning git history (this may take a minute)...</p>
            </div>
          )}

          {/* No Data Yet */}
          {!historyLoading && !historyData && (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-700">No History Scanned</h3>
              <p className="text-gray-500 mt-2">Click "Scan History" to analyze file creation dates and detect stale files</p>
            </div>
          )}

          {/* Summary Cards */}
          {historyData?.summary && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-600">Total Scanned</p>
                <p className="text-2xl font-bold text-gray-900">{historyData.summary.totalFiles}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-600">Stale Files</p>
                <p className="text-2xl font-bold text-orange-600">{historyData.summary.staleFiles}</p>
                <p className="text-xs text-gray-500">&gt;{staleDays} days old</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-600">Tracked in Git</p>
                <p className="text-2xl font-bold text-green-600">{historyData.summary.trackedInGit}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-600">Untracked</p>
                <p className="text-2xl font-bold text-yellow-600">{historyData.summary.untrackedFiles}</p>
              </div>
              <div className="bg-white rounded-lg shadow p-4">
                <p className="text-sm font-medium text-gray-600">With Task ID</p>
                <p className="text-2xl font-bold text-blue-600">{historyData.summary.withTaskId}</p>
                <p className="text-xs text-gray-500">in commit message</p>
              </div>
            </div>
          )}

          {/* Filter Buttons */}
          {historyData && (
            <div className="flex items-center gap-2 bg-white rounded-lg shadow p-4">
              <span className="text-sm font-medium text-gray-700">Show:</span>
              {(['all', 'stale', 'with-task'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setHistoryFilter(filter)}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    historyFilter === filter
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {filter === 'all' && 'All Files'}
                  {filter === 'stale' && `Stale Only (${historyData.summary.staleFiles})`}
                  {filter === 'with-task' && `With Task ID (${historyData.summary.withTaskId})`}
                </button>
              ))}
            </div>
          )}

          {/* File History Table */}
          {historyData?.files && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        File
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Created
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Purpose (Commit Message)
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Task
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Age
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {historyData.files
                      .filter((file) => {
                        if (historyFilter === 'stale') return file.isStale;
                        if (historyFilter === 'with-task') return file.createdTaskId !== null;
                        return true;
                      })
                      .slice(0, 100)
                      .map((file, index) => (
                        <tr
                          key={`${file.path}-${index}`}
                          className={`hover:bg-gray-50 ${file.isStale ? 'bg-orange-50' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <span className="text-sm font-mono text-gray-900 truncate max-w-xs">
                                {file.path}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {file.createdAt ? (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {formatDate(file.createdAt)}
                              </div>
                            ) : (
                              <span className="text-gray-400">Unknown</span>
                            )}
                            {file.createdBy && (
                              <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                <User className="w-3 h-3" />
                                {file.createdBy}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 max-w-md">
                            {file.createdPurpose ? (
                              <span className="truncate block" title={file.createdPurpose}>
                                {file.createdPurpose.length > 60
                                  ? file.createdPurpose.substring(0, 60) + '...'
                                  : file.createdPurpose}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">No commit message found</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {file.createdTaskId ? (
                              <button
                                onClick={() => onTaskClick?.(file.createdTaskId!)}
                                className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                {file.createdTaskId}
                              </button>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {file.daysSinceModified !== null ? (
                              <span className={file.isStale ? 'text-orange-600 font-medium' : 'text-gray-600'}>
                                {file.daysSinceModified}d
                              </span>
                            ) : (
                              <span className="text-gray-400">?</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {file.isStale ? (
                              <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded border border-orange-200">
                                Stale
                              </span>
                            ) : file.createdAt ? (
                              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                                Active
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded">
                                Untracked
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {historyData.files.filter((f) => {
                if (historyFilter === 'stale') return f.isStale;
                if (historyFilter === 'with-task') return f.createdTaskId !== null;
                return true;
              }).length > 100 && (
                <div className="px-4 py-3 bg-gray-50 text-center text-sm text-gray-500">
                  Showing first 100 files. Use filters to narrow results.
                </div>
              )}
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-800 mb-2">How This Works</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>Created:</strong> When the file was first added to git</li>
              <li>• <strong>Purpose:</strong> The commit message explaining why it was created</li>
              <li>• <strong>Task ID:</strong> Extracted from commit message (e.g., IFC-001, ENV-001-AI)</li>
              <li>• <strong>Age:</strong> Days since last modification</li>
              <li>• <strong>Stale:</strong> Files not modified in more than {staleDays} days</li>
            </ul>
          </div>
        </div>
      )}

      {/* Code Health Tab */}
      {activeTab === 'code-health' && (
        <div className="space-y-6">
          {/* Run Analysis Button */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Dead Code Analysis</h3>
              <p className="text-sm text-gray-500">
                Run Knip and Depcheck to find unused files, exports, and dependencies
              </p>
            </div>
            <button
              onClick={() => fetchCodeAnalysis(true)}
              disabled={analysisLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium ${
                analysisLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 text-white hover:bg-green-700'
              }`}
            >
              {analysisLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {analysisLoading ? 'Running...' : 'Run Analysis'}
            </button>
          </div>

          {/* Analysis Source Info */}
          {codeAnalysis?.timestamp && (
            <div className="text-sm text-gray-500">
              Last analyzed: {formatDate(codeAnalysis.timestamp)}
              <span className="ml-2 px-2 py-0.5 bg-gray-100 rounded text-xs">
                {codeAnalysis.source === 'cache' ? 'cached' : 'fresh'}
              </span>
            </div>
          )}

          {/* Loading State */}
          {analysisLoading && !codeAnalysis && (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-600">Running code analysis (this may take a minute)...</p>
            </div>
          )}

          {/* No Analysis Yet */}
          {!analysisLoading && !codeAnalysis?.knip && !codeAnalysis?.depcheck && (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-700">No Analysis Available</h3>
              <p className="text-gray-500 mt-2">Click "Run Analysis" to scan for dead code</p>
            </div>
          )}

          {/* Summary Cards */}
          {(codeAnalysis?.knip?.summary || codeAnalysis?.depcheck?.summary) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {codeAnalysis.knip?.summary && (
                <>
                  <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm font-medium text-gray-600">Unused Files</p>
                    <p className="text-2xl font-bold text-red-600">
                      {codeAnalysis.knip.summary.unusedFiles}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm font-medium text-gray-600">Unused Exports</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {codeAnalysis.knip.summary.unusedExports}
                    </p>
                  </div>
                  <div className="bg-white rounded-lg shadow p-4">
                    <p className="text-sm font-medium text-gray-600">Unused Types</p>
                    <p className="text-2xl font-bold text-yellow-600">
                      {codeAnalysis.knip.summary.unusedTypes}
                    </p>
                  </div>
                </>
              )}
              {codeAnalysis.depcheck?.summary && (
                <div className="bg-white rounded-lg shadow p-4">
                  <p className="text-sm font-medium text-gray-600">Unused Dependencies</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {codeAnalysis.depcheck.summary.unusedDeps + codeAnalysis.depcheck.summary.unusedDevDeps}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Knip Results */}
          {codeAnalysis?.knip?.data && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Knip Analysis (Dead Code Detection)
                </h4>
              </div>
              <div className="divide-y">
                {/* Unused Files */}
                {codeAnalysis.knip.data.files.length > 0 && (
                  <div className="p-4">
                    <h5 className="font-medium text-gray-700 mb-2">
                      Unused Files ({codeAnalysis.knip.data.files.length})
                    </h5>
                    <div className="max-h-48 overflow-y-auto">
                      {codeAnalysis.knip.data.files.slice(0, 50).map((file, i) => (
                        <div key={i} className="text-sm font-mono text-gray-600 py-1">
                          {file}
                        </div>
                      ))}
                      {codeAnalysis.knip.data.files.length > 50 && (
                        <div className="text-sm text-gray-500 py-1">
                          ...and {codeAnalysis.knip.data.files.length - 50} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Unused Dependencies */}
                {(codeAnalysis.knip.data.dependencies.length > 0 || codeAnalysis.knip.data.devDependencies.length > 0) && (
                  <div className="p-4">
                    <h5 className="font-medium text-gray-700 mb-2">
                      Unused Dependencies
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {codeAnalysis.knip.data.dependencies.map((dep, i) => (
                        <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm">
                          {dep}
                        </span>
                      ))}
                      {codeAnalysis.knip.data.devDependencies.map((dep, i) => (
                        <span key={i} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm">
                          {dep} (dev)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unused Exports */}
                {codeAnalysis.knip.data.exports.length > 0 && (
                  <div className="p-4">
                    <h5 className="font-medium text-gray-700 mb-2">
                      Unused Exports ({codeAnalysis.knip.data.exports.reduce((sum, e) => sum + e.exports.length, 0)})
                    </h5>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {codeAnalysis.knip.data.exports.slice(0, 20).map((item, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-mono text-gray-600">{item.file}</span>
                          <div className="flex flex-wrap gap-1 mt-1 ml-4">
                            {item.exports.map((exp, j) => (
                              <span key={j} className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">
                                {exp}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Depcheck Results */}
          {codeAnalysis?.depcheck?.data && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Package className="w-4 h-4" />
                  Depcheck Analysis (Dependency Analysis)
                </h4>
              </div>
              <div className="divide-y">
                {codeAnalysis.depcheck.data.dependencies.length > 0 && (
                  <div className="p-4">
                    <h5 className="font-medium text-gray-700 mb-2">
                      Unused Dependencies ({codeAnalysis.depcheck.data.dependencies.length})
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {codeAnalysis.depcheck.data.dependencies.map((dep, i) => (
                        <span key={i} className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm">
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {codeAnalysis.depcheck.data.devDependencies.length > 0 && (
                  <div className="p-4">
                    <h5 className="font-medium text-gray-700 mb-2">
                      Unused Dev Dependencies ({codeAnalysis.depcheck.data.devDependencies.length})
                    </h5>
                    <div className="flex flex-wrap gap-2">
                      {codeAnalysis.depcheck.data.devDependencies.map((dep, i) => (
                        <span key={i} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-sm">
                          {dep}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {Object.keys(codeAnalysis.depcheck.data.missing).length > 0 && (
                  <div className="p-4">
                    <h5 className="font-medium text-gray-700 mb-2">
                      Missing Dependencies ({Object.keys(codeAnalysis.depcheck.data.missing).length})
                    </h5>
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {Object.entries(codeAnalysis.depcheck.data.missing).slice(0, 20).map(([dep, files], i) => (
                        <div key={i} className="text-sm">
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded">{dep}</span>
                          <span className="text-gray-500 ml-2">used in {files.length} file(s)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Errors */}
          {(codeAnalysis?.knip?.error || codeAnalysis?.depcheck?.error) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2">Analysis Errors</h4>
              {codeAnalysis.knip?.error && (
                <p className="text-sm text-red-700">Knip: {codeAnalysis.knip.error}</p>
              )}
              {codeAnalysis.depcheck?.error && (
                <p className="text-sm text-red-700">Depcheck: {codeAnalysis.depcheck.error}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Last Scan Time */}
      {health?.lastScanAt && (
        <p className="text-center text-xs text-gray-400">
          Last scanned: {formatDate(health.lastScanAt)}
        </p>
      )}
    </div>
  );
}
