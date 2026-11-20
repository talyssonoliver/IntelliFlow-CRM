import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { disableZodJit, type ZodGlobal } from '../zod-jitless';

type Target = ZodGlobal;

describe('disableZodJit', () => {
  it('turns zod jitless on, which stops its new Function probe (a CSP report on every page)', () => {
    const target = {} as Target;

    disableZodJit(target);

    expect(target.__zod_globalConfig).toEqual({ jitless: true });
  });

  it('keeps the config object zod already created, and its other settings', () => {
    const existing = { customError: 'kept' };
    const target = { __zod_globalConfig: existing } as unknown as Target;

    disableZodJit(target);

    // Zod reads this very object (`globalThis.__zod_globalConfig ??= {}`), so it must not be replaced.
    expect(target.__zod_globalConfig).toBe(existing);
    expect(existing).toEqual({ customError: 'kept', jitless: true });
  });

  it('is idempotent', () => {
    const target = {} as Target;

    disableZodJit(target);
    disableZodJit(target);

    expect(target.__zod_globalConfig).toEqual({ jitless: true });
  });

  it('has already switched it on for this process by being imported', () => {
    expect((globalThis as Target).__zod_globalConfig?.jitless).toBe(true);
  });
});

describe('instrumentation-client', () => {
  it('imports the switch before anything that could build a zod schema', () => {
    const file = path.resolve(__dirname, '../../../instrumentation-client.ts');
    const imports = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((line) => /^import\s/.test(line));

    expect(imports[0]).toBe("import './lib/security/zod-jitless';");
  });
});
