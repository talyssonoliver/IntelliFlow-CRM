/**
 * PG-197: Module Settings — Territory Mapping validators.
 *
 * Enums and limits derive from the domain (DRY rule). Rule values are
 * normalised here with the same functions the matching engine and the DB
 * de-duplication index use, so `SW1A-` and `sw1a` are the same prefix and a
 * blank region is the same as no region.
 */
import { z } from 'zod';
import {
  ISO_COUNTRY_CODES,
  TERRITORY_LIMITS,
  TERRITORY_STRATEGIES,
  normalizeRegion,
  postalMatchKey,
  regionMatchKey,
} from '@intelliflow/domain';
import { idSchema } from './common';
import { ACCOUNT_TAG_COLOR_TOKENS } from './account-settings';

export const territoryStrategySchema = z.enum(TERRITORY_STRATEGIES);

/** ISO 3166-1 alpha-2, trimmed and upper-cased before the check (`UK` is rejected). */
export const isoCountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.enum(ISO_COUNTRY_CODES, { error: 'Use an ISO 3166-1 alpha-2 country code' }));

export const territoryRuleSchema = z.object({
  country: isoCountryCodeSchema,
  region: z
    .string()
    .trim()
    .max(TERRITORY_LIMITS.maxRegionLength)
    .optional()
    .transform((value) => normalizeRegion(value) ?? undefined),
  postalPrefix: z
    .string()
    .trim()
    .max(TERRITORY_LIMITS.maxPostalCodeLength)
    .optional()
    .transform((value) => postalMatchKey(value) ?? undefined),
});
export type TerritoryRuleInput = z.infer<typeof territoryRuleSchema>;

/** The key the DB de-duplication index uses: (country, lower(region), postal key). */
function ruleDedupeKey(rule: TerritoryRuleInput): string {
  return [rule.country, regionMatchKey(rule.region) ?? '', rule.postalPrefix ?? ''].join('|');
}

const territoryFieldsSchema = z.object({
  name: z.string().trim().min(1).max(TERRITORY_LIMITS.maxNameLength),
  description: z.string().trim().max(TERRITORY_LIMITS.maxDescriptionLength).optional(),
  colorToken: z.enum(ACCOUNT_TAG_COLOR_TOKENS),
  strategy: territoryStrategySchema,
  isActive: z.boolean(),
  rules: z.array(territoryRuleSchema).max(TERRITORY_LIMITS.maxRulesPerTerritory),
  memberIds: z.array(idSchema).max(TERRITORY_LIMITS.maxMembersPerTerritory),
});

type TerritoryFields = z.infer<typeof territoryFieldsSchema>;

/** BR-19: duplicate rule triples and duplicate members, reported at the second row. */
function refineTerritory(data: TerritoryFields, ctx: z.RefinementCtx): void {
  const seenRules = new Map<string, number>();
  data.rules.forEach((rule, index) => {
    const key = ruleDedupeKey(rule);
    const first = seenRules.get(key);
    if (first === undefined) {
      seenRules.set(key, index);
      return;
    }
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate rule: rows ${first + 1} and ${index + 1} match the same area`,
      path: ['rules', index],
    });
  });

  const seenMembers = new Map<string, number>();
  data.memberIds.forEach((memberId, index) => {
    const first = seenMembers.get(memberId);
    if (first === undefined) {
      seenMembers.set(memberId, index);
      return;
    }
    ctx.addIssue({
      code: 'custom',
      message: `Duplicate member: rows ${first + 1} and ${index + 1} are the same user`,
      path: ['memberIds', index],
    });
  });
}

export const createTerritorySchema = territoryFieldsSchema.superRefine(refineTerritory);
export type CreateTerritoryInput = z.infer<typeof createTerritorySchema>;

export const updateTerritorySchema = territoryFieldsSchema
  .extend({ id: idSchema })
  .superRefine(refineTerritory);
export type UpdateTerritoryInput = z.infer<typeof updateTerritorySchema>;

export const deleteTerritorySchema = z.object({ id: idSchema });

/** The full set of the tenant's territory ids; first = highest priority. */
export const reorderTerritoriesSchema = z.object({
  ids: z.array(idSchema).min(1).max(TERRITORY_LIMITS.maxTerritoriesPerTenant),
});
export type ReorderTerritoriesInput = z.infer<typeof reorderTerritoriesSchema>;

/** `id: null` clears the default territory. */
export const setDefaultTerritorySchema = z.object({ id: idSchema.nullable() });
export type SetDefaultTerritoryInput = z.infer<typeof setDefaultTerritorySchema>;

/** "Test an address" — every field optional; an empty address resolves to the default. */
export const territoryPreviewSchema = z.object({
  country: z.string().trim().max(2).optional(),
  region: z.string().trim().max(TERRITORY_LIMITS.maxRegionLength).optional(),
  postalCode: z.string().trim().max(TERRITORY_LIMITS.maxPostalCodeLength).optional(),
});
export type TerritoryPreviewInput = z.infer<typeof territoryPreviewSchema>;
