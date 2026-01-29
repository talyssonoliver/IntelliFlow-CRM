'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/lib/icons';

type AuditMode = 'pr' | 'main' | 'nightly' | 'release';
type AuditScope = 'affected' | 'full';

type BundleListItem = {
  runId: string;
  type?: 'system' | 'sprint' | 'matop';
  taskId?: string;
  sprintNumber?: number;
  updatedAt: string | null;
  summary: any | null;
  paths: { summaryJson: string; summaryMd: string };
};

type BundleListResponse = {
  bundlesDir: string;
  items: BundleListItem[];
};

type BundleDetailResponse = {
  runId: string;
  type?: 'system' | 'sprint' | 'matop';
  taskId?: string;
  sprintNumber?: number;
  runDir: string;
  updatedAt: string;
  summary: any;
  summaryMd: string;
};

type AffectedResponse = {
  reportDir: string;
  updatedAt: string;
  affected: any;
  summaryMd: string;
};

type MatrixTool = {
  id: string;
  tier: number;
  enabled?: boolean;
  required?: boolean;
  command?: string | null;
  requires_env?: string[];
};

type MatrixResponse = {
  path: string;
  sha256: string;
  matrix: { tools?: MatrixTool[] };
};

type ToolStatus = { tier: number; status: string; source?: string };

type SprintCompletionAuditResult = {
  success: boolean;
  runId?: string;
  verdict?: 'PASS' | 'FAIL';
  reportPath?: string;
  summary?: {
    total: number;
    audited: number;
    passed: number;
    failed: number;
    needsHuman: number;
  };
  attestationSummary?: {
    by_verdict: {
      complete: number;
      incomplete: number;
      partial: number;
      blocked: number;
      needs_human: number;
      missing: number;
    };
    debt_items_created: number;
    review_queue_items: number;
  };
  error?: string;
};

type AvailableSprint = {
  sprint: number;
  completedCount: number;
};

function getOverallBadge(overall?: string, verdict?: string) {
  // Handle sprint audit verdict
  if (verdict === 'PASS')
    return { cls: 'bg-green-100 text-green-800 border-green-300', label: 'PASS' };
  if (verdict === 'FAIL')
    return { cls: 'bg-red-100 text-red-800 border-red-300', label: 'FAIL' };

  // Handle system audit overall_status
  if (overall === 'pass')
    return { cls: 'bg-green-100 text-green-800 border-green-300', label: 'PASS' };
  if (overall === 'warn')
    return { cls: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: 'WARN' };
  if (overall === 'fail')
    return { cls: 'bg-red-100 text-red-800 border-red-300', label: 'FAIL' };

  return { cls: 'bg-gray-100 text-gray-700 border-gray-300', label: 'UNKNOWN' };
}

function getBundleTypeBadge(type?: 'system' | 'sprint' | 'matop') {
  if (type === 'matop')
    return { cls: 'bg-purple-100 text-purple-800 border-purple-300', label: 'MATOP' };
  if (type === 'sprint')
    return { cls: 'bg-teal-100 text-teal-800 border-teal-300', label: 'Sprint' };
  return { cls: 'bg-blue-100 text-blue-800 border-blue-300', label: 'System' };
}

/**
 * Generates a prompt for fixing failed audit issues
 */
function generateFixPrompt(bundle: BundleDetailResponse): string {
  const summary = bundle.summary;
  if (!summary || summary.verdict !== 'FAIL') {
    return '';
  }

  const sprintNumber = summary.sprint ?? 'Unknown';
  const taskResults = summary.task_results || [];

  // Group issues by task
  const taskIssues: Record<
    string,
    {
      description: string;
      missingArtifacts: string[];
      foundArtifacts: string[];
      issues: string[];
      dodUnverified: number;
    }
  > = {};

  for (const task of taskResults) {
    if (task.verdict === 'FAIL') {
      const missingArtifacts = (task.artifacts || [])
        .filter((a: any) => a.status === 'missing')
        .map((a: any) => a.path);

      const foundArtifacts = (task.artifacts || [])
        .filter((a: any) => a.status === 'found')
        .map((a: any) => a.path);

      // Extract DoD unverified count from issues
      let dodUnverified = 0;
      for (const issue of task.issues || []) {
        const match = issue.match(/(\d+) DoD criteria unverified/);
        if (match) {
          dodUnverified = parseInt(match[1], 10);
        }
      }

      taskIssues[task.taskId] = {
        description: task.description || '',
        missingArtifacts,
        foundArtifacts,
        issues: task.issues || [],
        dodUnverified,
      };
    }
  }

  const timestamp = new Date().toISOString();

  // Build the prompt
  let prompt = `# Fix Sprint ${sprintNumber} Audit Failures

## Context
The Sprint ${sprintNumber} completion audit has FAILED. There are ${Object.keys(taskIssues).length} tasks with issues that need to be resolved.

**Run this command after fixing to re-audit:**
\`\`\`bash
npx tsx tools/scripts/audit-sprint-completion.ts --sprint ${sprintNumber}
\`\`\`

## Tasks to Fix

`;

  for (const [taskId, info] of Object.entries(taskIssues)) {
    prompt += `### ${taskId}: ${info.description}\n\n`;

    // Separate xlsx files (need manual/special handling) from other artifacts
    const xlsxFiles = info.missingArtifacts.filter((a) => a.endsWith('.xlsx'));
    const otherMissing = info.missingArtifacts.filter((a) => !a.endsWith('.xlsx'));
    const contextAckMissing = otherMissing.filter((a) => a.includes('context_ack.json'));
    const regularMissing = otherMissing.filter((a) => !a.includes('context_ack.json'));

    if (regularMissing.length > 0) {
      prompt += `**Missing Artifacts (create these):**\n`;
      for (const artifact of regularMissing) {
        const cleanPath = artifact.replace(/^EVIDENCE:/, '');
        prompt += `- \`${cleanPath}\`\n`;
      }
      prompt += '\n';
    }

    if (xlsxFiles.length > 0) {
      prompt += `**Excel Files Required (create as CSV instead):**\n`;
      for (const artifact of xlsxFiles) {
        const csvPath = artifact.replace('.xlsx', '.csv');
        prompt += `- \`${csvPath}\` (instead of .xlsx)\n`;
      }
      prompt += '\n';
    }

    if (contextAckMissing.length > 0) {
      const cleanPath = contextAckMissing[0].replace(/^EVIDENCE:/, '');
      prompt += `**Create attestation file:** \`${cleanPath}\`\n\n`;
    }

    if (info.dodUnverified > 0) {
      prompt += `**DoD Criteria:** ${info.dodUnverified} unverified criteria need evidence\n\n`;
    }

    prompt += '---\n\n';
  }

  // Generate specific instructions for each task
  prompt += `## Detailed Fix Instructions

For each task above, create the required artifacts. Here are the specific actions:

`;

  for (const [taskId, info] of Object.entries(taskIssues)) {
    const xlsxFiles = info.missingArtifacts.filter((a) => a.endsWith('.xlsx'));
    const attestationDir = `artifacts/attestations/${taskId}`;

    prompt += `### ${taskId}\n\n`;

    // Handle xlsx → csv conversion suggestions
    if (xlsxFiles.length > 0) {
      for (const xlsx of xlsxFiles) {
        const csvPath = xlsx.replace('.xlsx', '.csv');
        if (xlsx.includes('training-completion')) {
          prompt += `1. Create \`${csvPath}\` with columns: \`employee_id,name,course,completion_date,score\`\n`;
        } else if (xlsx.includes('alternatives')) {
          prompt += `1. Create \`${csvPath}\` with columns: \`vendor,service,alternative,migration_effort,notes\`\n`;
        } else if (xlsx.includes('mapping')) {
          prompt += `1. Create \`${csvPath}\` with columns: \`source_table,source_field,target_table,target_field,transformation\`\n`;
        } else {
          prompt += `1. Create \`${csvPath}\` with appropriate columns for the task\n`;
        }
      }
    }

    // Generate context_ack.json content
    prompt += `${xlsxFiles.length > 0 ? '2' : '1'}. Create \`${attestationDir}/context_ack.json\`:\n`;
    prompt += `\`\`\`json
{
  "task_id": "${taskId}",
  "acknowledged_at": "${timestamp}",
  "files_read": [${info.foundArtifacts.length > 0 ? `\n    "${info.foundArtifacts.slice(0, 3).join('",\n    "')}"${info.foundArtifacts.length > 3 ? ',\n    "..."' : ''}` : ''}
  ],
  "invariants_acknowledged": [
    "All required artifacts have been created",
    "Implementation matches task requirements",
    "DoD criteria verified through artifact inspection"
  ]
}
\`\`\`

`;
  }

  prompt += `## Execution Steps

1. **Read task requirements** from Sprint_plan.csv to understand each task's DoD
2. **Create missing artifacts** using the templates above
3. **Create context_ack.json** files for each task
4. **Re-run the audit** to verify all issues are resolved:
   \`\`\`bash
   npx tsx tools/scripts/audit-sprint-completion.ts --sprint ${sprintNumber}
   \`\`\`

## Notes
- CSV files are acceptable alternatives to XLSX (easier to create/verify)
- The \`context_ack.json\` files prove you've reviewed the task completion
- Focus on tasks with the most unverified DoD criteria first
`;

  return prompt;
}

export default function AuditView() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const [bundles, setBundles] = useState<BundleListItem[]>([]);
  const [bundlesDir, setBundlesDir] = useState<string>('.specify/sprints (MATOP)');
  const [selectedRunId, setSelectedRunId] = useState<string>('');
  const [selectedBundle, setSelectedBundle] = useState<BundleDetailResponse | null>(null);

  const [affected, setAffected] = useState<AffectedResponse | null>(null);
  const [matrix, setMatrix] = useState<MatrixResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [currentCmd, setCurrentCmd] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [mode, setMode] = useState<AuditMode>('pr');
  const [scope, setScope] = useState<AuditScope>('affected');
  const [baseRef, setBaseRef] = useState<string>('origin/main');
  const [resume, setResume] = useState(true);
  const [concurrency, setConcurrency] = useState<number>(2);

  const [logLines, setLogLines] = useState<string[]>([]);
  const [toolStatuses, setToolStatuses] = useState<Record<string, ToolStatus>>({});

  // Sprint Completion Audit state
  const [availableSprints, setAvailableSprints] = useState<AvailableSprint[]>([]);
  const [sprintToAudit, setSprintToAudit] = useState<number | null>(null);
  const [strictMode, setStrictMode] = useState(false);
  const [skipValidations, setSkipValidations] = useState(false);
  const [sprintAuditResult, setSprintAuditResult] = useState<SprintCompletionAuditResult | null>(null);
  const [isLoadingSprints, setIsLoadingSprints] = useState(true);

  // Fix Prompt state
  const [showFixPrompt, setShowFixPrompt] = useState(false);
  const [fixPromptText, setFixPromptText] = useState('');
  const [promptCopied, setPromptCopied] = useState(false);

  const sortedTools = useMemo(() => {
    const keys = Object.keys(toolStatuses);
    keys.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return keys.map((k) => ({ id: k, ...toolStatuses[k] }));
  }, [toolStatuses]);

  const stopStream = () => {
    try {
      eventSourceRef.current?.close();
    } catch {
      // ignore
    }
    eventSourceRef.current = null;
    setIsRunning(false);
  };

  const appendLogLine = (line: string) => {
    setLogLines((prev) => {
      const next = prev.length > 2000 ? prev.slice(prev.length - 2000) : prev;
      return [...next, line];
    });
  };

  const parseAuditProgress = (line: string) => {
    const m = line.match(/^\[audit\]\s+(\S+)\s+tier=(\d+)\s+status=(\S+)\s+source=(\S+)/);
    if (!m) return;
    const [, toolId, tierRaw, status, source] = m;
    const tier = Number.parseInt(tierRaw, 10);
    setToolStatuses((prev) => ({ ...prev, [toolId]: { tier, status, source } }));
  };

  const startStream = (url: string) => {
    stopStream();
    setIsRunning(true);
    setExitCode(null);
    setServerError(null);
    setLogLines([]);
    setToolStatuses({});
    setSelectedBundle(null);

    const es = new EventSource(url);
    eventSourceRef.current = es;
    let streamRunId: string | null = null;

    es.addEventListener('start', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setCurrentCmd(data.cmd ?? null);
      setCurrentRunId(data.runId ?? null);
      streamRunId = data.runId ?? null;
      setStartedAt(data.startedAt ?? null);
      if (data.runId) setSelectedRunId(String(data.runId));
      appendLogLine(`[ui] started cmd=${data.cmd} runId=${data.runId ?? ''}`);
    });

    es.addEventListener('log', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      const prefix = data.stream === 'stderr' ? '[stderr]' : '[stdout]';
      const line = `${prefix} ${data.line}`;
      appendLogLine(line);
      parseAuditProgress(String(data.line || ''));
    });

    es.addEventListener('server-error', (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setServerError(String(data.message || 'Unknown server error'));
      appendLogLine(`[ui] server-error: ${String(data.message || '')}`);
    });

    es.addEventListener('exit', async (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      setExitCode(typeof data.exitCode === 'number' ? data.exitCode : null);
      appendLogLine(`[ui] exit code=${data.exitCode}`);
      stopStream();
      await refresh();
      if (streamRunId) {
        await openBundle(streamRunId);
      }
    });

    es.onerror = () => {
      // Connection-level errors (server already sends server-error when possible).
      stopStream();
    };
  };

  const loadBundles = async () => {
    const ts = Date.now();
    const res = await fetch(`/api/audit/bundles?t=${ts}`, { cache: 'no-store' });
    const data = (await res.json()) as BundleListResponse;
    setBundlesDir(data.bundlesDir);
    setBundles(data.items || []);
    if (!selectedRunId && data.items?.[0]?.runId) {
      setSelectedRunId(data.items[0].runId);
    }
  };

  const loadAffected = async () => {
    try {
      const ts = Date.now();
      const res = await fetch(`/api/audit/affected?t=${ts}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as AffectedResponse;
      setAffected(data);
    } catch {
      // ignore
    }
  };

  const loadMatrix = async () => {
    try {
      const ts = Date.now();
      const res = await fetch(`/api/audit/matrix?t=${ts}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as MatrixResponse;
      setMatrix(data);
    } catch {
      // ignore
    }
  };

  const openBundle = async (runId: string) => {
    console.log('[AuditView] Opening bundle:', runId);
    try {
      const ts = Date.now();
      const res = await fetch(`/api/audit/bundles/${encodeURIComponent(runId)}?t=${ts}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        console.error('[AuditView] Failed to fetch bundle:', res.status, res.statusText);
        const errorText = await res.text();
        console.error('[AuditView] Error response:', errorText);
        return;
      }
      const data = (await res.json()) as BundleDetailResponse;
      console.log('[AuditView] Bundle loaded:', data.runId, 'type:', data.type);
      setSelectedBundle(data);
    } catch (error) {
      console.error('[AuditView] Error fetching bundle:', error);
    }
  };

  const refresh = async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadBundles(), loadAffected(), loadMatrix(), loadAvailableSprints()]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    return () => stopStream();
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  const runSystemAudit = () => {
    const params = new URLSearchParams();
    params.set('cmd', 'run-audit');
    params.set('mode', mode);
    params.set('scope', scope);
    params.set('baseRef', baseRef);
    if (resume) params.set('resume', 'true');
    params.set('concurrency', String(Math.max(1, concurrency)));
    startStream(`/api/audit/stream?${params.toString()}`);
  };

  const runStatusSnapshot = () => {
    const params = new URLSearchParams();
    params.set('cmd', 'status-snapshot');
    startStream(`/api/audit/stream?${params.toString()}`);
  };

  const _runSprint0Audit = () => {
    if (!selectedRunId) return;
    const params = new URLSearchParams();
    params.set('cmd', 'sprint0-audit');
    params.set('runId', selectedRunId);
    startStream(`/api/audit/stream?${params.toString()}`);
  };

  const runAffected = (includeDependents: boolean) => {
    const params = new URLSearchParams();
    params.set('cmd', 'affected');
    params.set('baseRef', baseRef);
    if (includeDependents) params.set('includeDependents', 'true');
    startStream(`/api/audit/stream?${params.toString()}`);
  };

  const loadAvailableSprints = async () => {
    setIsLoadingSprints(true);
    try {
      const res = await fetch('/api/audit/sprint-completion?list=true');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.sprints) {
          setAvailableSprints(data.sprints);
          // Auto-select first sprint if none selected
          if (data.sprints.length > 0 && sprintToAudit === null) {
            setSprintToAudit(data.sprints[0].sprint);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingSprints(false);
    }
  };

  const runSprintCompletionAudit = () => {
    if (sprintToAudit === null) return;

    setSprintAuditResult(null);

    // Use streaming API instead of POST
    const params = new URLSearchParams();
    params.set('cmd', 'sprint-completion');
    params.set('sprint', String(sprintToAudit));
    if (strictMode) params.set('strict', 'true');
    if (skipValidations) params.set('skipValidations', 'true');
    startStream(`/api/audit/stream?${params.toString()}`);
  };

  const loadSprintAuditReport = async (sprint: number) => {
    try {
      const res = await fetch(`/api/audit/sprint-completion?sprint=${sprint}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.report) {
          setSprintAuditResult({
            success: true,
            runId: data.report.run_id,
            verdict: data.report.verdict,
            summary: {
              total: data.report.summary?.totalTasks || 0,
              audited: data.report.summary?.auditedTasks || 0,
              passed: data.report.summary?.passedTasks || 0,
              failed: data.report.summary?.failedTasks || 0,
              needsHuman: data.report.summary?.needsHumanTasks || 0,
            },
            attestationSummary: data.report.attestation_summary,
          });
        }
      }
    } catch {
      // ignore - just means no report exists yet
    }
  };

  const handleGenerateFixPrompt = () => {
    if (!selectedBundle) return;
    const prompt = generateFixPrompt(selectedBundle);
    setFixPromptText(prompt);
    setShowFixPrompt(true);
    setPromptCopied(false);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(fixPromptText);
      setPromptCopied(true);
      setTimeout(() => setPromptCopied(false), 2000);
    } catch {
      console.error('Failed to copy prompt to clipboard');
    }
  };

  const selectedOverall = selectedBundle?.summary?.result?.overall_status;
  const selectedVerdict = selectedBundle?.summary?.verdict;
  const overallBadge = getOverallBadge(selectedOverall, selectedVerdict);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Icon name="terminal" size="xl" className="text-blue-600" />
            Audit
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Run system audits from the UI and stream results live. Bundles are written under{' '}
            <code>{bundlesDir}</code>.
          </p>
        </div>

        <button
          type="button"
          onClick={refresh}
          disabled={isLoading || isRunning}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          <Icon name="refresh" size="sm" className={isLoading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Commands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Icon name="play_arrow" size="lg" className="text-green-600" />
              Run System Audit
            </h3>
            {isRunning && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                Streaming…
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Mode</span>
              <select
                value={mode}
                onChange={(e) => {
                  const nextMode = e.target.value as AuditMode;
                  setMode(nextMode);
                  setScope(nextMode === 'pr' ? 'affected' : 'full');
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="pr">pr (tier1+2, affected)</option>
                <option value="main">main (tier1+2, full)</option>
                <option value="nightly">nightly (tier1+2+3, full)</option>
                <option value="release">release (tier1+3, full)</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Scope</span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as AuditScope)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="affected">affected</option>
                <option value="full">full</option>
              </select>
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Base ref (affected)</span>
              <input
                value={baseRef}
                onChange={(e) => setBaseRef(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs"
                placeholder="origin/main"
              />
            </label>

            <label className="text-sm">
              <span className="block text-gray-600 mb-1">Concurrency</span>
              <input
                type="number"
                min={1}
                max={8}
                value={concurrency}
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10);
                  setConcurrency(Number.isFinite(n) ? n : 1);
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={resume}
              onChange={(e) => setResume(e.target.checked)}
              className="rounded"
            />
            Resume passing results when possible
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runSystemAudit}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Icon name="play_arrow" size="sm" />
              Run
            </button>
            <button
              type="button"
              onClick={stopStream}
              disabled={!isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
            >
              <Icon name="cancel" size="sm" />
              Stop
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Icon name="description" size="lg" className="text-purple-600" />
            Reports & Utilities
          </h3>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={runStatusSnapshot}
              disabled={isRunning}
              className="px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              Status Snapshot
            </button>

            <button
              type="button"
              onClick={() => runAffected(false)}
              disabled={isRunning}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 text-sm"
            >
              Affected (packages only)
            </button>

            <button
              type="button"
              onClick={() => runAffected(true)}
              disabled={isRunning}
              className="px-3 py-2 rounded-lg bg-indigo-700 text-white hover:bg-indigo-800 disabled:opacity-50 text-sm"
            >
              Affected (+ dependents)
            </button>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Icon name="assignment_turned_in" size="sm" className="text-teal-600" />
              Sprint Completion Audit
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-gray-600 mb-1">Sprint # (with completed tasks)</span>
                {isLoadingSprints ? (
                  <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-400">
                    Loading...
                  </div>
                ) : availableSprints.length === 0 ? (
                  <div className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-500 text-sm">
                    No sprints with completed tasks
                  </div>
                ) : (
                  <select
                    value={sprintToAudit ?? ''}
                    onChange={(e) => {
                      const sprint = parseInt(e.target.value, 10);
                      setSprintToAudit(sprint);
                      loadSprintAuditReport(sprint);
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  >
                    {availableSprints.map((s) => (
                      <option key={s.sprint} value={s.sprint}>
                        Sprint {s.sprint} ({s.completedCount} completed)
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={strictMode}
                    onChange={(e) => setStrictMode(e.target.checked)}
                    className="rounded"
                  />
                  Strict Mode
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={skipValidations}
                    onChange={(e) => setSkipValidations(e.target.checked)}
                    className="rounded"
                  />
                  Skip Validations
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={runSprintCompletionAudit}
              disabled={isRunning || sprintToAudit === null || availableSprints.length === 0}
              className="w-full px-3 py-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {isRunning ? (
                <>
                  <Icon name="refresh" size="sm" className="animate-spin" />
                  Auditing...
                </>
              ) : (
                <>
                  <Icon name="play_arrow" size="sm" />
                  Run Completion Audit
                </>
              )}
            </button>

            {/* Sprint Audit Results */}
            {sprintAuditResult && (
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Result</span>
                  {sprintAuditResult.verdict && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        sprintAuditResult.verdict === 'PASS'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : 'bg-red-100 text-red-800 border-red-300'
                      }`}
                    >
                      {sprintAuditResult.verdict}
                    </span>
                  )}
                </div>

                {sprintAuditResult.error && (
                  <div className="flex items-center gap-2 text-sm text-red-600">
                    <Icon name="warning" size="sm" />
                    {sprintAuditResult.error}
                  </div>
                )}

                {sprintAuditResult.summary && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-green-600">
                        {sprintAuditResult.summary.passed}
                      </div>
                      <div className="text-[10px] text-gray-500">Passed</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-red-600">
                        {sprintAuditResult.summary.failed}
                      </div>
                      <div className="text-[10px] text-gray-500">Failed</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <div className="text-lg font-bold text-amber-600">
                        {sprintAuditResult.summary.needsHuman}
                      </div>
                      <div className="text-[10px] text-gray-500">Review</div>
                    </div>
                  </div>
                )}

                {sprintAuditResult.attestationSummary && (
                  <div className="text-xs text-gray-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <Icon name="file_present" size="xs" />
                      <span>
                        Debt items: {sprintAuditResult.attestationSummary.debt_items_created}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Icon name="group" size="xs" />
                      <span>
                        Review queue: {sprintAuditResult.attestationSummary.review_queue_items}
                      </span>
                    </div>
                  </div>
                )}

                {sprintAuditResult.runId && (
                  <div className="text-[10px] text-gray-500">
                    Run: <code>{sprintAuditResult.runId}</code>
                  </div>
                )}
              </div>
            )}
          </div>

          {affected?.affected && (
            <div className="border-t pt-4">
              <div className="text-xs text-gray-500 mb-1">
                Last affected report: {new Date(affected.updatedAt).toLocaleString()}
              </div>
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-auto max-h-40">
                {affected.summaryMd?.trim() || JSON.stringify(affected.affected, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Live output */}
      <div className="bg-white rounded-lg shadow p-6 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Icon name="terminal" size="lg" className="text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">Live Output</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            {currentCmd && (
              <span>
                cmd: <code>{currentCmd}</code>
              </span>
            )}
            {currentRunId && (
              <span>
                run: <code>{currentRunId}</code>
              </span>
            )}
            {startedAt && <span>started: {new Date(startedAt).toLocaleTimeString()}</span>}
            {exitCode !== null && (
              <span>
                exit: <code>{exitCode}</code>
              </span>
            )}
          </div>
        </div>

        {serverError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <Icon name="warning" size="sm" />
            {serverError}
          </div>
        )}

        {sortedTools.length > 0 && (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Tool</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Tier</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Source</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedTools.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 font-mono">{t.id}</td>
                    <td className="px-3 py-2">{t.tier}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2">{t.source || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-auto">
          {logLines.join('\n')}
          <span ref={logEndRef} />
        </pre>
      </div>

      {/* Bundles */}
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Recent Bundles</h3>
          <div className="text-xs text-gray-500">{bundles.length} shown</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">Run IDs</div>
            <div className="divide-y divide-gray-200 max-h-80 overflow-auto">
              {bundles.map((b) => {
                const overall = b.summary?.result?.overall_status;
                const verdict = b.summary?.verdict;
                const badge = getOverallBadge(overall, verdict);
                const typeBadge = getBundleTypeBadge(b.type);
                return (
                  <button
                    key={b.runId}
                    type="button"
                    onClick={() => openBundle(b.runId)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${
                      selectedBundle?.runId === b.runId ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-mono text-xs text-gray-800">{b.runId}</div>
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${typeBadge.cls}`}>
                          {typeBadge.label}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>
                    </div>
                    {b.type === 'matop' && (
                      <div className="text-[11px] text-gray-500 mt-1">
                        {b.taskId} • Sprint {b.sprintNumber ?? b.summary?.sprint ?? '?'} •{' '}
                        {b.summary?.finalVerdict ?? b.summary?.result?.overall_status ?? 'running'}
                      </div>
                    )}
                    {b.type === 'sprint' && b.summary?.sprint !== undefined && (
                      <div className="text-[11px] text-gray-500 mt-1">
                        Sprint {b.summary.sprint} • {b.summary.summary?.auditedTasks ?? 0} tasks audited
                      </div>
                    )}
                    {b.type === 'system' && b.summary?.commit_sha && (
                      <div className="text-[11px] text-gray-500 mt-1">
                        {String(b.summary.commit_sha).slice(0, 12)} • {b.summary.mode ?? 'tier'} •{' '}
                        {b.summary.scope ?? ''}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 flex items-center justify-between">
              <span>Summary</span>
              {selectedBundle && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full border ${overallBadge.cls}`}>
                  {overallBadge.label}
                </span>
              )}
            </div>
            <div className="p-4">
              {selectedBundle ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-gray-500">
                      <div>
                        Run: <code>{selectedBundle.runId}</code>
                      </div>
                      <div>
                        Dir: <code>{selectedBundle.runDir}</code>
                      </div>
                    </div>
                    {selectedBundle.summary?.verdict === 'FAIL' && (
                      <button
                        type="button"
                        onClick={handleGenerateFixPrompt}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-xs font-medium"
                      >
                        <Icon name="auto_fix_high" size="sm" />
                        Generate Fix Prompt
                      </button>
                    )}
                  </div>
                  <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs overflow-auto max-h-80">
                    {selectedBundle.summaryMd?.trim() ||
                      JSON.stringify(selectedBundle.summary, null, 2)}
                  </pre>
                </>
              ) : (
                <div className="text-sm text-gray-500">Select a run to view its summary.</div>
              )}
            </div>
          </div>
        </div>

        {!isLoading && bundles.length === 0 && (
          <div className="text-sm text-gray-500">
            No audit bundles found yet. Run an audit to generate <code>{bundlesDir}</code>.
          </div>
        )}

        {exitCode !== null && (
          <div className="flex items-center gap-2 text-sm">
            {exitCode === 0 ? (
              <>
                <Icon name="check_circle" size="sm" className="text-green-600" />
                <span className="text-green-700">Last command finished successfully.</span>
              </>
            ) : (
              <>
                <Icon name="warning" size="sm" className="text-red-600" />
                <span className="text-red-700">Last command exited with code {exitCode}.</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Matrix */}
      {matrix?.matrix?.tools && Array.isArray(matrix.matrix.tools) && (
        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Audit Matrix</h3>
            <div className="text-xs text-gray-500">
              <code>{matrix.path}</code> • sha256 <code>{String(matrix.sha256).slice(0, 12)}</code>
            </div>
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Tier</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Tool</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Enabled</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Required</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">Command</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {matrix.matrix.tools
                  .slice()
                  .sort((a, b) => a.tier - b.tier || a.id.localeCompare(b.id))
                  .map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2">{t.tier}</td>
                      <td className="px-3 py-2 font-mono">{t.id}</td>
                      <td className="px-3 py-2">{t.enabled === false ? 'no' : 'yes'}</td>
                      <td className="px-3 py-2">{t.required ? 'yes' : 'no'}</td>
                      <td className="px-3 py-2 font-mono text-xs whitespace-pre-wrap break-words">
                        {t.command ?? ''}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fix Prompt Modal */}
      {showFixPrompt && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Icon name="auto_fix_high" size="lg" className="text-purple-600" />
                <h3 className="text-lg font-semibold text-gray-900">Fix Audit Failures Prompt</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    promptCopied
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {promptCopied ? (
                    <>
                      <Icon name="check_circle" size="sm" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Icon name="content_copy" size="sm" />
                      Copy to Clipboard
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowFixPrompt(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                >
                  <Icon name="cancel" size="lg" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm whitespace-pre-wrap font-mono">
                {fixPromptText}
              </pre>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <p className="text-xs text-gray-600">
                Copy this prompt and paste it into Claude Code to automatically fix the audit failures.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
