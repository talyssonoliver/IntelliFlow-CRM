/**
 * Audit handler override tests (IFC-240)
 *
 * createCrudEntry / createBulkOperationEntry gained optional `eventType` and
 * `dataClassification` overrides so callers can emit canonical event names and
 * the correct PII classification. The default eventType derivation only yields
 * valid past-tense names for CRUD verbs ending in 'e' (Create/Update/Delete);
 * non-CRUD actions (QUALIFY/CONVERT/READ/AI_SCORE) must pass an explicit name.
 */

import { describe, it, expect } from 'vitest';
import { createCrudEntry, createBulkOperationEntry } from '../audit';

describe('createCrudEntry — IFC-240 overrides', () => {
  it('uses the explicit canonical eventType + classification when provided', () => {
    const entry = createCrudEntry('QUALIFY', 'lead', 'lead-1', 'tenant-1', {
      actorId: 'user-1',
      eventType: 'LeadQualified',
      dataClassification: 'CONFIDENTIAL',
    });

    expect(entry.eventType).toBe('LeadQualified');
    expect(entry.dataClassification).toBe('CONFIDENTIAL');
    expect(entry.action).toBe('QUALIFY');
    expect(entry.resourceType).toBe('lead');
    expect(entry.resourceId).toBe('lead-1');
  });

  it('falls back to the derived eventType for CRUD verbs when none is provided', () => {
    const entry = createCrudEntry('CREATE', 'lead', 'lead-1', 'tenant-1', { actorId: 'user-1' });

    // CREATE/UPDATE/DELETE end in 'e' so the legacy derivation is correct.
    expect(entry.eventType).toBe('LeadCreated');
    // No explicit classification → undefined here; the writer applies the config default.
    expect(entry.dataClassification).toBeUndefined();
  });
});

describe('createBulkOperationEntry — IFC-240 overrides', () => {
  it('uses the explicit dataClassification when provided', () => {
    const entry = createBulkOperationEntry('BULK_DELETE', 'lead', ['l1', 'l2'], 'tenant-1', {
      actorId: 'user-1',
      dataClassification: 'CONFIDENTIAL',
      successCount: 2,
      failureCount: 0,
    });

    expect(entry.dataClassification).toBe('CONFIDENTIAL');
    expect(entry.action).toBe('BULK_DELETE');
    expect(entry.resourceType).toBe('lead');
    expect(entry.resourceId).toBe('l1,l2');
  });
});
