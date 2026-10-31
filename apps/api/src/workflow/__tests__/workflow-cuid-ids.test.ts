/**
 * Workflow payloads accept cuid record ids (#1075).
 *
 * The case on a case event is a database record, so its id is a cuid; the schema
 * validated it as a UUID. (The DSAR request schema this also covered was removed
 * on main by PG-203, #1056.)
 */

import { describe, it, expect } from 'vitest';

import { caseEventPayloadSchema } from '../handlers/case-handler';

const CUID = 'cmhbx3k2p0000l8086a1b2c3d';

function idIssues(schema: typeof caseEventPayloadSchema, field: string, value: unknown) {
  const result = schema.safeParse({ [field]: value });
  return result.success ? [] : result.error.issues.filter((i) => i.path[0] === field);
}

describe('workflow payloads accept cuid record ids (#1075)', () => {
  it.each([['caseEventPayload', 'caseId', caseEventPayloadSchema]] as const)(
    '%s accepts a cuid %s and rejects an unsafe one',
    (_name, field, schema) => {
      expect(idIssues(schema, field, CUID)).toEqual([]);
      expect(idIssues(schema, field, '../etc')).not.toEqual([]);
    }
  );
});
