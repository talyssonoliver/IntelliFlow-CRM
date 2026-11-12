/** Types for generate-tenant-models.mjs, so tests can import it. */
export interface ParsedTenantModel {
  model: string;
  nullable: boolean;
  defaulted: boolean;
  relation: string | null;
}

export const SCHEMA_PATH: string;
export const OUTPUT_PATH: string;
export function parseTenantModels(schemaText: string): ParsedTenantModel[];
export function renderTenantModels(models: ParsedTenantModel[]): string;
