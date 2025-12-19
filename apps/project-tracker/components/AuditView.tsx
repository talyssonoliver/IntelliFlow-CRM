'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  Play,
  Terminal,
  FileText,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

type AuditMode = 'pr' | 'main' | 'nightly' | 'release';
type AuditScope = 'affected' | 'full';

type BundleListItem = {
  runId: string;
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

function getOverallBadge(overall?: string) {
  if (overall === 'pass')
    return { cls: 'bg-green-100 text-green-800 border-green-300', label: 'PASS' };
  if (overall === 'warn')
    return { cls: 'bg-yellow-100 text-yellow-800 border-yellow-300', label: 'WARN' };
  if (overall === 'fail') return { cls: 'bg-red-100 text-red-800 border-red-300', label: 'FAIL' };
  return { cls: 'bg-gray-100 text-gray-700 border-gray-300', label: 'UNKNOWN' };
}

export default function AuditView() {
  const eventSourceRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  const [bundles, setBundles] = useState<BundleListItem[]>([]);
  const [bundlesDir, setBundlesDir] = useState<string>('artifacts/reports/system-audit');
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

  const sortedTools = useMemo(() => {
    const keys = Object.keys(toolStatuses);
    keys.sort();
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
    try {
      const ts = Date.now();
      const res = await fetch(`/api/audit/bundles/${encodeURIComponent(runId)}?t=${ts}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as BundleDetailResponse;
      setSelectedBundle(data);
    } catch {
      // ignore
    }
  };

  const refresh = async () => {
    setIsLoading(true);
    try {
      await Promise.all([loadBundles(), loadAffected(), loadMatrix()]);
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

  const runSprint0Audit = () => {
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

  const selectedOverall = selectedBundle?.summary?.result?.overall_status;
  const overallBadge = getOverallBadge(selectedOverall);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Terminal className="w-6 h-6 text-blue-600" />
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
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Commands */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Play className="w-5 h-5 text-green-600" />
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
              <Play className="w-4 h-4" />
              Run
            </button>
            <button
              type="button"
              onClick={stopStream}
              disabled={!isRunning}
              className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Stop
            </button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-600" />
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

          <div className="border-t pt-4 space-y-2">
            <div className="text-sm text-gray-600">Sprint 0 audit reports</div>
            <div className="flex items-center gap-2">
              <select
                value={selectedRunId}
                onChange={(e) => setSelectedRunId(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
              >
                {bundles.map((b) => (
                  <option key={b.runId} value={b.runId}>
                    {b.runId}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={runSprint0Audit}
                disabled={isRunning || !selectedRunId}
                className="px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 text-sm"
              >
                Generate
              </button>
            </div>
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
            <Terminal className="w-5 h-5 text-gray-700" />
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
            <AlertTriangle className="w-4 h-4" />
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

        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-auto max-h-96">
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
                const badge = getOverallBadge(overall);
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
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    {b.summary?.commit_sha && (
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
                  <div className="text-xs text-gray-500 mb-2">
                    <div>
                      Run: <code>{selectedBundle.runId}</code>
                    </div>
                    <div>
                      Dir: <code>{selectedBundle.runDir}</code>
                    </div>
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
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-green-700">Last command finished successfully.</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-red-600" />
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
    </div>
  );
}
