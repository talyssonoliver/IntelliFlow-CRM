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

import type { PrismaClient } from '@intelliflow/db';
import {
  buildZodFromDescriptors,
  isPublicHttpUrl,
  type CustomActionHandlerDescriptor,
} from '@intelliflow/domain';
import { getCustomActionHandlerRegistry } from '../registries/custom-action-handler-registry';

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

  const start = Date.now();
  try {
    const res = await fetch(descriptor.endpointUrl, {
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
