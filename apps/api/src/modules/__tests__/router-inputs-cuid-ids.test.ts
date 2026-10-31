/**
 * Router inputs accept cuid record ids (#1075).
 *
 * Every core model uses `@default(cuid())`, so a procedure input that validates an
 * id as a UUID rejects every real record. Each case parses the procedure's own input
 * schema(s) and looks only at issues on the id field, so the other required fields
 * of the payload do not matter here.
 */

import { describe, it, expect } from 'vitest';
import type { ZodType } from 'zod';

import { intelligenceRouter } from '../intelligence/intelligence.router';
import { opportunityRouter } from '../opportunity/opportunity.router';
import { chainVersionRouter } from '../chain-version/chain-version.router';
import { documentsRouter } from '../legal/documents.router';

// The shape Prisma's @default(cuid()) issues: 'c' plus 24 lower-case base36 chars.
const CUID = 'cmhbx3k2p0000l8086a1b2c3d';
const SEED_UUID = '0b6f3c1e-8f2a-4c3d-9e4f-5a6b7c8d9e0f';
const UNSAFE = '../etc';

type AnyRouter = { _def: { procedures: Record<string, unknown> } };

function inputsOf(router: AnyRouter, procedure: string): ZodType[] {
  const proc = router._def.procedures[procedure] as { _def?: { inputs?: ZodType[] } } | undefined;
  const inputs = proc?._def?.inputs ?? [];
  if (inputs.length === 0) throw new Error(`${procedure} has no input schema`);
  return inputs;
}

/** Issues reported on `field` when only that field is set to `value`. */
function idIssues(router: AnyRouter, procedure: string, field: string, value: unknown) {
  return inputsOf(router, procedure).flatMap((schema) => {
    const result = schema.safeParse({ [field]: value });
    return result.success ? [] : result.error.issues.filter((i) => i.path[0] === field);
  });
}

const CASES: Array<[string, string, string, AnyRouter]> = [
  ['intelligence', 'getInsightsSummary', 'entityId', intelligenceRouter],
  ['intelligence', 'triggerPrediction', 'entityId', intelligenceRouter],
  ['intelligence', 'getLeadInsights', 'leadId', intelligenceRouter],
  ['intelligence', 'getContactInsights', 'contactId', intelligenceRouter],
  ['intelligence', 'updateLeadInsights', 'leadId', intelligenceRouter],
  ['intelligence', 'updateContactInsights', 'contactId', intelligenceRouter],
  ['opportunity', 'restore', 'id', opportunityRouter],
  ['opportunity', 'permanentDelete', 'id', opportunityRouter],
  ['opportunity', 'dealForecast', 'id', opportunityRouter],
  ['chainVersion', 'update', 'versionId', chainVersionRouter],
  ['chainVersion', 'activate', 'versionId', chainVersionRouter],
  ['chainVersion', 'deprecate', 'versionId', chainVersionRouter],
  ['chainVersion', 'archive', 'versionId', chainVersionRouter],
  ['chainVersion', 'rollback', 'versionId', chainVersionRouter],
  ['chainVersion', 'getById', 'versionId', chainVersionRouter],
  ['chainVersion', 'getAuditLog', 'versionId', chainVersionRouter],
  ['chainVersion', 'compare', 'versionIdA', chainVersionRouter],
  ['chainVersion', 'compare', 'versionIdB', chainVersionRouter],
  ['documents', 'create', 'relatedCaseId', documentsRouter],
  ['documents', 'create', 'relatedContactId', documentsRouter],
  ['documents', 'createVersion', 'documentId', documentsRouter],
  ['documents', 'getById', 'id', documentsRouter],
  ['documents', 'list', 'caseId', documentsRouter],
  ['documents', 'grantAccess', 'documentId', documentsRouter],
  ['documents', 'grantAccess', 'principalId', documentsRouter],
  ['documents', 'revokeAccess', 'documentId', documentsRouter],
  ['documents', 'revokeAccess', 'principalId', documentsRouter],
  ['documents', 'submitForReview', 'documentId', documentsRouter],
  ['documents', 'approve', 'documentId', documentsRouter],
  ['documents', 'sign', 'documentId', documentsRouter],
  ['documents', 'archive', 'documentId', documentsRouter],
  ['documents', 'placeLegalHold', 'documentId', documentsRouter],
  ['documents', 'releaseLegalHold', 'documentId', documentsRouter],
  ['documents', 'delete', 'documentId', documentsRouter],
  ['documents', 'getSignedUrl', 'documentId', documentsRouter],
  ['documents', 'getAuditTrail', 'documentId', documentsRouter],
];

describe('router inputs accept cuid record ids (#1075)', () => {
  it.each(CASES)('%s.%s accepts a cuid %s', (_r, procedure, field, router) => {
    expect(idIssues(router, procedure, field, CUID)).toEqual([]);
  });

  it.each(CASES)('%s.%s still accepts a seed uuid %s', (_r, procedure, field, router) => {
    expect(idIssues(router, procedure, field, SEED_UUID)).toEqual([]);
  });

  it.each(CASES)('%s.%s rejects an unsafe %s', (_r, procedure, field, router) => {
    expect(idIssues(router, procedure, field, UNSAFE)).not.toEqual([]);
  });
});
