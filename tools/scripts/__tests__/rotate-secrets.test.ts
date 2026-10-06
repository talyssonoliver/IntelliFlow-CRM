import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  const wrapped = {
    ...actual,
    randomInt: vi.fn(actual.randomInt),
    randomBytes: vi.fn(actual.randomBytes),
  };
  return { ...wrapped, default: wrapped };
});

import * as crypto from 'node:crypto';
import {
  checkRotation,
  emergencyRotation,
  getSecretMetadata,
  loadSchedule,
  main,
  parseArgs,
  reEncrypt,
  rotateOneSecret,
  rotateSecrets,
  validateRotation,
} from '../rotate-secrets';

const randomInt = vi.mocked(crypto.randomInt);
const randomBytes = vi.mocked(crypto.randomBytes);

class ExitCalled extends Error {
  constructor(public code: number | string | null | undefined) {
    super(`exit ${code}`);
  }
}

let tmp: string;
let log: ReturnType<typeof vi.spyOn>;
let err: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rotate-secrets-'));
  log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number | string | null) => {
    throw new ExitCalled(code);
  }) as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  randomInt.mockClear();
  randomBytes.mockClear();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const output = () => log.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');

describe('parseArgs', () => {
  it('takes the first bare word as the command and pairs flags with values', () => {
    expect(parseArgs(['rotate', '--type', 'api_keys', '--dry-run'])).toEqual({
      command: 'rotate',
      type: 'api_keys',
      'dry-run': true,
    });
  });

  it('treats a flag followed by another flag as boolean and ignores later bare words', () => {
    expect(parseArgs(['check', '--a', '--b', 'v', 'extra'])).toEqual({
      command: 'check',
      a: true,
      b: 'v',
    });
  });

  it('defaults to process.argv', () => {
    const original = process.argv;
    process.argv = ['node', 'x', 'validate', '--result', 'r.json'];
    try {
      expect(parseArgs()).toEqual({ command: 'validate', result: 'r.json' });
    } finally {
      process.argv = original;
    }
  });
});

describe('loadSchedule', () => {
  it('returns the built-in policies once the file is readable', () => {
    const file = path.join(tmp, 'schedule.yaml');
    fs.writeFileSync(file, 'policies: {}\n');
    const schedule = loadSchedule(file);
    expect(Object.keys(schedule.policies)).toEqual([
      'database',
      'api_keys',
      'jwt_keys',
      'encryption_keys',
    ]);
    expect(schedule.automation.enabled).toBe(true);
  });

  it('throws when the schedule file is missing', () => {
    expect(() => loadSchedule(path.join(tmp, 'missing.yaml'))).toThrow();
  });
});

describe('getSecretMetadata', () => {
  const policy = {
    secrets: ['A'],
    rotation_interval_days: 30,
    pre_rotation_notification_days: 7,
    method: 'm',
    validation: [],
  };

  it('draws the simulated age and version from crypto.randomInt with the right bounds', () => {
    randomInt.mockReturnValueOnce(12).mockReturnValueOnce(4);
    const meta = getSecretMetadata('A', policy);

    expect(randomInt).toHaveBeenNthCalledWith(1, 30);
    expect(randomInt).toHaveBeenNthCalledWith(2, 10);
    expect(meta.version).toBe(5);
    expect(meta.name).toBe('A');
    expect(meta.type).toBe('unknown');
    const ageDays = (Date.now() - new Date(meta.last_rotated).getTime()) / (24 * 60 * 60 * 1000);
    expect(Math.round(ageDays)).toBe(12);
    const span =
      (new Date(meta.next_rotation).getTime() - new Date(meta.last_rotated).getTime()) /
      (24 * 60 * 60 * 1000);
    expect(Math.round(span)).toBe(30);
  });

  it('keeps age within [0, interval) and version within [1, 10] across draws', () => {
    for (let i = 0; i < 50; i++) {
      const meta = getSecretMetadata('A', policy);
      expect(meta.version).toBeGreaterThanOrEqual(1);
      expect(meta.version).toBeLessThanOrEqual(10);
      const age = (Date.now() - new Date(meta.last_rotated).getTime()) / 86_400_000;
      expect(age).toBeGreaterThanOrEqual(-0.01);
      expect(age).toBeLessThan(30.01);
    }
  });
});

describe('rotateOneSecret', () => {
  const fresh = () => ({
    success: true,
    rotated_secrets: [] as Array<{
      name: string;
      old_version: number;
      new_version: number;
      encrypted_value?: string;
    }>,
    errors: [] as string[],
    timestamp: 't',
  });

  it('records a version bump and the sha256 of a 32-byte random value, never the value', () => {
    randomInt.mockReturnValueOnce(2);
    randomBytes.mockReturnValueOnce(Buffer.alloc(32, 1) as never);
    const result = fresh();
    rotateOneSecret('S', result);

    expect(randomInt).toHaveBeenCalledWith(10);
    expect(randomBytes).toHaveBeenCalledWith(32);
    const expectedHash = crypto
      .createHash('sha256')
      .update(Buffer.alloc(32, 1).toString('base64'))
      .digest('hex');
    expect(result.rotated_secrets).toEqual([
      { name: 'S', old_version: 3, new_version: 4, encrypted_value: expectedHash },
    ]);
    expect(result.success).toBe(true);
    expect(output()).toContain('Rotated: v3 -> v4');
  });

  it('turns a failure into an error entry and marks the run failed', () => {
    randomBytes.mockImplementationOnce(() => {
      throw new Error('entropy exhausted');
    });
    const result = fresh();
    rotateOneSecret('S', result);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['Failed to rotate S: entropy exhausted']);
    expect(result.rotated_secrets).toEqual([]);
    expect(err).toHaveBeenCalledWith('    ERROR: entropy exhausted');
  });

  it('stringifies a non-Error failure', () => {
    randomBytes.mockImplementationOnce(() => {
      throw 'boom';
    });
    const result = fresh();
    rotateOneSecret('S', result);
    expect(result.errors).toEqual(['Failed to rotate S: boom']);
  });
});

describe('rotateSecrets', () => {
  const schedule = () => {
    const file = path.join(tmp, 'schedule.yaml');
    fs.writeFileSync(file, 'x\n');
    return file;
  };

  it('dry run rotates nothing and draws no randomness', async () => {
    await rotateSecrets({ type: 'api_keys', 'dry-run': true, schedule: schedule() });
    expect(randomBytes).not.toHaveBeenCalled();
    expect(output()).toContain('[DRY RUN] Would rotate OPENAI_API_KEY');
    expect(output()).toContain('Secrets rotated: 0');
  });

  it('rotates every secret of the chosen type and writes the result file', async () => {
    const out = path.join(tmp, 'result.json');
    await rotateSecrets({ type: 'jwt_keys', schedule: schedule(), output: out });

    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(written.success).toBe(true);
    expect(written.rotated_secrets.map((s: { name: string }) => s.name)).toEqual([
      'JWT_SECRET',
      'REFRESH_TOKEN_SECRET',
    ]);
    for (const s of written.rotated_secrets) {
      expect(s.new_version).toBe(s.old_version + 1);
      expect(s.encrypted_value).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(output()).toContain('=== Rotation Completed ===');
  });

  it('rotates all policies for type all', async () => {
    await rotateSecrets({ type: 'all', schedule: schedule() });
    expect(output()).toContain('Processing policy: database');
    expect(output()).toContain('Processing policy: encryption_keys');
  });

  it('rotates nothing for an unknown type, and reports the default type label', async () => {
    await rotateSecrets({ type: 'nope', schedule: schedule() });
    expect(output()).toContain('Secrets rotated: 0');

    log.mockClear();
    // no --schedule: falls back to the repo's rotation-schedule path, and defaults the type label
    await expect(rotateSecrets({ 'dry-run': true })).resolves.toBeUndefined();
    expect(output()).toContain('Type: all');
  });

  it('reports a failed run when a rotation errors', async () => {
    randomBytes.mockImplementation(() => {
      throw new Error('nope');
    });
    await rotateSecrets({ type: 'jwt_keys', schedule: schedule() });
    expect(output()).toContain('=== Rotation Failed ===');
    expect(output()).toContain('Errors: 2');
  });
});

describe('checkRotation', () => {
  const schedule = () => {
    const file = path.join(tmp, 'schedule.yaml');
    fs.writeFileSync(file, 'x\n');
    return file;
  };

  it('requires --schedule', async () => {
    await expect(checkRotation({})).rejects.toBeInstanceOf(ExitCalled);
    expect(err).toHaveBeenCalledWith('Error: --schedule is required');
  });

  it('classifies due and upcoming secrets from the simulated age and writes the result', async () => {
    // age = full interval -> due now; age 0 -> next rotation a whole interval away
    randomInt.mockImplementation(((max: number) => (max === 10 ? 4 : max - 1)) as never);
    const out = path.join(tmp, 'check.json');
    await checkRotation({ schedule: schedule(), output: out });

    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(written.rotation_needed).toBe(written.secrets_due.length > 0);
    expect(output()).toContain('=== Rotation Check Results ===');
    expect(written.secrets_due.length + written.upcoming.length).toBeGreaterThan(0);
  });

  it('lists secrets that need immediate rotation', async () => {
    randomInt.mockImplementation(((max: number) => (max === 10 ? 0 : max)) as never);
    await checkRotation({ schedule: schedule() });
    expect(output()).toContain('Secrets requiring immediate rotation:');
  });

  it('reports nothing due when every secret was just rotated and is outside the window', async () => {
    randomInt.mockImplementation((() => 0) as never);
    const out = path.join(tmp, 'none.json');
    await checkRotation({ schedule: schedule(), output: out });
    const written = JSON.parse(fs.readFileSync(out, 'utf-8'));
    expect(written.rotation_needed).toBe(false);
    expect(output()).not.toContain('Secrets requiring immediate rotation:');
  });
});

describe('validateRotation', () => {
  const resultFile = (secrets: unknown[]) => {
    const file = path.join(tmp, 'result.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ success: true, rotated_secrets: secrets, errors: [], timestamp: 't' })
    );
    return file;
  };
  const good = { name: 'A', old_version: 1, new_version: 2, encrypted_value: 'abc' };

  it('requires --result', async () => {
    await expect(validateRotation({})).rejects.toBeInstanceOf(ExitCalled);
  });

  it('passes when every check passes', async () => {
    randomInt.mockReturnValue(5 as never);
    await expect(validateRotation({ result: resultFile([good]) })).rejects.toMatchObject({
      code: 0,
    });
    expect(output()).toContain('✓ Connectivity test');
  });

  it('fails on a version that did not increase, a missing value, or a failed connectivity draw', async () => {
    randomInt.mockReturnValue(5 as never);
    await expect(
      validateRotation({
        result: resultFile([{ name: 'B', old_version: 2, new_version: 2, encrypted_value: '' }]),
      })
    ).rejects.toMatchObject({ code: 1 });

    randomInt.mockReturnValue(0 as never);
    await expect(validateRotation({ result: resultFile([good]) })).rejects.toMatchObject({
      code: 1,
    });
    expect(output()).toContain('✗ Connectivity test');
  });

  it('uses the 1-in-10 failure draw for the connectivity check', async () => {
    randomInt.mockReturnValue(3 as never);
    await expect(validateRotation({ result: resultFile([good]) })).rejects.toMatchObject({
      code: 0,
    });
    expect(randomInt).toHaveBeenCalledWith(10);
  });
});

describe('emergencyRotation', () => {
  it('requires --secret and --reason', async () => {
    await expect(emergencyRotation({ secret: 'X' })).rejects.toBeInstanceOf(ExitCalled);
    await expect(emergencyRotation({ reason: 'r' })).rejects.toBeInstanceOf(ExitCalled);
  });

  it('prints the audit entry and the manual follow-up steps, never the new value', async () => {
    randomBytes.mockReturnValueOnce(Buffer.alloc(32, 7) as never);
    await emergencyRotation({ secret: 'DATABASE_URL', reason: 'leak' });
    const text = output();
    expect(text).toContain('"secret": "DATABASE_URL"');
    expect(text).toContain('Emergency rotation completed');
    expect(text).not.toContain(Buffer.alloc(32, 7).toString('base64'));
  });
});

describe('reEncrypt', () => {
  it('requires --key-version', async () => {
    await expect(reEncrypt({})).rejects.toBeInstanceOf(ExitCalled);
  });

  it('walks every table', async () => {
    await reEncrypt({ 'key-version': '4' });
    expect(output()).toContain('Tables processed: 6');
    expect(output()).toContain('New key version: 4');
  });
});

describe('main', () => {
  it.each([
    ['check', ['check']],
    ['rotate', ['rotate', '--type', 'api_keys', '--dry-run', '--schedule', 'x']],
  ])('dispatches %s', async (_name, argv) => {
    const file = path.join(tmp, 'x');
    fs.writeFileSync(file, 'x');
    const withFile = argv.map((a) => (a === 'x' ? file : a));
    if (argv[0] === 'check') {
      await expect(main(['check'])).rejects.toBeInstanceOf(ExitCalled);
    } else {
      await main(withFile);
      expect(output()).toContain('Secret Rotation');
    }
  });

  it('dispatches validate, emergency and re-encrypt', async () => {
    await expect(main(['validate'])).rejects.toBeInstanceOf(ExitCalled);
    await expect(main(['emergency'])).rejects.toBeInstanceOf(ExitCalled);
    await expect(main(['re-encrypt'])).rejects.toBeInstanceOf(ExitCalled);
  });

  it('prints usage for an unknown command', async () => {
    await main(['bogus']);
    expect(output()).toContain('Secret Rotation Script - IFC-121');
  });
});
