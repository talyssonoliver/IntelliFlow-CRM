export type IncidentSeverity = 'warning' | 'error' | 'critical';

export type IncidentPayload = {
  readonly event: 'incident_created';
  readonly errorId: string;
  readonly digest: string | null;
  readonly message: string;
  readonly severity: IncidentSeverity;
  readonly path: string | null;
  readonly userAgent: string | null;
  readonly timestamp: string;
};

export type IncidentInput = {
  readonly error: Error & { digest?: string };
  readonly path?: string | null;
  readonly severity?: IncidentSeverity;
  readonly userAgent?: string | null;
  readonly timestamp?: string;
  readonly errorId?: string;
};

const MESSAGE_MAX_LENGTH = 300;

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

// Cap message length before it leaves the process. React already masks
// server-component errors in production ("An error occurred in the Server
// Components render"), but dev/staging builds can leak stack-like content,
// SQL snippets, or user identifiers from upstream throws into dataLayer and
// the SRE webhook. The cap bounds that blast radius without hashing.
function truncateMessage(message: string): string {
  if (message.length <= MESSAGE_MAX_LENGTH) {
    return message;
  }
  return `${message.slice(0, MESSAGE_MAX_LENGTH)}…`;
}

export function buildIncidentPayload(input: IncidentInput): IncidentPayload {
  return {
    event: 'incident_created',
    errorId: input.errorId ?? generateId(),
    digest: input.error.digest ?? null,
    message: truncateMessage(input.error.message ?? ''),
    severity: input.severity ?? 'error',
    path: input.path ?? (typeof window !== 'undefined' ? window.location.pathname : null),
    userAgent: input.userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : null),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function createIncident(input: IncidentInput): IncidentPayload {
  const payload = buildIncidentPayload(input);

  if (typeof window !== 'undefined') {
    if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push(payload);
    }

    window.dispatchEvent(
      new CustomEvent<IncidentPayload>('intelliflow:incident-created', {
        detail: payload,
      })
    );
  }

  return payload;
}
