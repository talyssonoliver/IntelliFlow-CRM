/**
 * CustomNodeTypeRegistry — per-tenant map of tenant-registered workflow node
 * types. Follows the same singleton pattern as CaseEventHandlerRegistry
 * (apps/api/src/workflow/handlers/case-handler.ts:862) so hot-path lookups
 * (workflow save validation) don't have to round-trip to Postgres for every
 * workflow step.
 *
 * Population strategy:
 *   • Lazy — on the first lookup for a tenant, loadTenant() hydrates from
 *     `prisma.customNodeType.findMany` and caches in memory
 *   • Invalidation — mutation procedures (create/update/delete) call
 *     invalidateTenant(tenantId) so the next lookup re-reads from disk
 *
 * The registry stores a parsed `CustomNodeTypeDescriptor` so consumers can
 * rebuild a Zod schema via `buildZodFromDescriptors(descriptor.configSchema)`
 * at the moment of validation.
 */

import {
  CustomNodeTypeDescriptorSchema,
  type CustomNodeTypeDescriptor,
} from '@intelliflow/domain';
import type { PrismaClient } from '@intelliflow/db';

type TenantId = string;

export class CustomNodeTypeRegistry {
  private readonly byTenant: Map<TenantId, Map<string, CustomNodeTypeDescriptor>> = new Map();

  /** Hydrate a tenant's cache from Prisma. Idempotent — safe to call on cache hit. */
  async loadTenant(prisma: Pick<PrismaClient, 'customNodeType'>, tenantId: TenantId): Promise<void> {
    if (this.byTenant.has(tenantId)) return;
    const rows = await prisma.customNodeType.findMany({
      where: { tenantId, isActive: true },
    });
    const map = new Map<string, CustomNodeTypeDescriptor>();
    for (const row of rows) {
      const parsed = CustomNodeTypeDescriptorSchema.safeParse({
        id: row.id,
        tenantId: row.tenantId,
        typeId: row.typeId,
        label: row.label,
        description: row.description ?? undefined,
        iconKey: row.iconKey,
        accentClass: row.accentClass,
        configSchema: row.configSchema,
        isActive: row.isActive,
      });
      if (parsed.success) {
        map.set(row.typeId, parsed.data);
      } else {
        console.warn(
          `[CustomNodeTypeRegistry] skipping malformed row tenant=${tenantId} typeId=${row.typeId}`,
          parsed.error.issues
        );
      }
    }
    this.byTenant.set(tenantId, map);
  }

  /** Synchronous registration — used by tests and the admin router after a write. */
  register(tenantId: TenantId, descriptor: CustomNodeTypeDescriptor): void {
    const existing = this.byTenant.get(tenantId) ?? new Map<string, CustomNodeTypeDescriptor>();
    existing.set(descriptor.typeId, descriptor);
    this.byTenant.set(tenantId, existing);
  }

  /** Lookup — returns undefined if not registered or tenant not yet hydrated. */
  get(tenantId: TenantId, typeId: string): CustomNodeTypeDescriptor | undefined {
    return this.byTenant.get(tenantId)?.get(typeId);
  }

  /** All descriptors for a tenant (empty array if not hydrated). */
  list(tenantId: TenantId): CustomNodeTypeDescriptor[] {
    return Array.from(this.byTenant.get(tenantId)?.values() ?? []);
  }

  /** Force a re-hydrate on the next lookup — call after a CRUD mutation. */
  invalidateTenant(tenantId: TenantId): void {
    this.byTenant.delete(tenantId);
  }

  /** Test helper — wipe everything. */
  reset(): void {
    this.byTenant.clear();
  }
}

let registry: CustomNodeTypeRegistry | null = null;

export function getCustomNodeTypeRegistry(): CustomNodeTypeRegistry {
  registry ??= new CustomNodeTypeRegistry();
  return registry;
}

export function resetCustomNodeTypeRegistry(): void {
  registry = null;
}
