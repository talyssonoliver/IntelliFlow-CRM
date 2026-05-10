#!/usr/bin/env node
/**
 * audit-derived-file-references.mjs — Wave 4.3 enforcement helper.
 *
 * After Wave 4 moved Sprint_plan_[A-Z].csv splits, task-registry.json,
 * and dependency-graph.json out of git (they are now regenerated on
 * demand), every doc that says "read Sprint_plan_G.csv" is stale.
 *
 * This script greps the canonical agent-facing doc tree for stale
 * references and prints a report. It is idempotent and read-only.
 *
 * Trees scanned (each is gitignore-aware):
 *   .claude/agents/**            (agent definitions)
 *   .claude/skills/**            (skill instructions)
 *   CLAUDE.md                    (root project conventions)
 *   apps/<app>/CLAUDE.md         (per-app conventions)
 *   packages/<pkg>/CLAUDE.md     (per-package conventions)
 *   docs/**                      (Docusaurus + claude-refs)
 *
 * Patterns flagged (each match is a finding):
 *   Sprint_plan_[A-Z]\.csv         (now gitignored — must be regenerated)
 *   task-registry\.json            (gitignored — derive via build-task-registry.mjs)
 *   dependency-graph\.json         (gitignored — derive via build-dependency-graph.mjs)
 *
 * Exit:
 *   0 — zero stale references
 *   1 — at least one finding (print path:line:match)
 *
 * Wire into pre-commit / CI to keep the doc tree honest as the project
 * evolves.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.env.REPO_ROOT ?? process.cwd();

const PATTERNS = [
  {
    re: /Sprint_plan_[A-Z]\.csv/g,
    note: 'split file is gitignored (Wave 4) — regenerate via `pnpm regenerate:derived` or fetch via /api/sprint-plan?range=<X>',
  },
  {
    re: /\btask-registry\.json/g,
    note: 'task-registry.json is gitignored (Wave 4) — derive via `node tools/scripts/build-task-registry.mjs`',
  },
  {
    re: /\bdependency-graph\.json/g,
    note: 'dependency-graph.json is gitignored (Wave 4) — derive via `node tools/scripts/build-dependency-graph.mjs`',
  },
];

const SCAN_ROOTS = [
  '.claude/agents',
  '.claude/skills',
  'docs',
];

const SCAN_FILES = [
  'CLAUDE.md',
];

// Recursively collect CLAUDE.md files under apps/ and packages/.
function collectClaudeMdFiles(rootRel) {
  const root = join(REPO_ROOT, rootRel);
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root)) {
    const sub = join(root, entry);
    let st;
    try {
      st = statSync(sub);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      const claudeMd = join(sub, 'CLAUDE.md');
      if (existsSync(claudeMd)) out.push(claudeMd);
    }
  }
  return out;
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.git')) continue;
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (st.isFile()) {
      yield full;
    }
  }
}

function isMarkdownish(filePath) {
  return /\.(md|mdx|mjs|ts|tsx|js|jsx|json|yml|yaml|sh|txt)$/.test(filePath);
}

function hasDerivedContextNear(lines, idx, radius = 2) {
  const start = Math.max(0, idx - radius);
  const end = Math.min(lines.length - 1, idx + radius);
  for (let j = start; j <= end; j++) {
    if (
      /gitignored|derived|regenerate|`pnpm regenerate:derived`|build-task-registry|build-dependency-graph|do not edit|never edit|auto-generated|auto-regenerat/i.test(
        lines[j]
      )
    ) {
      return true;
    }
  }
  return false;
}

function isAllowedFinding(filePath, lineText) {
  // Skip our own audit script and the regenerator helpers — they reference
  // these names by design.
  const rel = relative(REPO_ROOT, filePath).split(sep).join('/');
  if (rel === 'tools/scripts/audit-derived-file-references.mjs') return true;
  if (rel === 'tools/scripts/regenerate-derived.ts') return true;
  if (rel === 'tools/scripts/build-task-registry.mjs') return true;
  if (rel === 'tools/scripts/build-dependency-graph.mjs') return true;
  if (rel === 'tools/scripts/split-sprint-plan.ts') return true;
  // Skip .gitignore — the Wave 4 ignore entries reference these names.
  if (rel === '.gitignore') return true;
  // Skip auto-generated session/state reports — regenerator owns those.
  if (rel === 'docs/SESSION_CONTEXT.md') return true;
  if (rel === 'docs/CURRENT_STATE_REPORT.md') return true;
  // Skip ADR / design / architecture docs that reference these names as
  // historical / architectural concepts, not as live agent instructions.
  if (rel.startsWith('docs/architecture/')) return true;
  // Skip lines that explicitly say the path is gitignored / derived / generated.
  if (
    /gitignored|derived|regenerate|`pnpm regenerate:derived`|`node tools\/scripts\/build-/.test(
      lineText
    )
  ) {
    return true;
  }
  return false;
}

function scanFile(filePath) {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  const findings = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, note } of PATTERNS) {
      const reLocal = new RegExp(re.source, re.flags);
      let m;
      while ((m = reLocal.exec(line))) {
        if (isAllowedFinding(filePath, line)) continue;
        if (hasDerivedContextNear(lines, i)) continue;
        findings.push({
          path: relative(REPO_ROOT, filePath).split(sep).join('/'),
          line: i + 1,
          match: m[0],
          note,
          context: line.trim().slice(0, 160),
        });
      }
    }
  }
  return findings;
}

const targets = new Set();

for (const file of SCAN_FILES) {
  const fp = join(REPO_ROOT, file);
  if (existsSync(fp)) targets.add(fp);
}
for (const root of SCAN_ROOTS) {
  for (const fp of walk(join(REPO_ROOT, root))) {
    if (isMarkdownish(fp)) targets.add(fp);
  }
}
for (const claudeMd of [
  ...collectClaudeMdFiles('apps'),
  ...collectClaudeMdFiles('packages'),
]) {
  targets.add(claudeMd);
}

const allFindings = [];
for (const t of targets) {
  for (const f of scanFile(t)) allFindings.push(f);
}

if (allFindings.length === 0) {
  console.log(`audit-derived-file-references: 0 stale references across ${targets.size} files. ✓`);
  process.exit(0);
}

console.log(
  `audit-derived-file-references: ${allFindings.length} stale reference(s) in ${
    new Set(allFindings.map((f) => f.path)).size
  } file(s):\n`
);
for (const f of allFindings) {
  console.log(`  ${f.path}:${f.line}  ${f.match}`);
  console.log(`    └─ ${f.context}`);
}
console.log('');
console.log(
  'Replace each with the regenerator pattern. See tools/scripts/regenerate-derived.ts.'
);
process.exit(1);
