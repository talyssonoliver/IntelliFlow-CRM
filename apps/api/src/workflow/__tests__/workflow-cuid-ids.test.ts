/**
 * Workflow payloads accept cuid record ids (#1075).
 *
 * The DSAR subject and the case on a case event are database records, so their ids
 * are cuids; both schemas validated them as UUIDs.
 */

import { describe, it, expect } from 'vitest';

import { dsarRequestSchema } from '../dsar-workflow';
import { caseEventPayloadSchema } from '../handlers/case-handler';

const CUID = 'cmhbx3k2p0000l8086a1b2c3d';

function idIssues(
  schema: typeof dsarRequestSchema | typeof caseEventPayloadSchema,
  field: string,
  value: unknown
) {
  const result = schema.safeParse({ [field]: value });
  return result.success ? [] : result.error.issues.filter((i) => i.path[0] === field);
}

describe('workflow payloads accept cuid record ids (#1075)', () => {
  it.each([
    ['dsarRequest', 'subjectId', dsarRequestSchema],
    ['caseEventPayload', 'caseId', caseEventPayloadSchema],
  ] as const)('%s accepts a cuid %s and rejects an unsafe one', (_name, field, schema) => {
    expect(idIssues(schema, field, CUID)).toEqual([]);
    expect(idIssues(schema, field, '../etc')).not.toEqual([]);
  });
});
