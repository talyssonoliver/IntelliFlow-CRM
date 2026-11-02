/**
 * Shared schemas that carry record ids accept cuids (#1075).
 *
 * These fields validated ids with `z.uuid()`, but every core model uses
 * `@default(cuid())`. Each case looks only at issues on the id field.
 */

import { describe, it, expect } from 'vitest';
import type { ZodType } from 'zod';

import {
  qualificationInputSchema,
  emailWriterInputSchema,
  followupInputSchema,
  churnRiskInputSchema,
} from '../ai';
import {
  createChainVersionSchema,
  chainVersionSchema,
  chainVersionSummarySchema,
  activateVersionSchema,
  rollbackVersionSchema,
  rollbackResultSchema,
  chainVersionAuditSchema,
} from '../chain-version';
import { setTeamMemberGoalInputSchema } from '../home';

const CUID = 'cmhbx3k2p0000l8086a1b2c3d';

const CASES: Array<[string, string, ZodType]> = [
  ['qualificationInput', 'leadId', qualificationInputSchema],
  ['emailWriterInput', 'leadId', emailWriterInputSchema],
  ['followupInput', 'leadId', followupInputSchema],
  ['churnRiskInput', 'entityId', churnRiskInputSchema],
  ['churnRiskInput', 'tenantId', churnRiskInputSchema],
  ['createChainVersion', 'parentVersionId', createChainVersionSchema],
  ['chainVersion', 'id', chainVersionSchema],
  ['chainVersion', 'parentVersionId', chainVersionSchema],
  ['chainVersionSummary', 'id', chainVersionSummarySchema],
  ['activateVersion', 'versionId', activateVersionSchema],
  ['rollbackVersion', 'versionId', rollbackVersionSchema],
  ['rollbackResult', 'previousVersionId', rollbackResultSchema],
  ['rollbackResult', 'rolledBackVersionId', rollbackResultSchema],
  ['rollbackResult', 'auditId', rollbackResultSchema],
  ['chainVersionAudit', 'id', chainVersionAuditSchema],
  ['chainVersionAudit', 'versionId', chainVersionAuditSchema],
  ['setTeamMemberGoalInput', 'targetUserId', setTeamMemberGoalInputSchema],
];

function idIssues(schema: ZodType, field: string, value: unknown) {
  const result = schema.safeParse({ [field]: value });
  return result.success ? [] : result.error.issues.filter((i) => i.path[0] === field);
}

describe('shared schemas accept cuid record ids (#1075)', () => {
  it.each(CASES)('%s accepts a cuid %s', (_schema, field, schema) => {
    expect(idIssues(schema, field, CUID)).toEqual([]);
  });

  it.each(CASES)('%s rejects an unsafe %s', (_schema, field, schema) => {
    expect(idIssues(schema, field, '../etc')).not.toEqual([]);
  });
});
