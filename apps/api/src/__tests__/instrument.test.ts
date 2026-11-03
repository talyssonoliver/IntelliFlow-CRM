/**
 * instrument.ts — OpenTelemetry bootstrap for the standalone API server.
 *
 * Auto-instrumentation only patches modules required AFTER the SDK starts, so
 * main.ts must import './instrument' before anything except the license check.
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

  // Only the license check may come first: it loads no module that tracing patches.
  it('is the first import of main.ts after the license check', () => {
    const source = readFileSync(join(__dirname, '..', 'main.ts'), 'utf8');
    const imports = source.split('\n').filter((line) => line.startsWith('import '));
    expect(imports.slice(0, 2)).toEqual([
      "import '@intelliflow/validators/enforce-license';",
      "import './instrument';",
    ]);
  });
});
