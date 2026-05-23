/**
 * IFC-032 — capture-trace-examples.ts integration test
 *
 * Lives in apps/api/scripts/__tests__ rather than tools/scripts/observability
 * so it has access to apps/api's @opentelemetry/api dep tree (which the root
 * project does not have on disk). The test imports captureAndWrite directly
 * (not as a subprocess) and exercises the real LeadRoutingService against
 * three seeded scenarios via InMemorySpanExporter.
 *
 * Two cases:
 *   1. produces 3+ examples with valid 32-hex trace IDs and 16-hex span IDs
 *   2. output JSON conforms to all required fields and patterns of
 *      trace-examples.schema.json (closed schema)
 */

import { vi, describe, it, expect } from 'vitest';

// Re-mock @opentelemetry/api with the real module so BasicTracerProvider
// emits real spans. The apps/api setup.ts (apps/api/src/test/setup.ts:40-64)
// stubs @opentelemetry/api globally; importActual undoes that for this file.
vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual<typeof import('@opentelemetry/api')>('@opentelemetry/api');
  return actual;
});

import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { captureAndWrite } from '../../../../tools/scripts/observability/capture-trace-examples';

const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');
const SCHEMA_PATH = join(
  REPO_ROOT,
  'apps',
  'project-tracker',
  'docs',
  'metrics',
  'schemas',
  'trace-examples.schema.json'
);

describe('capture-trace-examples (IFC-032)', () => {
  it('produces 3+ examples with valid 32-hex trace IDs and 16-hex span IDs', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ifc-032-trace-'));
    const out = join(tmp, 'trace-examples.json');
    try {
      const { count } = await captureAndWrite(out);
      expect(count).toBeGreaterThanOrEqual(3);
      expect(existsSync(out)).toBe(true);

      const parsed = JSON.parse(readFileSync(out, 'utf8'));
      expect(parsed.schema_version).toBe('1.0.0');
      expect(parsed.exporter).toBe('InMemorySpanExporter');
      expect(parsed.task_id).toBe('IFC-032');
      expect(Array.isArray(parsed.examples)).toBe(true);
      expect(parsed.examples.length).toBeGreaterThanOrEqual(3);

      for (const example of parsed.examples) {
        expect(example.trace_id).toMatch(/^[0-9a-f]{32}$/);
        expect(example.span_id).toMatch(/^[0-9a-f]{16}$/);
        expect(example.workflow_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
        expect(typeof example.duration_ms).toBe('number');
        expect(['OK', 'ERROR', 'UNSET']).toContain(example.status);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('output JSON conforms to all required fields and patterns of trace-examples.schema.json', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ifc-032-trace-'));
    const out = join(tmp, 'trace-examples.json');
    try {
      await captureAndWrite(out);
      const parsed = JSON.parse(readFileSync(out, 'utf8'));
      const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

      // Top-level required
      for (const key of schema.required) {
        expect(parsed).toHaveProperty(key);
      }
      // Closed top-level
      const allowedTop = new Set(Object.keys(schema.properties));
      for (const key of Object.keys(parsed)) {
        expect(allowedTop.has(key)).toBe(true);
      }
      // schema_version enum + source pattern
      expect(schema.properties.schema_version.enum).toContain(parsed.schema_version);
      expect(parsed.source).toMatch(new RegExp(schema.properties.source.pattern));

      const exampleSchema = schema.properties.examples.items;
      const allowedExampleKeys = new Set(Object.keys(exampleSchema.properties));
      for (const example of parsed.examples) {
        for (const reqKey of exampleSchema.required) {
          expect(example).toHaveProperty(reqKey);
        }
        for (const key of Object.keys(example)) {
          expect(allowedExampleKeys.has(key)).toBe(true);
        }
        expect(example.trace_id).toMatch(new RegExp(exampleSchema.properties.trace_id.pattern));
        expect(example.span_id).toMatch(new RegExp(exampleSchema.properties.span_id.pattern));
        expect(example.workflow_id).toMatch(
          new RegExp(exampleSchema.properties.workflow_id.pattern)
        );
        expect(exampleSchema.properties.routing_method.enum).toContain(example.routing_method);
        expect(exampleSchema.properties.status.enum).toContain(example.status);
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
