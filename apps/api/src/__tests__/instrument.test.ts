/**
 * instrument.ts — OpenTelemetry bootstrap for the standalone API server.
 *
 * Auto-instrumentation only patches modules required AFTER the SDK starts, so
 * main.ts must import './instrument' before anything else.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { startTracing } = vi.hoisted(() => ({ startTracing: vi.fn() }));
vi.mock('../tracing/otel', () => ({ startTracing }));

describe('instrument.ts', () => {
  const original = process.env.OTEL_ENABLED;

  beforeEach(() => {
    vi.resetModules();
    startTracing.mockClear();
  });

  afterEach(() => {
    if (original === undefined) delete process.env.OTEL_ENABLED;
    else process.env.OTEL_ENABLED = original;
  });

  it('starts tracing on import', async () => {
    process.env.OTEL_ENABLED = 'true';
    await import('../instrument.js');
    expect(startTracing).toHaveBeenCalledTimes(1);
  });

  it('does not start tracing when OTEL_ENABLED is "false"', async () => {
    process.env.OTEL_ENABLED = 'false';
    await import('../instrument.js');
    expect(startTracing).not.toHaveBeenCalled();
  });

  it('is the first import of main.ts', () => {
    const source = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports[0]).toBe("import './instrument';");
  });
});
