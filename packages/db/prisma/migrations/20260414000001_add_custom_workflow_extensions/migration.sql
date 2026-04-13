-- IFC-031 FU-011 / FU-012: User-extensible custom workflow node types + action handlers
--
-- Two tenant-scoped tables that back the Workflow Builder's admin UI at
--   /settings/automation/custom-node-types
--   /settings/automation/custom-actions
--
-- The `configSchema`, `inputSchema`, `outputSchema` columns store a
-- `FieldDescriptor[]` which is reconstructed into a Zod schema at runtime
-- (see packages/domain/src/workflow/node-catalog.ts buildZodFromDescriptors).

-- CreateTable: custom_node_types
CREATE TABLE "custom_node_types" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT NOT NULL DEFAULT 'extension',
    "accentClass" TEXT NOT NULL DEFAULT 'border-slate-500/60 bg-slate-500/5',
    "configSchema" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "custom_node_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_node_types_tenantId_typeId_key" ON "custom_node_types"("tenantId", "typeId");
CREATE INDEX "custom_node_types_tenantId_idx" ON "custom_node_types"("tenantId");

ALTER TABLE "custom_node_types"
    ADD CONSTRAINT "custom_node_types_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: custom_action_handlers
CREATE TABLE "custom_action_handlers" (
    "id" TEXT NOT NULL,
    "actionTypeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "endpointUrl" TEXT NOT NULL,
    "authHeader" TEXT,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "inputSchema" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "outputSchema" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "custom_action_handlers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "custom_action_handlers_tenantId_actionTypeId_key" ON "custom_action_handlers"("tenantId", "actionTypeId");
CREATE INDEX "custom_action_handlers_tenantId_idx" ON "custom_action_handlers"("tenantId");

ALTER TABLE "custom_action_handlers"
    ADD CONSTRAINT "custom_action_handlers_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (IFC-127: multi-tenant isolation at DB layer)
ALTER TABLE "custom_node_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "custom_action_handlers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_custom_node_types" ON "custom_node_types"
    FOR ALL
    USING ("tenantId" = current_setting('app.tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));

CREATE POLICY "tenant_isolation_custom_action_handlers" ON "custom_action_handlers"
    FOR ALL
    USING ("tenantId" = current_setting('app.tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
