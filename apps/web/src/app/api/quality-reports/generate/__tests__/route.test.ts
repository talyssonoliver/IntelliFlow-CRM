/**
 * Tests for /api/quality-reports/generate — buildLighthouseArgs URL validation.
 *
 * Guards the command-injection fix (CodeQL js/indirect-command-line-injection
 * #2257): the Lighthouse URL must be a well-formed http(s) URL and is passed as
 * a discrete argv element (via execFile, no shell), so shell metacharacters in
 * the URL cannot be interpreted by a shell.
 */
import { describe, it, expect } from 'vitest';

vi.mock('@/lib/route-access', () => ({
  requireOperator: vi.fn(async () => null),
  requireSignedIn: vi.fn(async () => null),
  refuseInProduction: vi.fn(() => null),
}));
import { buildLighthouseArgs } from '../lighthouse-args';

describe('generate route module', () => {
  it('loads without side effects (covers route module init)', async () => {
    const mod = await import('../route');
    expect(typeof mod.POST).toBe('function');
    expect(typeof mod.GET).toBe('function');
  });
});

describe('buildLighthouseArgs', () => {
  const OUT = '/tmp/artifacts/lighthouse/lighthouse-report';
  // From bundledChromeLaunch: the bundled Chromium's flags with the fixed profile.
  const FLAGS = '--chrome-flags=--headless=new --no-sandbox --user-data-dir=/repo/.cache/profile';

  it('accepts a plain http URL and returns it as a discrete argv element', () => {
    const args = buildLighthouseArgs('http://localhost:3000', OUT, FLAGS);
    expect(args[0]).toBe('lighthouse');
    // The URL is its own argv element — never concatenated into a shell string.
    expect(args[1]).toBe('http://localhost:3000');
    expect(args).toContain('--output-path');
    expect(args).toContain(OUT);
  });

  it("passes the bundled Chromium's flags, with the fixed profile, as they are given", () => {
    const args = buildLighthouseArgs('http://localhost:3000', OUT, FLAGS);
    expect(args).toContain(FLAGS);
    expect(args.filter((arg) => arg.startsWith('--chrome-flags='))).toEqual([FLAGS]);
  });

  it('accepts an https URL with a path and query', () => {
    const url = 'https://app.example.com/dashboard?tab=leads';
    expect(buildLighthouseArgs(url, OUT, FLAGS)[1]).toBe(url);
  });

  it('keeps a shell-metacharacter-laden URL as a single literal argv element', () => {
    // execFile passes this verbatim — no shell parses the "; rm -rf" portion.
    const malicious = 'http://localhost:3000/$(rm -rf ~)';
    const args = buildLighthouseArgs(malicious, OUT, FLAGS);
    expect(args[1]).toBe(malicious);
    expect(args.join(' ')).not.toMatch(/^npx /); // never assembled into a command line
  });

  it('rejects a non-http(s) protocol', () => {
    expect(() => buildLighthouseArgs('file:///etc/passwd', OUT, FLAGS)).toThrow(/protocol/);
    expect(() => buildLighthouseArgs('javascript:alert(1)', OUT, FLAGS)).toThrow(/protocol/);
  });

  it('rejects a malformed URL', () => {
    expect(() => buildLighthouseArgs('not a url', OUT, FLAGS)).toThrow(/Invalid Lighthouse URL/);
    expect(() => buildLighthouseArgs('', OUT, FLAGS)).toThrow(/Invalid Lighthouse URL/);
  });
});
