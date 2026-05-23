#!/usr/bin/env tsx
/**
 * IFC-032 — Sync the canonical OpenTelemetry collector config from
 * `infra/monitoring/otel-collector.yaml` (the docker-compose-mounted runtime
 * config) to `artifacts/misc/otel-collector-config.yaml` (the IFC-032 DoD
 * artifact tracked under the CSV ARTIFACT column).
 *
 * The artifact is a verbatim copy of the source body with a 3-line YAML
 * comment header recording the source path, source SHA256, and generation
 * timestamp. This makes drift trivially detectable: the artifact body must
 * SHA256-match the source.
 *
 * Modes:
 *   --check       — fail (exit 1) if the artifact is missing or its body
 *                   SHA256 does not match the source. Does not write.
 *   (default)     — write the artifact, creating the directory if needed.
 *
 * Usage:
 *   npx tsx tools/scripts/observability/sync-collector-artifact.ts
 *   npx tsx tools/scripts/observability/sync-collector-artifact.ts --check
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SOURCE_PATH = resolve(REPO_ROOT, 'infra', 'monitoring', 'otel-collector.yaml');
const TARGET_PATH = resolve(REPO_ROOT, 'artifacts', 'misc', 'otel-collector-config.yaml');

const HEADER_MARKER = '# AUTO-SYNCED-FROM-OTEL-COLLECTOR-YAML — DO NOT EDIT';
const HEADER_END_SENTINEL = '# ---END-AUTO-SYNC-HEADER---';

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readSource(): { body: string; sha: string } {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`Source file missing: ${SOURCE_PATH}`);
  }
  const body = readFileSync(SOURCE_PATH, 'utf8');
  return { body, sha: sha256(body) };
}

function buildArtifact(sourceBody: string, sourceSha: string): string {
  const generatedAt = new Date().toISOString();
  return [
    HEADER_MARKER,
    `# source-path: infra/monitoring/otel-collector.yaml`,
    `# source-sha256: ${sourceSha}`,
    `# generated-at: ${generatedAt}`,
    '#',
    `# Regenerate with: npx tsx tools/scripts/observability/sync-collector-artifact.ts`,
    `# Verify with:    npx tsx tools/scripts/observability/sync-collector-artifact.ts --check`,
    HEADER_END_SENTINEL,
    sourceBody,
  ].join('\n');
}

function stripHeader(content: string): string {
  // Strip the auto-sync header up to and including the END sentinel; the
  // remainder is the verbatim source body (which may itself begin with
  // comment lines — those are part of the body and must be preserved).
  const sentinelIdx = content.indexOf(HEADER_END_SENTINEL);
  if (sentinelIdx === -1) {
    // No sentinel — treat entire content as body (defensive: file was
    // produced by an older script or hand-edited).
    return content;
  }
  // Skip past the sentinel line + its trailing newline
  const afterSentinel = content.slice(sentinelIdx + HEADER_END_SENTINEL.length);
  return afterSentinel.startsWith('\n') ? afterSentinel.slice(1) : afterSentinel;
}

export function syncCollectorArtifact(
  opts: {
    check?: boolean;
    sourcePath?: string;
    targetPath?: string;
  } = {}
): { ok: boolean; reason?: string; sourceSha: string; targetSha?: string } {
  const sourcePath = opts.sourcePath ?? SOURCE_PATH;
  const targetPath = opts.targetPath ?? TARGET_PATH;
  const source = (() => {
    if (!existsSync(sourcePath)) {
      throw new Error(`Source file missing: ${sourcePath}`);
    }
    const body = readFileSync(sourcePath, 'utf8');
    return { body, sha: sha256(body) };
  })();

  if (opts.check) {
    if (!existsSync(targetPath)) {
      return { ok: false, reason: `Target missing: ${targetPath}`, sourceSha: source.sha };
    }
    const targetContent = readFileSync(targetPath, 'utf8');
    const targetBody = stripHeader(targetContent);
    const targetSha = sha256(targetBody);
    if (targetSha !== source.sha) {
      return {
        ok: false,
        reason: `Drift detected: target body SHA256 ${targetSha} != source SHA256 ${source.sha}`,
        sourceSha: source.sha,
        targetSha,
      };
    }
    return { ok: true, sourceSha: source.sha, targetSha };
  }

  // Write mode
  mkdirSync(dirname(targetPath), { recursive: true });
  const artifact = buildArtifact(source.body, source.sha);
  writeFileSync(targetPath, artifact, 'utf8');
  return { ok: true, sourceSha: source.sha, targetSha: source.sha };
}

function parseArgs(argv: string[]): { check: boolean } {
  return { check: argv.includes('--check') };
}

async function main() {
  const { check } = parseArgs(process.argv.slice(2));
  const result = syncCollectorArtifact({ check });
  if (!result.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[sync-collector-artifact] ${check ? 'CHECK FAILED' : 'WRITE FAILED'}: ${result.reason}`
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log(
    check
      ? `[sync-collector-artifact] OK — body SHA256 matches (${result.sourceSha.slice(0, 12)}…)`
      : `[sync-collector-artifact] Wrote artifact (source SHA256 ${result.sourceSha.slice(0, 12)}…) → ${TARGET_PATH}`
  );
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[sync-collector-artifact] ERROR:', err);
    process.exit(1);
  });
}
