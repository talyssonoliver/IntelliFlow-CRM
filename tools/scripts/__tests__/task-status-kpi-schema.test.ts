import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kpiEntrySchema } from '../lib/schemas/task-status.schema';

// IFC-074 D7 / AC-012: a KPI may name the evidence behind its actual value
// (`source`, e.g. a report file and its SHA-256); `met` stays a boolean.
const GENERATED = JSON.parse(
  readFileSync(
    join(__dirname, '../../../apps/project-tracker/docs/metrics/schemas/task-status.schema.json'),
    'utf8'
  )
);
const kpiJson = GENERATED.properties.kpis.additionalProperties;

const KPI = { target: 2, actual: 'pending', met: false, unit: 'minutes' };

describe('kpiEntrySchema (Zod source of truth)', () => {
  it('accepts a KPI with a string source', () => {
    const parsed = kpiEntrySchema.safeParse({
      ...KPI,
      source: 'artifacts/reports/x.json sha256 ab',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data).toHaveProperty('source', 'artifacts/reports/x.json sha256 ab');
  });

  it('accepts met: false and a KPI without source', () => {
    expect(kpiEntrySchema.safeParse(KPI).success).toBe(true);
  });

  it.each([null, 'false', undefined])('rejects a met that is not a boolean (%j)', (met) => {
    expect(kpiEntrySchema.safeParse({ ...KPI, met }).success).toBe(false);
  });

  it('rejects a non-string source', () => {
    expect(kpiEntrySchema.safeParse({ ...KPI, source: 42 }).success).toBe(false);
  });
});

describe('task-status.schema.json KPI object (generated)', () => {
  it('declares an optional string source', () => {
    expect(kpiJson.properties.source).toMatchObject({ type: 'string' });
    expect(kpiJson.required).toEqual(['target', 'actual', 'met']);
  });

  it('still forbids any other extra key and keeps met a boolean', () => {
    expect(kpiJson.additionalProperties).toBe(false);
    expect(kpiJson.properties.met).toMatchObject({ type: 'boolean' });
    expect(Object.keys(kpiJson.properties).sort()).toEqual(
      ['actual', 'met', 'source', 'target', 'unit'].sort()
    );
  });
});
