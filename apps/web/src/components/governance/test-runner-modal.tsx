'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, Button, Progress } from '@intelliflow/ui';

type TestScope = 'quick' | 'standard' | 'comprehensive';

interface TestProgress {
  runId: string;
  type: string;
  timestamp: string;
  data?: {
    testName?: string;
    suiteName?: string;
    file?: string;
    testsRun?: number;
    testsPassed?: number;
    testsFailed?: number;
    testsSkipped?: number;
    message?: string;
    error?: string;
    coverage?: {
      lines: { pct: number };
      statements: { pct: number };
      functions: { pct: number };
      branches: { pct: number };
    };
  };
}

interface ScopeOption {
  value: TestScope;
  label: string;
  description: string;
  time: string;
}

const scopeOptions: ScopeOption[] = [
  {
    value: 'quick',
    label: 'Quick',
    description: 'Validators + Domain packages',
    time: '~15s',
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'All unit tests',
    time: '~1min',
  },
  {
    value: 'comprehensive',
    label: 'Comprehensive',
    description: 'Unit + Integration tests',
    time: '~3min',
  },
];

interface TestRunnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function TestRunnerModal({ isOpen, onClose, onComplete }: Readonly<TestRunnerModalProps>) {
  const [scope, setScope] = useState<TestScope>('standard');
  const [withCoverage, setWithCoverage] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [progress, setProgress] = useState({
    testsRun: 0,
    testsPassed: 0,
    testsFailed: 0,
    testsSkipped: 0,
    currentTest: '',
  });
  const [logs, setLogs] = useState<{ type: 'pass' | 'fail' | 'skip' | 'info'; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<{
    lines: number;
    statements: number;
    functions: number;
    branches: number;
  } | null>(null);
  const [isComplete, setIsComplete] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setProgress({ testsRun: 0, testsPassed: 0, testsFailed: 0, testsSkipped: 0, currentTest: '' });
      setLogs([]);
      setError(null);
      setCoverage(null);
      setIsComplete(false);
    }
  }, [isOpen]);

  const handleStart = useCallback(async () => {
    setIsRunning(true);
    setLogs([]);
    setError(null);
    setCoverage(null);
    setIsComplete(false);
    setProgress({ testsRun: 0, testsPassed: 0, testsFailed: 0, testsSkipped: 0, currentTest: '' });

    try {
      const response = await fetch('/api/quality-reports/test-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          coverage: withCoverage,
        }),
      });

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Failed to start test run');
      }

      setRunId(result.runId);
      setLogs((prev) => [...prev, { type: 'info', text: `Starting ${scope} test run...` }]);

      // Connect to SSE for real-time updates
      const eventSource = new EventSource(result.eventsUrl);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data: TestProgress = JSON.parse(event.data);
          handleProgressEvent(data);
        } catch (e) {
          console.error('Failed to parse SSE message:', e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        if (!isComplete) {
          setError('Connection to test runner lost');
          setIsRunning(false);
        }
      };
    } catch (err) {
      console.error('Failed to start test run:', err);
      setError(err instanceof Error ? err.message : 'Failed to start test run');
      setIsRunning(false);
    }
  }, [scope, withCoverage, isComplete]);

  const handleProgressEvent = (data: TestProgress) => {
    switch (data.type) {
      case 'test_pass':
        setProgress((prev) => ({
          ...prev,
          testsRun: prev.testsRun + 1,
          testsPassed: prev.testsPassed + 1,
          currentTest: data.data?.testName || prev.currentTest,
        }));
        if (data.data?.testName) {
          setLogs((prev) => [...prev, { type: 'pass', text: data.data?.testName || '' }]);
        }
        break;

      case 'test_fail':
        setProgress((prev) => ({
          ...prev,
          testsRun: prev.testsRun + 1,
          testsFailed: prev.testsFailed + 1,
          currentTest: data.data?.testName || prev.currentTest,
        }));
        if (data.data?.testName) {
          setLogs((prev) => [...prev, { type: 'fail', text: data.data?.testName || '' }]);
        }
        break;

      case 'test_skip':
        setProgress((prev) => ({
          ...prev,
          testsRun: prev.testsRun + 1,
          testsSkipped: prev.testsSkipped + 1,
          currentTest: data.data?.testName || prev.currentTest,
        }));
        if (data.data?.testName) {
          setLogs((prev) => [...prev, { type: 'skip', text: data.data?.testName || '' }]);
        }
        break;

      case 'suite_start':
        if (data.data?.file) {
          setLogs((prev) => [...prev, { type: 'info', text: `Running: ${data.data?.suiteName || data.data?.file}` }]);
        }
        break;

      case 'coverage_complete':
        if (data.data?.coverage) {
          setCoverage({
            lines: data.data.coverage.lines.pct,
            statements: data.data.coverage.statements.pct,
            functions: data.data.coverage.functions.pct,
            branches: data.data.coverage.branches.pct,
          });
        }
        break;

      case 'complete':
        setIsRunning(false);
        setIsComplete(true);
        eventSourceRef.current?.close();

        // Update final counts from complete event
        if (data.data?.testsRun !== undefined) {
          setProgress((prev) => ({
            ...prev,
            testsRun: data.data?.testsRun || prev.testsRun,
            testsPassed: data.data?.testsPassed || prev.testsPassed,
            testsFailed: data.data?.testsFailed || prev.testsFailed,
            testsSkipped: data.data?.testsSkipped || prev.testsSkipped,
          }));
        }

        if (data.data?.coverage) {
          setCoverage({
            lines: data.data.coverage.lines.pct,
            statements: data.data.coverage.statements.pct,
            functions: data.data.coverage.functions.pct,
            branches: data.data.coverage.branches.pct,
          });
        }

        setLogs((prev) => [...prev, { type: 'info', text: 'Test run complete!' }]);
        onComplete();
        break;

      case 'error':
        setError(data.data?.error || 'An error occurred');
        setIsRunning(false);
        eventSourceRef.current?.close();
        break;
    }
  };

  const handleCancel = useCallback(async () => {
    if (runId) {
      try {
        await fetch(`/api/quality-reports/test-run/${runId}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Failed to cancel test run:', e);
      }
    }
    eventSourceRef.current?.close();
    setIsRunning(false);
    setLogs((prev) => [...prev, { type: 'info', text: 'Test run cancelled' }]);
  }, [runId]);

  const handleClose = useCallback(() => {
    if (isRunning) {
      handleCancel();
    }
    onClose();
  }, [isRunning, handleCancel, onClose]);

  if (!isOpen) return null;

  const progressPercent =
    progress.testsRun > 0
      ? Math.round((progress.testsPassed / progress.testsRun) * 100)
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/50 cursor-default"
        onClick={handleClose}
        aria-label="Close modal"
      />

      <Card className="relative z-10 w-full max-w-2xl p-6 m-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-foreground">
            {isRunning ? 'Running Tests...' : isComplete ? 'Test Results' : 'Run Tests'}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {!isRunning && !isComplete ? (
          <>
            {/* Scope Selection */}
            <fieldset className="mb-6 border-0 p-0 m-0">
              <legend className="block text-sm font-medium text-foreground mb-3">Test Scope</legend>
              <div className="grid grid-cols-3 gap-3">
                {scopeOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setScope(option.value)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      scope === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <p className="font-medium text-foreground">{option.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Est: {option.time}</p>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Options */}
            <div className="mb-6 flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={withCoverage}
                  onChange={(e) => setWithCoverage(e.target.checked)}
                  className="w-4 h-4 rounded border-border"
                />
                <span className="text-sm text-foreground">Generate coverage report</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleStart} className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg">play_arrow</span>
                Start Tests
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Progress Summary */}
            <div className="mb-4 grid grid-cols-4 gap-3">
              <div className="p-3 bg-muted rounded-lg text-center">
                <p className="text-2xl font-bold text-foreground">{progress.testsRun}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div className="p-3 bg-emerald-500/10 rounded-lg text-center">
                <p className="text-2xl font-bold text-emerald-500">{progress.testsPassed}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
              <div className="p-3 bg-red-500/10 rounded-lg text-center">
                <p className="text-2xl font-bold text-red-500">{progress.testsFailed}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <div className="p-3 bg-amber-500/10 rounded-lg text-center">
                <p className="text-2xl font-bold text-amber-500">{progress.testsSkipped}</p>
                <p className="text-xs text-muted-foreground">Skipped</p>
              </div>
            </div>

            {/* Progress Bar */}
            {isRunning && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">Progress</span>
                  <span className="text-sm text-muted-foreground">{progressPercent}% passing</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                {progress.currentTest && (
                  <p className="text-xs text-muted-foreground mt-2 truncate">
                    {progress.currentTest}
                  </p>
                )}
              </div>
            )}

            {/* Coverage Results */}
            {coverage && isComplete && (
              <div className="mb-4 p-4 bg-muted rounded-lg">
                <h3 className="text-sm font-medium text-foreground mb-3">Coverage Results</h3>
                <div className="grid grid-cols-4 gap-3">
                  <CoverageMetric label="Lines" value={coverage.lines} />
                  <CoverageMetric label="Statements" value={coverage.statements} />
                  <CoverageMetric label="Functions" value={coverage.functions} />
                  <CoverageMetric label="Branches" value={coverage.branches} />
                </div>
              </div>
            )}

            {/* Live Logs */}
            <div className="flex-1 min-h-[200px] max-h-[300px] overflow-y-auto bg-muted rounded-lg p-3 font-mono text-xs">
              {logs.length === 0 ? (
                <p className="text-muted-foreground">Waiting for test output...</p>
              ) : (
                logs.map((log, i) => (
                  <div
                    key={i}
                    className={`${
                      log.type === 'pass'
                        ? 'text-emerald-500'
                        : log.type === 'fail'
                          ? 'text-red-500'
                          : log.type === 'skip'
                            ? 'text-amber-500'
                            : 'text-muted-foreground'
                    }`}
                  >
                    {log.type === 'pass' && '  '}
                    {log.type === 'fail' && '  '}
                    {log.type === 'skip' && '  '}
                    {log.type === 'info' && '  '}
                    {log.text}
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 mt-4">
              {isRunning ? (
                <Button variant="destructive" onClick={handleCancel}>
                  Cancel Test Run
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={handleClose}>
                    Close
                  </Button>
                  <Button onClick={handleStart}>
                    <span className="material-symbols-outlined text-lg mr-2">refresh</span>
                    Run Again
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

function CoverageMetric({ label, value }: { label: string; value: number }) {
  const getColor = (v: number) => {
    if (v >= 80) return 'text-emerald-500';
    if (v >= 50) return 'text-amber-500';
    return 'text-red-500';
  };

  return (
    <div className="text-center">
      <p className={`text-lg font-bold ${getColor(value)}`}>{value.toFixed(1)}%</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
