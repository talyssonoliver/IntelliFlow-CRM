/**
 * CustomActionHandlerRegistry — per-tenant map of tenant-registered webhook
 * action handlers. Mirrors CustomNodeTypeRegistry and the CaseEventHandler
 * singleton pattern.
 *
 * A registered handler is effectively a webhook shim: the workflow engine
 * POSTs the step's `params` (filtered by `inputSchema`) to the handler's
 * `endpointUrl` with an optional `authHeader`. The registry is the hot-path
 * cache so the engine doesn't hit Postgres for every workflow step.
 */

import {
  CustomActionHandlerDescriptorSchema,
  type CustomActionHandlerDescriptor,
} from '@intelliflow/domain';
import type { PrismaClient } from '@intelliflow/db';

type TenantId = string;

export class CustomActionHandlerRegistry {
  private readonly byTenant: Map<TenantId, Map<string, CustomActionHandlerDescriptor>> = new Map();

  async loadTenant(
    prisma: Pick<PrismaClient, 'customActionHandler'>,
    tenantId: TenantId
  ): Promise<void> {
    if (this.byTenant.has(tenantId)) return;
    const rows = await prisma.customActionHandler.findMany({
      where: { tenantId, isActive: true },
    });
    const map = new Map<string, CustomActionHandlerDescriptor>();
    for (const row of rows) {
      const parsed = CustomActionHandlerDescriptorSchema.safeParse({
        id: row.id,
        tenantId: row.tenantId,
        actionTypeId: row.actionTypeId,
        label: row.label,
        description: row.description ?? undefined,
        endpointUrl: row.endpointUrl,
        authHeader: row.authHeader ?? undefined,
        timeoutMs: row.timeoutMs,
        inputSchema: row.inputSchema,
        outputSchema: row.outputSchema,
        isActive: row.isActive,
      });
      if (parsed.success) {
        map.set(row.actionTypeId, parsed.data);
      } else {
        console.warn(
          `[CustomActionHandlerRegistry] skipping malformed row tenant=${tenantId} id=${row.actionTypeId}`,
          parsed.error.issues
        );
      }
    }
    this.byTenant.set(tenantId, map);
  }

  register(tenantId: TenantId, descriptor: CustomActionHandlerDescriptor): void {
    const existing =
      this.byTenant.get(tenantId) ?? new Map<string, CustomActionHandlerDescriptor>();
    existing.set(descriptor.actionTypeId, descriptor);
    this.byTenant.set(tenantId, existing);
  }

  get(tenantId: TenantId, actionTypeId: string): CustomActionHandlerDescriptor | undefined {
    return this.byTenant.get(tenantId)?.get(actionTypeId);
  }

  /** Lookup by the internal db id — used by workflow engine dispatch. */
  getById(tenantId: TenantId, id: string): CustomActionHandlerDescriptor | undefined {
    const map = this.byTenant.get(tenantId);
    if (!map) return undefined;
    for (const d of map.values()) {
      if (d.id === id) return d;
    }
    return undefined;
  }

  list(tenantId: TenantId): CustomActionHandlerDescriptor[] {
    return Array.from(this.byTenant.get(tenantId)?.values() ?? []);
  }

  invalidateTenant(tenantId: TenantId): void {
    this.byTenant.delete(tenantId);
  }

  reset(): void {
    this.byTenant.clear();
  }
}

let registry: CustomActionHandlerRegistry | null = null;

export function getCustomActionHandlerRegistry(): CustomActionHandlerRegistry {
  registry ??= new CustomActionHandlerRegistry();
  return registry;
}

export function resetCustomActionHandlerRegistry(): void {
  registry = null;
}
