/**
 * Custom Action Dispatcher (IFC-031 FU-012)
 *
 * Executes a tenant-registered CustomActionHandler by POSTing the step's
 * filtered params to the handler's endpointUrl with its authHeader. Used
 * by the workflow execution engine when a step has `actionType: 'custom'`.
 *
 * Security:
 *   • SSRF guard via isPublicHttpUrl — blocks loopback / RFC1918 / link-local
 *   • Redirects disabled (`redirect: 'manual'`) to prevent follow-to-private
 *   • Timeout bounded by handler's `timeoutMs` (clamped to ≤120s)
 *   • authHeader NOT logged / returned to the workflow execution record
 */

import { promises as dns } from 'node:dns';
import type { PrismaClient } from '@intelliflow/db';
import {
  buildZodFromDescriptors,
  isPublicHttpUrl,
  isPublicIpAddress,
  type CustomActionHandlerDescriptor,
} from '@intelliflow/domain';
import { getCustomActionHandlerRegistry } from '../registries/custom-action-handler-registry';

/**
 * DNS-rebinding defense: resolve the hostname BEFORE the fetch, validate
 * every returned address against the SSRF blocklist, and pin the connection
 * to the first valid address by rewriting the URL to use the IP literal
 * (with the original host preserved via a `Host` request header so TLS SNI
 * + virtual-hosting still work).
 *
 * Returns either a safe `{ url, host }` pair to use for the fetch, or an
 * error string explaining why the host was rejected.
 */
export async function resolveAndPin(
  rawUrl: string
): Promise<{ url: string; host: string } | { error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: 'Invalid URL' };
  }

  // If the host is already an IP literal, the static guard already covered it.
  const rawHost = parsed.hostname;
  const isLiteral = /^(\d{1,3}\.){3}\d{1,3}$/.test(rawHost) || rawHost.includes(':');
  if (isLiteral) {
    if (!isPublicIpAddress(rawHost)) {
      return { error: `endpointUrl resolved IP ${rawHost} is in the SSRF blocklist` };
    }
    return { url: parsed.toString(), host: rawHost };
  }

  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(rawHost, { all: true });
  } catch (err) {
    return {
      error: `DNS lookup failed for ${rawHost}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (addrs.length === 0) {
    return { error: `DNS lookup returned no addresses for ${rawHost}` };
  }
  // Reject if ANY resolved address is private — DNS-rebinding mitigations
  // typically reject the host outright rather than cherry-pick a public IP.
  for (const a of addrs) {
    if (!isPublicIpAddress(a.address)) {
      return {
        error: `endpointUrl ${rawHost} resolves to non-public address ${a.address}; rejected to prevent DNS-rebinding SSRF`,
      };
    }
  }

  // Pin to the first resolved address. Wrap IPv6 in brackets for URL syntax.
  const pinned = addrs[0].address;
  const pinnedUrl = new URL(parsed.toString());
  pinnedUrl.hostname = addrs[0].family === 6 ? `[${pinned}]` : pinned;
  return { url: pinnedUrl.toString(), host: rawHost };
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  body: unknown;
  durationMs: number;
  errorMessage?: string;
}

export interface DispatchInput {
  tenantId: string;
  /** The handler id (from CustomActionHandler.id, stored on the step as customActionId). */
  customActionId: string;
  /** Raw step params — will be filtered by the handler's inputSchema before sending. */
  params: Record<string, unknown>;
}

export async function dispatchCustomAction(
  prisma: Pick<PrismaClient, 'customActionHandler'>,
  input: DispatchInput
): Promise<DispatchResult> {
  const registry = getCustomActionHandlerRegistry();
  await registry.loadTenant(prisma as never, input.tenantId);
  const descriptor = registry.getById(input.tenantId, input.customActionId);
  if (!descriptor) {
    return {
      ok: false,
      status: 0,
      body: null,
      durationMs: 0,
      errorMessage: `No custom action handler registered for id=${input.customActionId}`,
    };
  }
  if (!descriptor.isActive) {
    return {
      ok: false,
      status: 0,
      body: null,
      durationMs: 0,
      errorMessage: `Custom action handler ${descriptor.actionTypeId} is deactivated`,
    };
  }
  return executeDispatch(descriptor, input.params);
}

async function executeDispatch(
  descriptor: CustomActionHandlerDescriptor,
  rawParams: Record<string, unknown>
): Promise<DispatchResult> {
  if (!isPublicHttpUrl(descriptor.endpointUrl)) {
    return {
      ok: false,
      status: 0,
      body: null,
      durationMs: 0,
      errorMessage: 'endpointUrl blocked by SSRF guard',
    };
  }

  // Filter params by inputSchema — unknown keys are dropped, required keys
  // validated. A parse failure returns a structured error without posting.
  const schema = buildZodFromDescriptors(descriptor.inputSchema);
  const parsed = schema.safeParse(rawParams);
  if (!parsed.success) {
    return {
      ok: false,
      status: 0,
      body: null,
      durationMs: 0,
      errorMessage: `Input validation failed: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    };
  }

  const timeoutMs = Math.min(descriptor.timeoutMs ?? 30000, 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-IntelliFlow-Source': 'workflow-custom-action',
    'X-IntelliFlow-ActionType': descriptor.actionTypeId,
  };
  if (descriptor.authHeader) headers['Authorization'] = descriptor.authHeader;

  // Defense-in-depth: resolve DNS, verify each address, pin the connection
  // to the resolved IP with the original Host header. Defeats DNS rebinding
  // where the static URL guard inspected only the hostname string.
  const pin = await resolveAndPin(descriptor.endpointUrl);
  if ('error' in pin) {
    clearTimeout(timer);
    return {
      ok: false,
      status: 0,
      body: null,
      durationMs: 0,
      errorMessage: pin.error,
    };
  }
  headers['Host'] = pin.host;

  const start = Date.now();
  try {
    const res = await fetch(pin.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
      redirect: 'manual',
    });
    let body: unknown;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } else {
      body = (await res.text()).slice(0, 4000);
    }
    return {
      ok: res.ok,
      status: res.status,
      body,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      body: null,
      durationMs: Date.now() - start,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
