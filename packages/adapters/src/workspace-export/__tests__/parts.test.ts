/**
 * A workspace archive that passes the part size is split into several ZIPs. A small threshold is
 * injected here (the real one is about 4 GB).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWorkspaceExport } from '../export-workspace';
import { PartedArchive, removeExportFiles } from '../parted-archive';
import { SupabaseExportStorage } from '../supabase-export-storage';
import { Readable } from 'node:stream';
import { csvCell } from '../serialize';
import { makeDb, memoryFiles, readZip } from './helpers';

const T = 'tenant_a_aaaaaaaaaaaaaaaaaaaa';
const t0 = new Date('2026-11-23T12:00:00.000Z');
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = '';
});

function seed() {
  // Incompressible text in real Lead columns, so the part grows by the data itself.
  const noise = (i: number, k: number) =>
    createHash('sha256').update(`${i}-${k}`).digest('hex').repeat(2);
  const leads = Array.from({ length: 150 }, (_, i) => ({
    id: `l${String(i).padStart(3, '0')}`,
    tenantId: T,
    email: `lead${i}@x.invalid`,
    firstName: noise(i, 1),
    lastName: noise(i, 2),
    company: noise(i, 3),
  }));
  return makeDb({
    tenant: [
      {
        id: T,
        name: 'Alpha',
        slug: 'alpha',
        status: 'ACTIVE',
        plan: 'STARTER',
        createdAt: t0,
        updatedAt: t0,
      },
    ],
    lead: leads,
  });
}

describe('split archives', () => {
  it('splits at the threshold; every file says which part holds it and the manifest lists every part', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-p-'));
    const out = join(dir, 'a.zip');
    const files = memoryFiles({
      'case-documents': { [`${T}/a.bin`]: 'a'.repeat(40_000), [`${T}/b.bin`]: 'b'.repeat(40_000) },
    });
    const result = await runWorkspaceExport({
      db: seed(),
      tenantId: T,
      outputPath: out,
      requestId: 'req1',
      files,
      maxPartBytes: 30_000,
    });
    expect(result.parts.length).toBeGreaterThan(2);
    expect(result.parts.map((p) => p.part)).toEqual(result.parts.map((_, i) => i + 1));

    // Which part really holds each file.
    const where: Record<string, number> = {};
    for (const p of result.parts) {
      for (const name of Object.keys(readZip(p.path))) where[name] = p.part;
    }
    const standalone = JSON.parse(readFileSync(result.manifestPath, 'utf8'));
    for (const f of standalone.files) expect(where[f.path]).toBe(f.part);
    expect(where['README.txt']).toBe(1);
    expect(where['manifest.json']).toBe(1);
    expect(where['data/leads.csv']).toBeDefined();

    // The standalone manifest has every part with its real size and sha256.
    expect(standalone.parts).toHaveLength(result.parts.length);
    for (const p of standalone.parts) {
      const local = result.parts[p.part - 1]!;
      expect(p.bytes).toBe(readFileSync(local.path).length);
      expect(p.sha256).toBe(sha(local.path));
    }
    expect(standalone.parts[0].file).toBe('workspace-export-req1-part-1.zip');

    // The manifest inside part 1 lists the later parts, and not its own hash.
    const inner = JSON.parse(readZip(out)['manifest.json']!);
    expect(inner.parts[0].sha256).toBeNull();
    expect(inner.parts.slice(1)).toEqual(standalone.parts.slice(1));
    expect(readZip(out)['README.txt']).toMatch(/split into \d+ ZIP parts/);
    expect(result.archiveBytes).toBe(result.parts.reduce((s, p) => s + p.bytes, 0));
    expect(result.archiveSha256).toBe(sha(out));
  });

  it('holds exactly the rows of a single-part export', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-p-'));
    const one = join(dir, 'one.zip');
    const many = join(dir, 'many.zip');
    await runWorkspaceExport({ db: seed(), tenantId: T, outputPath: one });
    const split = await runWorkspaceExport({
      db: seed(),
      tenantId: T,
      outputPath: many,
      maxPartBytes: 20_000,
    });
    expect(split.parts.length).toBeGreaterThan(1);
    const merged: Record<string, string> = {};
    for (const p of split.parts) Object.assign(merged, readZip(p.path));
    const single = readZip(one);
    expect(merged['data/leads.csv']).toBe(single['data/leads.csv']);
    expect(merged['data/leads.json']).toBe(single['data/leads.json']);
  });

  it('a small export stays one part with the plain name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-p-'));
    const out = join(dir, 'a.zip');
    const result = await runWorkspaceExport({
      db: makeDb({
        tenant: [
          {
            id: T,
            name: 'Alpha',
            slug: 'alpha',
            status: 'ACTIVE',
            plan: 'STARTER',
            createdAt: t0,
            updatedAt: t0,
          },
        ],
      }),
      tenantId: T,
      outputPath: out,
      requestId: 'r',
    });
    expect(result.parts).toHaveLength(1);
    expect(result.manifest.parts[0]!.file).toBe('workspace-export-r.zip');
    expect(existsSync(result.manifestPath)).toBe(true);
  });

  it('removeExportFiles deletes the parts, the manifest and nothing else', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-p-'));
    const out = join(dir, 'a.zip');
    await runWorkspaceExport({ db: seed(), tenantId: T, outputPath: out, maxPartBytes: 20_000 });
    await removeExportFiles(out);
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe('spreadsheet text with leading zeros', () => {
  it('protects signed and decimal values that lose their zeros', () => {
    expect(csvCell('00123.45')).toBe("'00123.45");
    expect(csvCell('-00123')).toBe("'-00123");
    expect(csvCell('007')).toBe("'007");
    expect(csvCell('0.5')).toBe('0.5');
    expect(csvCell('-12.50')).toBe('-12.50');
    expect(csvCell('0')).toBe('0');
  });
});

describe('review follow-ups: part choice by size and batched deletes', () => {
  it('puts an entry in a part that has room for it, by its known size', async () => {
    dir = mkdtempSync(join(tmpdir(), 'wsx-p-'));
    const archive = new PartedArchive(join(dir, 'a.zip'), 1000);
    const one = await archive.addStream('one.bin', Readable.from([randomBytes(600)]), 600);
    const two = await archive.addStream('two.bin', Readable.from([randomBytes(600)]), 600);
    const three = await archive.addStream('three.bin', Readable.from([randomBytes(300)]), 300);
    expect([one.part, two.part, three.part]).toEqual([1, 2, 2]);
    await archive.finalizeLaterParts();
    await archive.finalizeFirstPart();
  });

  it('deletes a long list of attempt objects in batches of at most 1000', async () => {
    const storage = new SupabaseExportStorage('https://x.example.invalid', 'k'.repeat(20));
    const names = Array.from({ length: 1500 }, (_, i) => ({
      id: String(i),
      name: `r1-1-p${i + 2}.zip`,
    }));
    const batches: number[] = [];
    (storage as any).client = {
      storage: {
        from: () => ({
          list: async (_f: string, o: { offset: number; limit: number }) => ({
            data: names.slice(o.offset, o.offset + o.limit),
            error: null,
          }),
          remove: async (paths: string[]) => {
            batches.push(paths.length);
            return { error: null };
          },
        }),
      },
    };
    await storage.removeAttemptObjects(T, 'r1', 1);
    expect(batches).toEqual([1000, 500]);
  });
});
