import { describe, it, expect } from 'vitest';
import { mapAuditEntry, readAuditMetadata, type AuditTrailRow } from '../audit-trail';

const row = (overrides: Partial<AuditTrailRow> = {}): AuditTrailRow => ({
  id: 'audit-1',
  eventType: 'ACCESS_GRANTED',
  userId: 'user-1',
  changes: null,
  metadata: null,
  createdAt: '2026-10-04T10:00:00.000Z',
  ...overrides,
});

describe('mapAuditEntry', () => {
  // The exact shape documents.getAuditTrail returns (camelCase). The page used
  // to read event_type/user_id/created_at, which threw on every real row.
  it('maps an API row without throwing', () => {
    expect(mapAuditEntry(row(), 0, 1)).toEqual({
      id: 'audit-1',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      action: 'Access granted',
      timestamp: '2026-10-04T10:00:00.000Z',
      performedBy: 'user-1',
      changes: null,
      metadata: null,
    });
  });

  it('takes the version from metadata and serializes changes', () => {
    const entry = mapAuditEntry(
      row({
        eventType: 'VERSIONED',
        changes: { title: ['a', 'b'] },
        metadata: { version: { major: 2, minor: 1, patch: 3 }, sizeBytes: 2048 },
      }),
      0,
      3
    );
    expect(entry).toMatchObject({
      versionMajor: 2,
      versionMinor: 1,
      versionPatch: 3,
      action: 'Versioned',
      changes: '{"title":["a","b"]}',
      metadata: { sizeBytes: 2048 },
    });
  });

  it('derives the patch number from position when metadata has no version', () => {
    expect(mapAuditEntry(row(), 0, 3).versionPatch).toBe(2);
    expect(mapAuditEntry(row(), 2, 3).versionPatch).toBe(0);
  });

  it('accepts a Date createdAt (server-side callers)', () => {
    const entry = mapAuditEntry(row({ createdAt: new Date('2026-10-04T10:00:00Z') }), 0, 1);
    expect(entry.timestamp).toBe('2026-10-04T10:00:00.000Z');
  });
});

describe('readAuditMetadata', () => {
  it.each([null, undefined, 'text', 42, ['a']])('returns null for non-object %p', (v) => {
    expect(readAuditMetadata(v)).toBeNull();
  });

  it('keeps only numeric fields', () => {
    expect(
      readAuditMetadata({ version: { major: '2', minor: 1 }, sizeBytes: 'big', extra: true })
    ).toEqual({
      version: { major: undefined, minor: 1, patch: undefined },
      sizeBytes: undefined,
    });
  });

  it('ignores a non-object version', () => {
    expect(readAuditMetadata({ version: 'v2', sizeBytes: 10 })).toEqual({
      version: undefined,
      sizeBytes: 10,
    });
  });
});
