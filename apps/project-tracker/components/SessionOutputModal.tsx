'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { Icon } from '@/lib/icons';

export type SessionType = 'spec' | 'plan' | 'exec' | 'hydrate';
export type SessionStatus = 'running' | 'completed' | 'failed' | 'timeout' | 'stuck' | 'needs_human' | 'not_started';

interface SessionOutputModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  taskId: string;
  sessionType: SessionType;
  output: string;
  status: SessionStatus;
  phase?: string;
  isSwarm?: boolean; // True for exec (swarm), false for claude sessions
  onKill: () => void;
}

const SESSION_NAMES: Record<SessionType, string> = {
  hydrate: 'Context Hydration',
  spec: 'Spec Session',
  plan: 'Plan Session',
  exec: 'Exec Session (Swarm)',
};

const STATUS_STYLES: Record<SessionStatus, string> = {
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  timeout: 'bg-orange-100 text-orange-800',
  stuck: 'bg-yellow-100 text-yellow-800',
  needs_human: 'bg-purple-100 text-purple-800',
  not_started: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<SessionStatus, string> = {
  running: 'RUNNING',
  completed: 'COMPLETED',
  failed: 'FAILED',
  timeout: 'TIMEOUT',
  stuck: 'STUCK',
  needs_human: 'NEEDS REVIEW',
  not_started: 'NOT STARTED',
};

export function SessionOutputModal({
  open,
  onClose,
  sessionId,
  taskId,
  sessionType,
  output,
  status,
  phase,
  isSwarm = false,
  onKill,
}: SessionOutputModalProps) {
  const outputRef = useRef<HTMLPreElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new output comes in
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = useCallback(() => {
    if (outputRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setAutoScroll(isAtBottom);
    }
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const isActive = status === 'running';
  const canKill = isActive && (sessionId || taskId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl max-h-[90vh] mx-4 bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Icon
              name={isSwarm ? 'memory' : 'smart_toy'}
              className="w-6 h-6 text-indigo-600"
            />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {SESSION_NAMES[sessionType]} - {taskId}
              </h2>
              {phase && (
                <p className="text-sm text-gray-500">Phase: {phase}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={clsx(
                'px-3 py-1 rounded-full text-xs font-semibold',
                STATUS_STYLES[status]
              )}
            >
              {STATUS_LABELS[status]}
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-gray-100 transition-colors"
              title="Close"
            >
              <Icon name="close" className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Output Terminal */}
        <div className="flex-1 p-4 overflow-hidden">
          <pre
            ref={outputRef}
            onScroll={handleScroll}
            className="h-full min-h-[400px] max-h-[50vh] overflow-auto bg-gray-900 text-gray-100 p-4 rounded-lg text-sm font-mono whitespace-pre-wrap break-words"
          >
            {output || (
              <span className="text-gray-500 italic">
                {status === 'not_started'
                  ? 'Session has not started yet...'
                  : 'Waiting for output...'}
              </span>
            )}
          </pre>
        </div>

        {/* Auto-scroll indicator */}
        {!autoScroll && isActive && (
          <div className="text-center py-2 border-t border-gray-100">
            <button
              onClick={() => {
                setAutoScroll(true);
                if (outputRef.current) {
                  outputRef.current.scrollTop = outputRef.current.scrollHeight;
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1 text-sm text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
            >
              <Icon name="arrow_downward" className="w-4 h-4" />
              Resume auto-scroll
            </button>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-500">
            {isSwarm ? (
              <span>Running via Swarm Orchestrator</span>
            ) : (
              <span>Session ID: {sessionId || 'N/A'}</span>
            )}
          </div>
          <div className="flex gap-3">
            {canKill && (
              <button
                onClick={onKill}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                <Icon name="stop" className="w-4 h-4" />
                Kill Session
              </button>
            )}
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              {isActive ? (
                <>
                  <Icon name="background_replace" className="w-4 h-4" />
                  Run in Background
                </>
              ) : (
                'Close'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook to manage session output polling
 */
interface UseSessionPollingOptions {
  sessionId: string | null;
  taskId: string;
  sessionType: SessionType;
  enabled: boolean;
  pollInterval?: number;
}

interface UseSessionPollingResult {
  output: string;
  status: SessionStatus;
  phase?: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSessionPolling({
  sessionId,
  taskId,
  sessionType,
  enabled,
  pollInterval = 3000,
}: UseSessionPollingOptions): UseSessionPollingResult {
  const [output, setOutput] = useState('');
  const [status, setStatus] = useState<SessionStatus>('not_started');
  const [phase, setPhase] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSwarm = sessionType === 'exec';

  const fetchStatus = useCallback(async () => {
    if (!enabled) return;

    try {
      setIsLoading(true);
      setError(null);

      if (isSwarm) {
        // Fetch from swarm endpoints
        const [statusRes, logRes] = await Promise.all([
          fetch(`/api/swarm/task-status?taskId=${taskId}`),
          fetch(`/api/swarm/task-log?taskId=${taskId}&lines=200`),
        ]);

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setStatus(statusData.status);
          setPhase(statusData.phase);
        }

        if (logRes.ok) {
          const logData = await logRes.json();
          setOutput(logData.output || '');
        }
      } else {
        // Fetch from claude-session endpoints
        if (!sessionId) return;

        const res = await fetch(`/api/claude-session/status?sessionId=${sessionId}&lines=200`);
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status);
          setOutput(data.output || '');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch session status');
    } finally {
      setIsLoading(false);
    }
  }, [enabled, isSwarm, sessionId, taskId]);

  // Initial fetch
  useEffect(() => {
    if (enabled) {
      fetchStatus();
    }
  }, [enabled, fetchStatus]);

  // Polling
  useEffect(() => {
    if (!enabled || status === 'completed' || status === 'failed' || status === 'timeout') {
      return;
    }

    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [enabled, status, pollInterval, fetchStatus]);

  return {
    output,
    status,
    phase,
    isLoading,
    error,
    refetch: fetchStatus,
  };
}
