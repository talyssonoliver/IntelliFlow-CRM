import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

describe('cookie-policy-tracker', () => {
  it('getCookiePolicy returns parsed metadata and sections from content file', async () => {
    const { getCookiePolicy } = await import('../cookie-policy-tracker');
    const policy = getCookiePolicy();

    expect(policy.metadata.title).toBe('Cookie Policy');
    expect(policy.metadata.version).toBe('v2026.04');
    expect(policy.metadata.effectiveDate).toBe('2026-04-12');
    expect(policy.metadata.contactEmail).toBe('privacy@intelliflow-crm.com');
    expect(policy.metadata.summary.length).toBeGreaterThanOrEqual(4);
    expect(policy.sections.length).toBeGreaterThanOrEqual(6);
    expect(policy.sections[0].id).toBe('what-are-cookies');
    expect(policy.sections[0].body.length).toBeGreaterThanOrEqual(1);
  });

  it('formatCookieDate formats ISO dates in en-GB locale', async () => {
    const { formatCookieDate } = await import('../cookie-policy-tracker');
    const result = formatCookieDate('2026-04-12');
    expect(result).toMatch(/12/);
    expect(result).toMatch(/april/i);
    expect(result).toMatch(/2026/);
  });

  it('getCookiePolicy returns all four summary bullets from frontmatter without truncation', async () => {
    const { getCookiePolicy } = await import('../cookie-policy-tracker');
    const policy = getCookiePolicy();

    expect(policy.metadata.summary).toHaveLength(4);
    for (const bullet of policy.metadata.summary) {
      // Every bullet must be a complete sentence (ends with terminal punctuation)
      expect(bullet).toMatch(/[.!?]$/);
    }
    expect(policy.metadata.summary[0]).toMatch(/they cannot be turned off\.$/);
    expect(policy.metadata.summary[2]).toMatch(/links back to this policy\.$/);
  });
});
