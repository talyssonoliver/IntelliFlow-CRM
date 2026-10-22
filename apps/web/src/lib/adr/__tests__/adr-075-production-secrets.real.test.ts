/**
 * ADR-075 (production secrets management) — real-filesystem integration test.
 *
 * Issue #317 asked for "ADR-065", but ADR-065 was already claimed the day
 * after that issue was filed (2026-06-08, PR #333, "CRM -> Portal delivery
 * and billing sync") — see docs/architecture/adr/ADR-065-crm-portal-delivery-sync.md.
 * The real next free number, per `docs/architecture/adr/README.md` and the
 * actual files on disk (ADR-074 is the latest), is ADR-075.
 *
 * Unlike apps/web/src/lib/adr/__tests__/adr-service.test.ts (which mocks
 * `fs` to unit-test the parser), this file deliberately uses the REAL
 * filesystem via the service's own `getAllADRFiles`/`parseADR`/`validateADR`
 * so it fails red until the actual ADR file exists on disk with the right
 * shape, and stays an honest regression check afterwards.
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseADR, validateADR, getAllADRFiles } from '../adr-service';

const ADR_ID = 'ADR-075';
const ADR_RELATIVE_PATH = 'docs/architecture/adr/ADR-075-production-secrets-management.md';

function repoRoot(): string {
  // apps/web/src/lib/adr/__tests__ -> repo root is 6 levels up.
  return path.resolve(__dirname, '../../../../../..');
}

describe('ADR-075 production secrets management (real file)', () => {
  const absolutePath = path.resolve(repoRoot(), ADR_RELATIVE_PATH);

  // getAllADRFiles() resolves its search paths from process.cwd(), not from
  // this file's location. Run from the repo root (root vitest project) that
  // is a no-op, but the web workspace's own test script runs vitest with
  // cwd=apps/web, where docs/architecture/adr does not exist — codex-review
  // flagged this as cwd-dependent-adr-discovery. Pin cwd for this suite only
  // and restore it afterwards so other suites are unaffected.
  const originalCwd = process.cwd();

  beforeAll(() => {
    process.chdir(repoRoot());
  });

  afterAll(() => {
    process.chdir(originalCwd);
  });

  it('exists on disk at the real next-available ADR number', () => {
    expect(fs.existsSync(absolutePath)).toBe(true);
  });

  it('is discovered by getAllADRFiles()', () => {
    const files = getAllADRFiles();
    const found = files.some((f) => path.basename(f) === path.basename(ADR_RELATIVE_PATH));
    expect(found).toBe(true);
  });

  it('parses with the owner-decided outcome: Terraform/HCP + Railway native stores, no Vault SSOT', () => {
    const metadata = parseADR(absolutePath);
    expect(metadata).not.toBeNull();
    expect(metadata!.id).toBe(ADR_ID);
    expect(metadata!.status).toBe('Accepted');
    expect(metadata!.date).toBe('2026-10-12');
    expect(metadata!.technicalStory).toContain('317');

    const content = fs.readFileSync(absolutePath, 'utf-8');
    expect(content).toMatch(/Terraform\/?HCP|HCP sensitive vars/i);
    expect(content).toMatch(/Railway('s)? native env store/i);
    // The chosen option must be "A" (HCP + Railway native, no Vault), not the
    // Vault-as-SSOT option — even though Vault is necessarily discussed and
    // named as a rejected alternative in "Considered Options".
    const outcomeMatch = /Chosen option:\s*\*\*([A-C])/.exec(content);
    expect(outcomeMatch?.[1]).toBe('A');
    expect(content).toMatch(/no separate Vault/i);
  });

  it('passes validateADR() with zero errors (required MADR sections present)', () => {
    const metadata = parseADR(absolutePath);
    expect(metadata).not.toBeNull();
    const result = validateADR(metadata!);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('did NOT overwrite the real ADR-065 (CRM -> Portal delivery sync, IFC-314)', () => {
    const adr065Path = path.resolve(
      repoRoot(),
      'docs/architecture/adr/ADR-065-crm-portal-delivery-sync.md'
    );
    const content = fs.readFileSync(adr065Path, 'utf-8');
    expect(content).toContain('CRM');
    expect(content).toContain('Portal');
    expect(content).toContain('IFC-314');
  });
});
