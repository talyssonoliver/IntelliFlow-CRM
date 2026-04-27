/**
 * IFC-032 — sync-collector-artifact.ts unit tests
 *
 * Two cases:
 *   1. byte-identical body after sync (SHA256 match between source and
 *      stripped-header target)
 *   2. --check mode exits non-zero when target drifts from source
 */

import { describe, it, expect } from 'vitest';
import {
  writeFileSync,
  readFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { syncCollectorArtifact } from '../sync-collector-artifact';

function sha256(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function stripHeader(content: string): string {
  const lines = content.split('\n');
  let i = 0;
  while (i < lines.length && (lines[i].startsWith('#') || lines[i].trim() === '')) {
    i++;
  }
  return lines.slice(i).join('\n');
}

describe('sync-collector-artifact (IFC-032)', () => {
  it('write mode produces a target whose body SHA256 matches the source', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ifc-032-sync-'));
    const src = join(tmp, 'src.yaml');
    const tgt = join(tmp, 'out', 'tgt.yaml');
    const sourceBody = 'receivers:\n  otlp:\n    protocols:\n      grpc:\nexporters:\n  logging:\nservice:\n  pipelines:\n    traces:\n      receivers: [otlp]\n      exporters: [logging]\n';
    writeFileSync(src, sourceBody, 'utf8');

    const result = syncCollectorArtifact({ sourcePath: src, targetPath: tgt });
    expect(result.ok).toBe(true);
    expect(existsSync(tgt)).toBe(true);

    const written = readFileSync(tgt, 'utf8');
    expect(written.startsWith('# AUTO-SYNCED-FROM-OTEL-COLLECTOR-YAML')).toBe(true);
    expect(stripHeader(written)).toBe(sourceBody);
    expect(sha256(stripHeader(written))).toBe(sha256(sourceBody));

    rmSync(tmp, { recursive: true, force: true });
  });

  it('--check mode exits non-zero when target body drifts from source', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ifc-032-sync-'));
    const src = join(tmp, 'src.yaml');
    const tgt = join(tmp, 'out', 'tgt.yaml');
    writeFileSync(src, 'receivers:\n  otlp:\n', 'utf8');

    // First write produces a valid artifact
    const writeResult = syncCollectorArtifact({ sourcePath: src, targetPath: tgt });
    expect(writeResult.ok).toBe(true);

    // Mutate the source — target now drifts
    writeFileSync(src, 'receivers:\n  otlp:\n  prometheus:\n', 'utf8');

    const checkResult = syncCollectorArtifact({ sourcePath: src, targetPath: tgt, check: true });
    expect(checkResult.ok).toBe(false);
    expect(checkResult.reason).toContain('Drift detected');

    rmSync(tmp, { recursive: true, force: true });
  });

  it('--check mode exits non-zero when target file is missing', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ifc-032-sync-'));
    const src = join(tmp, 'src.yaml');
    const tgt = join(tmp, 'missing.yaml');
    writeFileSync(src, 'receivers: {}\n', 'utf8');

    const result = syncCollectorArtifact({ sourcePath: src, targetPath: tgt, check: true });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Target missing');

    rmSync(tmp, { recursive: true, force: true });
  });

  it('after sync, --check mode exits 0 (round-trip)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ifc-032-sync-'));
    const src = join(tmp, 'src.yaml');
    const tgt = join(tmp, 'out', 'tgt.yaml');
    writeFileSync(src, 'receivers:\n  otlp:\n', 'utf8');

    syncCollectorArtifact({ sourcePath: src, targetPath: tgt });
    const result = syncCollectorArtifact({ sourcePath: src, targetPath: tgt, check: true });
    expect(result.ok).toBe(true);

    rmSync(tmp, { recursive: true, force: true });
  });
});
