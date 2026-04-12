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

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

export function buildIncidentPayload(input: IncidentInput): IncidentPayload {
  return {
    event: 'incident_created',
    errorId: input.errorId ?? generateId(),
    digest: input.error.digest ?? null,
    message: input.error.message,
    severity: input.severity ?? 'error',
    path:
      input.path ??
      (typeof window !== 'undefined' ? window.location.pathname : null),
    userAgent:
      input.userAgent ??
      (typeof navigator !== 'undefined' ? navigator.userAgent : null),
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
