/**
 * HTTP Portal Delivery Sync Adapter
 *
 * Implements {@link PortalDeliverySyncPort} as a thin, single-shot HTTPS client
 * against the Leangency portal's internal API. Auth is `Authorization: Bearer
 * ${PORTAL_INTERNAL_SECRET}` (the same shared secret used on the inbound path,
 * reversed). At-least-once delivery is the caller's concern (the `domain_events`
 * outbox); this adapter just performs one POST and maps the HTTP status to a
 * Result. The portal endpoints are idempotent, so retries are safe.
 *
 * @implements {PortalDeliverySyncPort}
 * @task IFC-314 - CRM→portal delivery/billing sync (step 5)
 */

import { Result, DomainError } from '@intelliflow/domain';
import type {
  PortalDeliverySyncPort,
  PortalTenantProvisionInput,
  PortalDeliveryPushInput,
} from '@intelliflow/application';

/** Domain error raised when a portal sync call cannot be completed or is rejected. */
export class PortalSyncError extends DomainError {
  readonly code = 'PORTAL_SYNC_ERROR';
  constructor(message: string) {
    super(message);
  }
}

export interface PortalDeliverySyncConfig {
  /** Portal internal API base URL, e.g. `https://admin.leangency.com`. */
  baseUrl: string;
  /** Shared service-to-service secret (`PORTAL_INTERNAL_SECRET`). */
  secret: string;
  /** Per-request timeout in ms (default 15000). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_BODY_SNIPPET = 200;

export class HttpPortalDeliverySyncAdapter implements PortalDeliverySyncPort {
  private readonly baseUrl: string;
  private readonly secret: string;
  private readonly timeoutMs: number;

  constructor(config: PortalDeliverySyncConfig) {
    // Trim trailing slashes so `${baseUrl}${path}` never doubles up. Done with a
    // linear loop rather than a `/\/+$/` regex (a `+`-before-`$` pattern trips
    // static ReDoS scanners even though it is, in fact, linear).
    let base = config.baseUrl;
    while (base.endsWith('/')) base = base.slice(0, -1);
    this.baseUrl = base;
    this.secret = config.secret;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async provisionTenant(input: PortalTenantProvisionInput): Promise<Result<void, DomainError>> {
    const res = await this.post('/api/internal/tenants', input);
    if (res.isFailure) return Result.fail(res.error);

    const { status, body } = res.value;
    // 201 created OR 409 slug_conflict → the tenant exists; both are success.
    if (status === 201 || status === 409) return Result.ok(undefined);

    return Result.fail(
      new PortalSyncError(`Tenant provisioning failed: HTTP ${status} ${snippet(body)}`)
    );
  }

  async pushDelivery(input: PortalDeliveryPushInput): Promise<Result<void, DomainError>> {
    const res = await this.post('/api/internal/delivery', input);
    if (res.isFailure) return Result.fail(res.error);

    const { status, body } = res.value;
    if (status === 200) return Result.ok(undefined);

    // 404 tenant_not_found is a real failure: the push raced ahead of
    // provisioning. The caller retries after `provisionTenant` succeeds.
    return Result.fail(
      new PortalSyncError(`Delivery push failed: HTTP ${status} ${snippet(body)}`)
    );
  }

  /** Single POST with Bearer auth + abort-based timeout. Never throws. */
  private async post(
    path: string,
    payload: unknown
  ): Promise<Result<{ status: number; body: string }, DomainError>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.secret}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = await response.text();
      return Result.ok({ status: response.status, body });
    } catch (error) {
      return Result.fail(new PortalSyncError(this.describeError(error, path)));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Turn a thrown fetch error into a log-safe message (timeout vs network vs unknown). */
  private describeError(error: unknown, path: string): string {
    if (error instanceof Error && error.name === 'AbortError') {
      return `Request to ${path} timed out after ${this.timeoutMs}ms`;
    }
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }
}

/** Trim a response body to a short, log-safe snippet. */
function snippet(body: string): string {
  return body.length > MAX_BODY_SNIPPET ? `${body.slice(0, MAX_BODY_SNIPPET)}…` : body;
}

/**
 * Construct the adapter from the runtime env. Throws if either of the two
 * required vars is missing (fail fast at wiring time, not at first push).
 */
export function createHttpPortalDeliverySyncAdapter(): HttpPortalDeliverySyncAdapter {
  const baseUrl = process.env.LEANGENCY_PORTAL_INTERNAL_URL;
  const secret = process.env.PORTAL_INTERNAL_SECRET;
  if (!baseUrl) throw new Error('LEANGENCY_PORTAL_INTERNAL_URL is not set');
  if (!secret) throw new Error('PORTAL_INTERNAL_SECRET is not set');
  return new HttpPortalDeliverySyncAdapter({ baseUrl, secret });
}
