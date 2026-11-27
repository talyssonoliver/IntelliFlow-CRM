/**
 * @vitest-environment node
 */
/**
 * A signed-out `/` runs no proxy (it is the prerendered landing page, served from the CDN), so its
 * report-only CSP comes from next.config.js. It must be the same policy the proxy sends.
 */
import { describe, it, expect } from 'vitest';
import { buildReportOnlyCsp, cspEnvFromProcess } from '@/lib/security/csp';
import { CSP_REPORT_ONLY_HEADER } from '../proxy';

type HeaderRule = {
  source: string;
  missing?: Array<{ type: string; key: string }>;
  headers: Array<{ key: string; value: string }>;
};

async function headerRules(): Promise<HeaderRule[]> {
  const mod = (await import('../../next.config.js')) as {
    default?: { headers: () => Promise<HeaderRule[]> };
    headers?: () => Promise<HeaderRule[]>;
  };
  const config = mod.default ?? mod;
  return config.headers!();
}

describe('report-only CSP for a signed-out /', () => {
  it('applies to / only when there is no access-token cookie', async () => {
    const rule = (await headerRules()).find(
      (r) => r.source === '/' && r.headers.some((h) => h.key === CSP_REPORT_ONLY_HEADER)
    );

    expect(rule).toBeDefined();
    expect(rule!.missing).toEqual([{ type: 'cookie', key: 'accessToken' }]);
  });

  it('is the policy the proxy sends, built from the same environment', async () => {
    const rule = (await headerRules()).find((r) => r.source === '/')!;
    const header = rule.headers.find((h) => h.key === CSP_REPORT_ONLY_HEADER)!;

    expect(header.value).toBe(buildReportOnlyCsp(cspEnvFromProcess()));
    expect(header.value).toContain("default-src 'self'");
  });

  it('is never sent as an enforced policy', async () => {
    const rules = await headerRules();
    for (const rule of rules) {
      expect(rule.headers.map((h) => h.key)).not.toContain('Content-Security-Policy');
    }
  });
});
