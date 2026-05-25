/**
 * Schema-conformance test for the CI cost artifact + provenance sidecar +
 * failure-pattern registry. Catches drift between the Zod schemas in
 * tools/scripts/lib/schemas/ and either (a) the parser emitter or (b) the
 * hand-curated registry.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import prettier from 'prettier';
import { parseCsv, aggregate, buildArtifact, writeArtifact } from '../parse-actions-usage.mjs';
import {
  ciCostMetricsSchema,
  ciCostMetricsProvenanceSchema,
} from '../lib/schemas/ci-cost-metrics.schema.js';
import { ciFailureRegistrySchema } from '../lib/schemas/ci-failure-registry.schema.js';

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const JSON_SCHEMA_DIR = path.join(
  REPO_ROOT,
  'apps',
  'project-tracker',
  'docs',
  'metrics',
  'schemas'
);

const CANONICAL_HEADERS =
  '"date","product","sku","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","username","organization","repository","workflow_path","cost_center_name"';

const mkArtifact = () => {
  const rows = parseCsv(
    CANONICAL_HEADERS +
      '\n' +
      '"2026-05-20","actions","actions_linux","60","minutes","0.006","0.36","0","0","alice","","Repo","ci.yml",""' +
      '\n' +
      '"2026-05-20","actions","actions_storage","16.28","gigabyte-hours","0.00033602","0.005","0","0","","","Repo","",""'
  );
  return buildArtifact({
    agg: aggregate(rows),
    rows,
    sourcePath: 'usage.csv',
    sourceSha256: 'a'.repeat(64),
    gitHead: '0123456789abcdef0123456789abcdef01234567',
    generatedAt: '2026-05-25T12:34:56.789Z',
    stalenessThresholdDays: 30,
  });
};

describe('ci-cost-metrics artifact schema', () => {
  it('emitter output conforms', () => {
    const { artifact } = mkArtifact();
    const r = ciCostMetricsSchema.safeParse(artifact);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it('rejects an artifact that introduces an extra top-level field', () => {
    const { artifact } = mkArtifact();
    const r = ciCostMetricsSchema.safeParse({ ...artifact, extra_field: 'no' });
    expect(r.success).toBe(false);
  });

  it('writeArtifact() output round-trips through schema validation', () => {
    const built = mkArtifact();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-cost-schema-'));
    try {
      writeArtifact(tmp, built);
      const onDisk = JSON.parse(fs.readFileSync(path.join(tmp, 'latest.json'), 'utf8'));
      const r = ciCostMetricsSchema.safeParse(onDisk);
      expect(r.success).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('ci-cost-metrics provenance sidecar schema', () => {
  it('emitter output conforms', () => {
    const { provenance } = mkArtifact();
    const r = ciCostMetricsProvenanceSchema.safeParse(provenance);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it('rejects an unknown collection_method', () => {
    const { provenance } = mkArtifact();
    const r = ciCostMetricsProvenanceSchema.safeParse({
      ...provenance,
      collection_method: 'invented_method',
    });
    expect(r.success).toBe(false);
  });
});

describe('ci-failure-registry schema', () => {
  const registryPath = path.join(REPO_ROOT, 'artifacts', 'reports', 'ci-failures', 'registry.json');

  it('the hand-curated registry conforms', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    const r = ciFailureRegistrySchema.safeParse(registry);
    if (!r.success) console.error(r.error.issues);
    expect(r.success).toBe(true);
  });

  it('every pattern has a non-empty verification_command (load-bearing for the runbook)', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    for (const p of registry.patterns) {
      expect(p.verification_command).toBeTruthy();
      expect(p.verification_command.length).toBeGreaterThan(0);
    }
  });

  it('every guard_added=true entry references at least one PR or has explicit evidence', () => {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    for (const p of registry.patterns) {
      if (p.guard_added) {
        const hasEvidence = p.guard_prs.length > 0 || p.evidence.length > 0;
        if (!hasEvidence) {
          throw new Error(
            `pattern ${p.id} claims guard_added but cites neither a PR nor any other evidence`
          );
        }
      }
    }
  });

  it('every verification_command parses (smoke test, not execution)', () => {
    // Spawn bash with the command as an argv element (not via a quoted
    // string in a parent shell) so nested quotes don't get mangled. This
    // matches how tools/scripts/verify-ci-failure-guards.mjs invokes
    // bash. -n parses without executing.
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    for (const p of registry.patterns) {
      const r = spawnSync('bash', ['-n', '-c', p.verification_command], {
        encoding: 'utf8',
      });
      if (r.status !== 0) {
        throw new Error(
          `pattern ${p.id} verification_command is not valid bash (exit ${r.status}): ${r.stderr.trim()}`
        );
      }
    }
  });
});

describe('JSON-Schema mirror drift', () => {
  // Catches the case where someone edits a Zod schema but forgets to run
  // `pnpm run generate:schemas`. Compares the committed JSON file with what
  // z.toJSONSchema() produces NOW from the same Zod source.
  const cases = [
    {
      jsonFile: 'ci-cost-metrics.schema.json',
      zodSchema: ciCostMetricsSchema,
      title: 'CI Cost Metrics Artifact',
      description:
        'Structured aggregation of a GitHub Actions usage CSV. Written by tools/scripts/parse-actions-usage.mjs (--emit-json). See docs/operations/runbooks/ci-cost-monitoring.md.',
    },
    {
      jsonFile: 'ci-cost-metrics-provenance.schema.json',
      zodSchema: ciCostMetricsProvenanceSchema,
      title: 'CI Cost Metrics Provenance Sidecar',
      description:
        'Provenance + freshness sidecar for ci-cost-metrics artifact. Consumed by platform-health staleness checks.',
    },
    {
      jsonFile: 'ci-failure-registry.schema.json',
      zodSchema: ciFailureRegistrySchema,
      title: 'CI Failure Pattern Registry',
      description:
        'Structured registry of recurring CI failure patterns at artifacts/reports/ci-failures/registry.json.',
    },
  ];

  for (const { jsonFile, zodSchema, title, description } of cases) {
    it(`${jsonFile} matches its Zod source (regenerate with pnpm run generate:schemas)`, async () => {
      const committedRaw = fs.readFileSync(path.join(JSON_SCHEMA_DIR, jsonFile), 'utf8');
      const regen = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        $id: jsonFile,
        title,
        description,
        ...z.toJSONSchema(zodSchema),
      };
      // The generator overrides $schema after spreading — mirror that here.
      regen['$schema'] = 'http://json-schema.org/draft-07/schema#';
      // Run BOTH sides through Prettier so this test passes regardless of
      // whether the committed file used the bare JSON.stringify generator
      // output or the Prettier-formatted output. The generator now
      // Prettier-formats its writes, so the committed file is already
      // Prettier-clean; normalising here means any reordering of fields
      // / addition of a Zod .describe() shows up as a structural diff
      // rather than getting masked by whitespace noise.
      const regenRaw = JSON.stringify(regen, null, 2) + '\n';
      const opts = { parser: 'json' as const };
      const [committedPretty, regenPretty] = await Promise.all([
        prettier.format(committedRaw, opts),
        prettier.format(regenRaw, opts),
      ]);
      expect(committedPretty).toEqual(regenPretty);
    });
  }
});
