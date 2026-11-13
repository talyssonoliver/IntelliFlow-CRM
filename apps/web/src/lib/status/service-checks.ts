/**
 * Server-side checks behind the public status page (PG-014).
 *
 * Each check calls a real health endpoint, times it, and reports only what it
 * measured. A service whose address is not configured is reported as
 * "not_checked" rather than given a made-up state (CLAUDE.md: never mock data).
 */

export type ServiceState = 'up' | 'degraded' | 'down' | 'not_checked';

export interface ServiceCheck {
  readonly id: 'api' | 'ai' | 'auth';
  readonly name: string;
  readonly detail: string;
  readonly state: ServiceState;
  /** Round-trip time of the check, when it got an answer. */
  readonly ms?: number;
  /** A short, user-facing reason when the state is not "up". */
  readonly note?: string;
}

export interface StatusEnv {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 4000;

/** Queues the AI agents consume; a queue with no worker means AI jobs wait. */
const AI_QUEUE_PREFIX = 'ai-';

interface Timed {
  ms: number;
  res?: Response;
}

async function timedGet(fetchFn: Fetch, url: string, headers?: HeadersInit): Promise<Timed> {
  const started = Date.now();
  try {
    const res = await fetchFn(url, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { ms: Date.now() - started, res };
  } catch {
    return { ms: Date.now() - started };
  }
}

function base(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

const API = { id: 'api', name: 'API', detail: 'The CRM data and actions behind the app' } as const;
const AI = {
  id: 'ai',
  name: 'AI agents',
  detail: 'Lead scoring, drafts and the approval queue',
} as const;
const AUTH = { id: 'auth', name: 'Sign-in', detail: 'Email and Google' } as const;

export async function checkApi(fetchFn: Fetch, apiUrl?: string): Promise<ServiceCheck> {
  if (!apiUrl) return { ...API, state: 'not_checked', note: 'No address configured' };
  const { ms, res } = await timedGet(fetchFn, `${base(apiUrl)}/health/ready`);
  if (!res) return { ...API, state: 'down' };
  if (res.ok) return { ...API, state: 'up', ms };
  // Degraded only when the API itself said it is not ready (503 with ready: false). Any
  // other answer (a 502/504 page from the hosting edge while the API is down) is an outage.
  if (res.status === 503 && (await saysNotReady(res))) {
    return { ...API, state: 'degraded', ms, note: 'Answering, but not ready' };
  }
  return { ...API, state: 'down', ms, note: `HTTP ${res.status}` };
}

async function saysNotReady(res: Response): Promise<boolean> {
  try {
    const body = (await res.json()) as { ready?: unknown } | null;
    return body?.ready === false;
  } catch {
    return false;
  }
}

interface DetailedHealth {
  checks?: {
    queues?: { status?: string; consumers?: Record<string, number> };
  };
}

export async function checkAiAgents(fetchFn: Fetch, apiUrl?: string): Promise<ServiceCheck> {
  if (!apiUrl) return { ...AI, state: 'not_checked', note: 'No address configured' };
  const { ms, res } = await timedGet(fetchFn, `${base(apiUrl)}/health/detailed`);
  if (!res?.ok) return { ...AI, state: 'down', note: 'Could not reach the API to check' };
  let body: DetailedHealth;
  try {
    body = (await res.json()) as DetailedHealth;
  } catch {
    return { ...AI, state: 'not_checked', note: 'The API did not report its workers' };
  }
  const queues = body.checks?.queues;
  // The API reports an error here when it cannot count workers (Redis or the
  // queue is unreachable): no AI job can run then, so that is an outage.
  if (queues?.status === 'error') {
    return { ...AI, state: 'down', ms, note: 'The API could not reach the AI job queues' };
  }
  if (!queues?.consumers) {
    return { ...AI, state: 'not_checked', note: 'The API did not report its workers' };
  }
  const ai = Object.entries(queues.consumers).filter(([name]) => name.startsWith(AI_QUEUE_PREFIX));
  if (ai.length === 0) {
    return { ...AI, state: 'not_checked', note: 'The API did not report its workers' };
  }
  const idle = ai.filter(([, workers]) => workers === 0).length;
  if (idle === 0) return { ...AI, state: 'up', ms };
  if (idle === ai.length) return { ...AI, state: 'down', ms, note: 'No AI worker is running' };
  return { ...AI, state: 'degraded', ms, note: `${idle} of ${ai.length} AI queues have no worker` };
}

export async function checkSignIn(
  fetchFn: Fetch,
  supabaseUrl?: string,
  anonKey?: string
): Promise<ServiceCheck> {
  if (!supabaseUrl || !anonKey) {
    return { ...AUTH, state: 'not_checked', note: 'No address configured' };
  }
  const { ms, res } = await timedGet(fetchFn, `${base(supabaseUrl)}/auth/v1/health`, {
    apikey: anonKey,
  });
  if (!res) return { ...AUTH, state: 'down' };
  if (res.ok) return { ...AUTH, state: 'up', ms };
  return { ...AUTH, state: 'down', ms };
}

export async function runServiceChecks(fetchFn: Fetch, env: StatusEnv): Promise<ServiceCheck[]> {
  return Promise.all([
    checkApi(fetchFn, env.apiUrl),
    checkAiAgents(fetchFn, env.apiUrl),
    checkSignIn(fetchFn, env.supabaseUrl, env.supabaseAnonKey),
  ]);
}
