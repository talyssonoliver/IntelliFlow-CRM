#!/usr/bin/env node
/**
 * build-agent-manifest.mjs — generate .claude/agents/manifest.json
 *
 * Reads frontmatter from every .claude/agents/<name>.md and emits a
 * single manifest the orchestrator + agent-tier-guard hook consume.
 *
 * Frontmatter contract (per agent file):
 *   ---
 *   name: <agent-name>
 *   tier: A | B | C
 *   description: <one line>
 *   ---
 *
 * Tier defaults injected into manifest:
 *   A — read-only          ram_ceiling_mb: 300,  concurrent_cap: null  (unlimited)
 *   B — write-scoped       ram_ceiling_mb: 2048, concurrent_cap: 5
 *   C — write + heavy val  ram_ceiling_mb: 6144, concurrent_cap: 2
 *
 * Re-run whenever an agent file is added or its tier changes. Idempotent.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const agentsDir = join(repoRoot, '.claude', 'agents');

const TIER_DEFAULTS = {
  A: { ram_ceiling_mb: 300, concurrent_cap: null },
  B: { ram_ceiling_mb: 2048, concurrent_cap: 5 },
  C: { ram_ceiling_mb: 6144, concurrent_cap: 2 },
};

function parseFrontmatter(body) {
  if (!body.startsWith('---')) return null;
  const end = body.indexOf('\n---', 3);
  if (end < 0) return null;
  const fm = body.slice(3, end + 1);
  const out = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([a-zA-Z_]+)\s*:\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const files = readdirSync(agentsDir)
  .filter((f) => f.endsWith('.md'))
  .sort();

const agents = [];
const errors = [];
for (const f of files) {
  const body = readFileSync(join(agentsDir, f), 'utf8');
  const fm = parseFrontmatter(body);
  if (!fm) {
    errors.push(`${f}: no frontmatter`);
    continue;
  }
  if (!fm.name || !fm.tier) {
    errors.push(`${f}: missing name or tier`);
    continue;
  }
  const defaults = TIER_DEFAULTS[fm.tier];
  if (!defaults) {
    errors.push(`${f}: unknown tier "${fm.tier}"`);
    continue;
  }
  agents.push({
    name: fm.name,
    tier: fm.tier,
    ram_ceiling_mb: defaults.ram_ceiling_mb,
    concurrent_cap: defaults.concurrent_cap,
    description: fm.description ?? '',
  });
}

if (errors.length > 0) {
  for (const e of errors) console.error(`SKIP: ${e}`);
}

const manifest = {
  version: 1,
  generated_at: new Date().toISOString(),
  agents,
};

const outPath = join(agentsDir, 'manifest.json');
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

const breakdown = agents.reduce((acc, a) => {
  acc[a.tier] = (acc[a.tier] || 0) + 1;
  return acc;
}, {});
console.log(
  `Wrote ${outPath} — ${agents.length} agents (A=${breakdown.A || 0}, B=${breakdown.B || 0}, C=${breakdown.C || 0})${
    errors.length ? `, ${errors.length} errors` : ''
  }`
);

if (errors.length > 0) process.exit(1);
