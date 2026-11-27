import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildPlans,
  exportColumns,
  isTenantStoragePath,
  runWorkspaceExport,
} from '../export-workspace';
import { EXPORT_ENTITIES } from '../entities';
import { makeDb, memoryFiles, readZip } from './helpers';

const A = 'tenant_a_aaaaaaaaaaaaaaaaaaaa';
const B = 'tenant_b_bbbbbbbbbbbbbbbbbbbb';
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function seed() {
  const when = new Date('2026-11-01T10:00:00.000Z');
  return makeDb({
    tenant: [
      {
        id: A,
        name: 'Alpha Ltd',
        slug: 'alpha',
        status: 'ACTIVE',
        plan: 'STARTER',
        createdAt: when,
        updatedAt: when,
        trialEndsAt: null,
      },
      {
        id: B,
        name: 'Beta Ltd',
        slug: 'beta',
        status: 'ACTIVE',
        plan: 'STARTER',
        createdAt: when,
        updatedAt: when,
        trialEndsAt: null,
      },
    ],
    lead: [
      {
        id: 'l1',
        tenantId: A,
        email: 'a1@example.invalid',
        firstName: 'Ann, "the" Lead',
        tags: ['x', 'y'],
        createdAt: when,
      },
      {
        id: 'l2',
        tenantId: A,
        email: 'a2@example.invalid',
        firstName: 'Line\nBreak',
        tags: [],
        createdAt: when,
      },
      {
        id: 'l3',
        tenantId: B,
        email: 'SECRET-B-LEAD@example.invalid',
        firstName: 'Bea',
        tags: [],
        createdAt: when,
      },
    ],
    opportunity: [
      {
        id: 'o1',
        tenantId: A,
        name: 'Deal A',
        value: { toFixed: () => '1234.50', toNumber: () => 1234.5 },
        createdAt: when,
      },
      {
        id: 'o2',
        tenantId: B,
        name: 'SECRET-B-DEAL',
        value: { toFixed: () => '9.00', toNumber: () => 9 },
        createdAt: when,
      },
    ],
    emailRecord: [
      {
        id: 'e1',
        tenantId: A,
        subject: 'Hello',
        body: 'Full body text A',
        // Inbound mail nobody owns: team-visible.
        mailboxId: null,
        userId: null,
        contactId: null,
        metadata: { token: 'abc', nested: { apiKey: 'k' }, ok: 1 },
        createdAt: when,
      },
      { id: 'e2', tenantId: B, subject: 'SECRET-B-MAIL', body: 'SECRET-B-BODY', createdAt: when },
    ],
    emailAttachment: [
      {
        id: 'at1',
        tenantId: A,
        emailId: 'e1',
        fileName: 'a.pdf',
        fileUrl: 'https://x.example.invalid/o/a.pdf?token=SIGNED',
        fileSize: 3,
        fileType: 'pdf',
        createdAt: when,
      },
      {
        id: 'at2',
        tenantId: A,
        emailId: 'e1',
        fileName: 'mine.txt',
        fileUrl: `${A}/mine.txt`,
        fileSize: 4,
        fileType: 'txt',
        createdAt: when,
      },
    ],
    callRecord: [
      {
        id: 'c1',
        tenantId: A,
        direction: 'IN',
        fromNumber: '1',
        toNumber: '2',
        recordingUrl: 'https://rec.example.invalid/SIGNED',
        duration: 5,
        createdAt: when,
      },
    ],
    user: [
      {
        id: 'u1',
        tenantId: A,
        email: 'owner-a@example.invalid',
        name: 'Owner A',
        role: 'ADMIN',
        stripeCustomerId: 'cus_SECRET',
        createdAt: when,
      },
      {
        id: 'u2',
        tenantId: B,
        email: 'owner-b@example.invalid',
        name: 'Owner B',
        role: 'ADMIN',
        createdAt: when,
      },
      {
        id: 'u3',
        tenantId: B,
        email: 'member-of-a@example.invalid',
        name: 'Member',
        role: 'USER',
        createdAt: when,
      },
      {
        id: 'u4',
        tenantId: B,
        email: 'revoked-from-a@example.invalid',
        name: 'Revoked',
        role: 'USER',
        createdAt: when,
      },
    ],
    tenantMembership: [
      {
        id: 'm1',
        tenantId: A,
        userId: 'u3',
        role: 'USER',
        source: 'DIRECT',
        revokedAt: null,
        expiresAt: null,
      },
      {
        id: 'm2',
        tenantId: A,
        userId: 'u4',
        role: 'USER',
        source: 'DIRECT',
        revokedAt: new Date('2026-10-01'),
        expiresAt: null,
      },
    ],
  });
}

describe('runWorkspaceExport', () => {
  it('writes one CSV and one JSON per entity, README and manifest, for one tenant only', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    const result = await runWorkspaceExport({
      db: seed(),
      tenantId: A,
      outputPath: out,
      requestId: 'req1',
    });
    const zip = readZip(out);

    for (const e of EXPORT_ENTITIES) {
      expect(zip[`data/${e.name}.csv`], e.name).toBeDefined();
      expect(zip[`data/${e.name}.json`], e.name).toBeDefined();
    }
    for (const name of [
      'README.txt',
      'manifest.json',
      'workspace.json',
      'data/users.csv',
      'data/memberships.json',
    ]) {
      expect(zip[name], name).toBeDefined();
    }
    expect(statSync(out).size).toBe(result.archiveBytes);
    expect(result.archiveSha256).toMatch(/^[0-9a-f]{64}$/);

    const leads = JSON.parse(zip['data/leads.json']!);
    expect(leads.map((l: any) => l.id)).toEqual(['l1', 'l2']);
    expect(leads[0].tags).toEqual(['x', 'y']);
    const deals = JSON.parse(zip['data/deals.json']!);
    expect(deals).toHaveLength(1);
    expect(deals[0].value).toBe('1234.50');
  });

  it("never lets another tenant's rows, users or files into the archive", async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    const files = memoryFiles({
      'email-attachments': {
        [`${A}/mine.txt`]: 'MINE',
        [`${B}/theirs.txt`]: 'SECRET-B-FILE',
        [`${A}/../${B}/escape.txt`]: 'SECRET-B-ESCAPE',
      },
    });
    const result = await runWorkspaceExport({
      db: seed(),
      tenantId: A,
      outputPath: out,
      files,
      buckets: ['email-attachments'],
    });
    const zip = readZip(out);
    const everything = Object.values(zip).join('\n');
    expect(everything).not.toContain('SECRET-B');
    expect(everything).not.toContain('owner-b@example.invalid');
    expect(Object.keys(zip).filter((k) => k.startsWith('files/'))).toEqual([
      'files/email-attachments/mine.txt',
    ]);
    expect(zip['files/email-attachments/mine.txt']).toBe('MINE');
    expect(result.manifest.skippedFiles.map((s) => s.path).sort()).toEqual(
      [`${B}/theirs.txt`, `${A}/../${B}/escape.txt`].sort()
    );
    expect(files.listed).toEqual([`email-attachments/${A}/`]);
  });

  it('exports home users and live members only, without secrets or billing ids', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: A, outputPath: out });
    const users = JSON.parse(readZip(out)['data/users.json']!);
    expect(users.map((u: any) => u.email).sort()).toEqual([
      'member-of-a@example.invalid',
      'owner-a@example.invalid',
    ]);
    expect(JSON.stringify(users)).not.toContain('cus_SECRET');
    expect(Object.keys(users[0])).not.toContain('stripeCustomerId');
  });

  it('keeps secrets out of exported rows: excluded columns, scrubbed Json, URL tokens', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: A, outputPath: out });
    const zip = readZip(out);
    const calls = JSON.parse(zip['data/call_records.json']!);
    expect(Object.keys(calls[0])).not.toContain('recordingUrl');
    expect(zip['data/call_records.csv']).not.toContain('SIGNED');
    const mail = JSON.parse(zip['data/emails.json']!)[0];
    expect(mail.body).toBe('Full body text A');
    expect(mail.metadata).toEqual({ token: '[redacted]', nested: { apiKey: '[redacted]' }, ok: 1 });
    const att = JSON.parse(zip['data/email_attachments.json']!)[0];
    expect(att.fileUrl).toBe('https://x.example.invalid/o/a.pdf');
    expect(Object.values(zip).join('\n')).not.toContain('SIGNED');
  });

  it('manifest row counts and sha256 match the files in the archive', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    const files = memoryFiles({ 'case-documents': { [`${A}/doc.bin`]: 'BINARY-ISH' } });
    const result = await runWorkspaceExport({
      db: seed(),
      tenantId: A,
      outputPath: out,
      files,
      buckets: ['case-documents'],
    });
    const zip = readZip(out);
    const manifest = JSON.parse(zip['manifest.json']!);
    expect(manifest).toMatchObject({
      format: 'intelliflow-workspace-export',
      version: 1,
      requestId: null,
    });
    expect(manifest.workspace).toEqual({ id: A, name: 'Alpha Ltd', slug: 'alpha' });

    const listed = manifest.files.map((f: any) => f.path);
    // Every file except the manifest itself is in the manifest, and nothing else is.
    expect([...listed].sort()).toEqual(
      Object.keys(zip)
        .filter((k) => k !== 'manifest.json')
        .sort()
    );
    for (const f of manifest.files) {
      expect(f.sha256, f.path).toBe(sha(zip[f.path]!));
      expect(f.bytes, f.path).toBe(Buffer.byteLength(zip[f.path]!, 'utf8'));
    }
    expect(manifest.entities.leads.rows).toBe(2);
    expect(manifest.entities.deals.rows).toBe(1);
    expect(manifest.entities.users.rows).toBe(2);
    expect(manifest.entities.tickets.rows).toBe(0);
    expect(result.rowCounts.leads).toBe(2);
    expect(result.storedFileCount).toBe(1);
    for (const e of Object.values<any>(manifest.entities)) expect(e.rows).toBeGreaterThanOrEqual(0);
    const leadsCsv = manifest.files.find((f: any) => f.path === 'data/leads.csv');
    const leadsJson = manifest.files.find((f: any) => f.path === 'data/leads.json');
    expect([leadsCsv.rows, leadsJson.rows]).toEqual([2, 2]);
  });

  it('README explains every data file and what is left out', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: A, outputPath: out });
    const readme = readZip(out)['README.txt']!;
    for (const p of buildPlans()) expect(readme).toContain(`data/${p.name}.csv`);
    expect(readme).toContain('(2 rows)');
    expect(readme).toMatch(/Credentials and secrets of any kind/);
    expect(readme).toContain('Alpha Ltd');
  });

  it('writes CSV that survives commas, quotes and line breaks', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: A, outputPath: out });
    const csv = readZip(out)['data/leads.csv']!;
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('"Ann, ""the"" Lead"');
    expect(csv).toContain('"Line\nBreak"');
    expect(csv).toContain('"[""x"",""y""]"');
  });

  it('streams in keyset pages (page size 1 gives the same rows)', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: A, outputPath: out, pageSize: 1 });
    expect(JSON.parse(readZip(out)['data/leads.json']!).map((l: any) => l.id)).toEqual([
      'l1',
      'l2',
    ]);
  });

  it('skips a stored file that cannot be opened and says so', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    const out = join(dir, 'a.zip');
    const files = memoryFiles(
      { 'case-documents': { [`${A}/gone.bin`]: 'x', [`${A}/ok.bin`]: 'y' } },
      { failOpen: [`${A}/gone.bin`] }
    );
    const result = await runWorkspaceExport({
      db: seed(),
      tenantId: A,
      outputPath: out,
      files,
      buckets: ['case-documents'],
    });
    const zip = readZip(out);
    expect(Object.keys(zip)).toContain('files/case-documents/ok.bin');
    expect(Object.keys(zip)).not.toContain('files/case-documents/gone.bin');
    expect(result.manifest.skippedFiles).toHaveLength(1);
    expect(zip['README.txt']).toContain(
      'Stored file not copied: case-documents/' + A + '/gone.bin'
    );
  });

  it('refuses an unknown workspace', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-'));
    await expect(
      runWorkspaceExport({ db: seed(), tenantId: 'nope', outputPath: join(dir, 'x.zip') })
    ).rejects.toThrow(/not found/);
  });
});

describe('export plan', () => {
  it('has no duplicate file names', () => {
    const names = buildPlans().map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('exports only real columns', () => {
    for (const e of EXPORT_ENTITIES)
      expect(exportColumns(e.model).length, e.model).toBeGreaterThan(1);
  });
});

describe('isTenantStoragePath', () => {
  it.each([
    [`${A}/a.txt`, true],
    [`${A}/sub/a.txt`, true],
    [`${B}/a.txt`, false],
    [`${A}/`, false],
    [`${A}/../${B}/a.txt`, false],
    [`${A}/a\\b.txt`, false],
    [`${A}/%2e%2e/a`, false],
    [`${A}/%2E%2e/a`, false],
    [`${A}/100% signed contract.pdf`, true],
    [`${A}//a`, false],
    [`${A}x/a`, false],
  ])('%s -> %s', (path, ok) => {
    expect(isTenantStoragePath(A, path)).toBe(ok);
  });
});
