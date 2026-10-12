/**
 * Guard for #229: intelli-flow-crm-web.vercel.app is the single canonical
 * PRODUCTION domain (owner ruling 2026-10-12). Before this fix, the repo
 * disagreed with itself — CI/CD env URLs, Terraform `auth_site_url`, OG/meta
 * tags, sitemap/robots/RSS fallbacks and email links variously claimed
 * `intelliflow-crm.com` or `intelliflow-crm.dev` as production.
 *
 * This locks in two things:
 *  1. None of those `.com`/`.dev` claims reappear outside an explicit,
 *     commented allowlist of things that are NOT this decision (a company
 *     email domain, the Railway-hosted API's own address, a separate/
 *     unprovisioned "docs" product domain, generated report snapshots,
 *     illustrative Terraform examples, and dated historical notes).
 *  2. The production-critical surfaces this fix touched still carry the
 *     canonical domain (so a future "simplification" can't quietly delete it
 *     rather than replace it).
 *
 * If you are adding a NEW legitimate exception, add it to ALLOWLIST below
 * with a one-line reason — don't just widen the regex.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CANONICAL_DOMAIN = 'intelli-flow-crm-web.vercel.app';

// Paths are relative to ROOT, forward-slashed, exactly as `git grep` prints
// them. Grouped by why each is NOT a claim this guard polices.
const ALLOWLIST: readonly string[] = [
  // A static test fixture (an arbitrary made-up source URL), not production
  // config. (Three large generated tool-output files with the same property
  // are excluded directly in the `git grep` pathspec in scanRepo(), below —
  // one matching line there would otherwise be megabytes of embedded source.)
  'packages/test-fixtures/extracted-text-schema.json',

  // Staging deploy target — a separate, undecided domain question from
  // #229's PRODUCTION ruling. Left alone deliberately.
  '.github/workflows/cd.yml',
  'docs/development/dev-guide.md',

  // The API's own server address (Railway, not Vercel — ADR-034 splits web
  // from API). #229 settled only the web app's domain.
  'apps/api/openapi.json',
  'apps/api/scripts/generate-openapi.ts',
  'apps/web/src/test/fixtures/openapi-data.ts',

  // A separate, unprovisioned "docs" product (Docusaurus site / developer
  // guides) — no Vercel project exists for it in infra/terraform, so it is
  // a distinct, not-yet-decided domain question, not this one.
  'SECURITY.md',
  'apps/web/src/app/(developer)/docs/guides/__tests__/integration.test.tsx',
  'apps/web/src/app/(developer)/docs/page.tsx',
  'apps/web/src/components/developer/__tests__/guides-list.test.tsx',
  'apps/web/src/data/developer-guides.json',
  'apps/web/src/data/developer-integrations.json',
  'apps/web/src/test/fixtures/docs-data.ts',
  'docs/docusaurus.config.js',
  'tools/scripts/docusaurus.config.js',
  'docs/company/messaging/cta-library.md',

  // CI attestation schema namespace ids — a JSON Schema `$id` is an opaque
  // identifier, not a reachability claim about production.
  'apps/project-tracker/docs/metrics/schemas/attestation-schema.yaml',
  'apps/project-tracker/docs/metrics/schemas/evidence-pack-schema.yaml',

  // Mail-sending domain DNS records (SPF/DKIM/DMARC/MX/BIMI) — the email
  // domain is a separate decision from the web-hosting domain this guards.
  'infra/dns/email-records.md',

  // Generic illustrative Terraform module usage snippets, not this
  // project's actual config (production's real `vercel_domains` is `[]`,
  // see infra/terraform/environments/production/terraform.tfvars).
  'infra/terraform/modules/README.md',
  'infra/terraform/modules/railway/README.md',
  'infra/terraform/modules/vercel/README.md',
  'infra/terraform/terraform.tfvars.example',

  // Dated historical notes, sales collateral and planning docs that no
  // running code reads.
  'docs/operations/leangency-account-bootstrap-checklist.md',
  'docs/compliance-and-governance/data-governance/dsar-process.md',
  'docs/planning/seo-meta.json',
  'docs/sales/one-pager.md',
  'docs/sales/pitch-deck-outline.md',

  // A separate monitoring-dashboard subdomain, in a baseline doc that
  // already mixes real values with other placeholders (its
  // contactInformation already uses @example.com) — not tightly-coupled
  // live config.
  'infra/monitoring/security-baseline.json',
];

/** Lines from `git grep` for the banned domains, each `path:line:text`. */
function scanRepo(): string[] {
  const res = spawnSync(
    'git',
    [
      'grep',
      '-nI',
      '-E',
      'intelliflow-crm\\.(com|dev)',
      '--',
      '.',
      // These hold a full source/text blob per match (lint cache, a merged
      // test-run snapshot) — matched again below via ALLOWLIST, but excluded
      // HERE too so one matching line isn't megabytes of embedded source.
      ':!apps/web/eslint-sonar-output.json',
      ':!artifacts/reports/content-audit-results.json',
      ':!artifacts/test-failures/web.json',
      // This file's own doc-comment and test titles name the banned hosts
      // in prose, to describe what the guard does — not a production claim.
      // Excluded here (not via ALLOWLIST) because it is the scanner's own
      // source, not another file that happens to be exempt.
      ':!tools/scripts/__tests__/canonical-domain-guard.test.ts',
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
  );
  // git grep exits 1 when there are simply no matches; only a real failure
  // (status null/2+, or stderr with no output at all) should throw.
  if (res.status !== 0 && res.status !== 1) {
    throw new Error(`git grep failed (status ${res.status}): ${res.stderr || res.error}`);
  }
  return (res.stdout || '').split('\n').filter(Boolean);
}

describe('canonical production domain guard (#229)', () => {
  it('no non-canonical intelliflow-crm.com/.dev production claim outside the allowlist', () => {
    const offenders = scanRepo().filter((line) => {
      const sepAt = line.indexOf(':');
      const file = line.slice(0, sepAt).replace(/\\/g, '/');
      if (ALLOWLIST.includes(file)) return false;

      const rest = line.slice(sepAt + 1);
      // A company email / ICS UID namespace (user@intelliflow-crm.com) is a
      // separate decision from the web-hosting domain this guard protects.
      if (/@[A-Za-z0-9.-]*intelliflow-crm\.(com|dev)/.test(rest)) return false;

      return true;
    });

    expect(
      offenders,
      'Found a production-domain claim using a non-canonical host. The ' +
        `canonical production domain is https://${CANONICAL_DOMAIN} (owner ` +
        'ruling #229, 2026-10-12). If this is a NEW, legitimate exception ' +
        "(not the web app's own production domain), add it to ALLOWLIST in " +
        'tools/scripts/__tests__/canonical-domain-guard.test.ts with a ' +
        `one-line reason. Offending lines:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('keeps the canonical domain wired into the production-critical surfaces', () => {
    const mustReferenceCanonical = [
      '.github/workflows/cd.yml',
      'infra/terraform/README.md',
      'apps/web/src/app/layout.tsx',
      'apps/web/src/app/robots.ts',
      'apps/web/src/app/sitemap.ts',
      'apps/web/src/app/api/developer/changelog-rss/route.ts',
      'apps/web/src/lib/shared/welcome-email.ts',
      'apps/web/src/lib/shared/account-activation.ts',
      'apps/web/src/lib/status/error-analytics.ts',
      'apps/api/openapi.json',
      'apps/api/scripts/generate-openapi.ts',
      'tools/scripts/content-audit.ts',
    ];

    for (const rel of mustReferenceCanonical) {
      const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(
        content.includes(CANONICAL_DOMAIN),
        `${rel} should still reference the canonical domain (${CANONICAL_DOMAIN})`
      ).toBe(true);
    }
  });
});
