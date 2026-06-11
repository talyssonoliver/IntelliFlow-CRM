#!/usr/bin/env node
/**
 * Guard 7 — Post-exec Navigation Wiring gate.
 *
 * For every page.tsx path listed in the task plan's Files-to-Create section,
 * verify that the route is referenced from at least one of:
 *   - a sidebar config (`apps/web/src/components/sidebar/configs/**`)
 *   - a `<Link>` / `href=` in a parent or sibling page/component
 *   - a breadcrumb / back-link element inside the same route segment
 *
 * Zero matches → BLOCK with PG-180 context. The companion
 * `check-page-doc-cochange.mjs` semantic check catches the waiver-language
 * pattern; this script catches the *actual* missing wiring.
 *
 * Exit codes:
 *   0 — all new pages are reachable from the app shell or an in-page link
 *   1 — BLOCK: at least one new page.tsx has zero inbound references
 *   2 — Usage error (bad args, plan/repo layout missing)
 *
 * Usage:
 *   node tools/scripts/exec-preflight/check-nav-wiring.mjs <TASK_ID> [SPRINT]
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const REPO_ROOT = resolve(process.cwd());
const CSV_PATH = join(
  REPO_ROOT,
  'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv'
);

// Next.js segment markers that do not appear in a runtime URL.
const SEGMENT_NOISE = /\([^)]{1,100}\)/g; // route groups: (list), (public), ...

const SIDEBAR_CONFIG_GLOB =
  'apps/web/src/components/sidebar/configs';
const WEB_APP_ROOT = 'apps/web/src';

function die(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function inferSprintFromCsv(taskId) {
  if (!existsSync(CSV_PATH)) return null;
  const csv = readFileSync(CSV_PATH, 'utf8');
  const lines = csv.split(/\r?\n/);
  const header = lines[0].split(',');
  const sprintColIndex = header.findIndex((h) => h.trim() === 'Target Sprint');
  if (sprintColIndex < 0) return null;
  for (const line of lines.slice(1)) {
    if (!line.startsWith(`${taskId},`)) continue;
    const cells = parseCsvLine(line);
    const sprint = cells[sprintColIndex]?.trim();
    if (sprint && /^\d+$/.test(sprint)) return sprint;
  }
  return null;
}

function readPlan(taskId, sprintArg) {
  const sprint = sprintArg ?? inferSprintFromCsv(taskId);
  if (!sprint) {
    die(
      2,
      `[nav-wiring] Could not infer sprint for ${taskId} from ${CSV_PATH}. ` +
        `Pass the sprint explicitly as the second argument.`
    );
  }
  const planPath = join(
    REPO_ROOT,
    '.specify',
    'sprints',
    `sprint-${sprint}`,
    'planning',
    `${taskId}-plan.md`
  );
  if (!existsSync(planPath)) {
    die(2, `[nav-wiring] Plan file not found: ${planPath}`);
  }
  return { planPath, sprint, content: readFileSync(planPath, 'utf8') };
}

function extractSection(planContent, headingPatterns) {
  const lines = planContent.split(/\r?\n/);
  const headingRe = /^#{2,4}[ \t]+([^ \t\n][^\n]{0,200}?)[ \t]*$/;
  let inSection = false;
  const captured = [];
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      const title = m[1].toLowerCase();
      const isTarget = headingPatterns.some((p) => title.includes(p));
      if (isTarget) {
        inSection = true;
        continue;
      }
      if (inSection) inSection = false;
    }
    if (inSection) captured.push(line);
  }
  return captured.join('\n');
}

function listFilePaths(sectionText) {
  const found = new Set();
  const re =
    /(?:(?:apps|packages|docs|tools|\.specify|\.claude|\.github|\.agents)\/[^\s'"`[\]()]+)/g;
  let match;
  while ((match = re.exec(sectionText)) !== null) {
    const raw = match[0].replace(/[.,;:)\]`]{1,10}$/, '');
    found.add(raw);
  }
  return [...found];
}

/**
 * Convert a repo-relative page.tsx path into its runtime URL.
 *
 *   apps/web/src/app/settings/help-center/articles/page.tsx
 *     -> /settings/help-center/articles
 *   apps/web/src/app/contacts/(list)/page.tsx
 *     -> /contacts
 *   apps/web/src/app/(public)/legal/dpa/page.tsx
 *     -> /legal/dpa
 */
function pagePathToRoute(pagePath) {
  const prefix = 'apps/web/src/app/';
  if (!pagePath.startsWith(prefix)) return null;
  const rel = pagePath.slice(prefix.length).replace(/\/page\.tsx$/, '');
  // Strip route groups like (list), (public), (legal).
  const stripped = rel.replace(SEGMENT_NOISE, '').replace(/\/{2,}/g, '/');
  return '/' + stripped.replace(/^[/]{1,100}/, '').replace(/[/]{1,100}$/, '');
}

// ── File-scan helpers (pure Node; no shell, no rg dependency) ────────────
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx']);
const SCAN_DIRS = [
  'apps/web/src/components/sidebar/configs',
  'apps/web/src/components',
  'apps/web/src/app',
  'apps/web/src/lib',
  'apps/web/src/hooks',
  'apps/web/src/providers',
];

function* walkFiles(absRoot) {
  let entries;
  try {
    entries = readdirSync(absRoot, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(absRoot, entry.name);
    if (entry.isDirectory()) {
      // Skip build artefacts + tests — inbound links in tests don't count.
      if (entry.name === 'node_modules') continue;
      if (entry.name === '.next' || entry.name === 'dist') continue;
      if (entry.name === '__tests__') continue;
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf('.');
      const ext = dot >= 0 ? entry.name.slice(dot) : '';
      if (!SCAN_EXTENSIONS.has(ext)) continue;
      if (entry.name.endsWith('.test.ts')) continue;
      if (entry.name.endsWith('.test.tsx')) continue;
      if (entry.name.endsWith('.d.ts')) continue;
      yield full;
    }
  }
}

function collectScanFiles() {
  const files = [];
  for (const d of SCAN_DIRS) {
    const abs = join(REPO_ROOT, d);
    try {
      if (statSync(abs).isDirectory()) {
        for (const f of walkFiles(abs)) files.push(f);
      }
    } catch {
      // skipped dir
    }
  }
  return files;
}

/**
 * Reachability check: scans every .ts/.tsx under apps/web/src (minus tests
 * and build artefacts) for literal occurrences of the route string. Counts
 * matches in sidebar config files separately from other components.
 *
 * Pure Node — no shell, no rg dependency. This matters because
 * ripgrep's Windows build occasionally mis-handles patterns starting with
 * `/`, and the preflight must behave identically on all hosts.
 */
function countInboundReferences(route, pagePath) {
  if (!route) return { sidebar: 0, components: 0, samples: [] };

  const pagePathAbs = join(REPO_ROOT, pagePath).replace(/\\/g, '/');
  const sidebarRel = SIDEBAR_CONFIG_GLOB;
  const webRel = WEB_APP_ROOT;

  const sidebar = [];
  const components = [];
  for (const abs of collectScanFiles()) {
    const posix = abs.replace(/\\/g, '/');
    if (posix === pagePathAbs) continue;
    let content;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    if (!content.includes(route)) continue;
    const rel = relative(REPO_ROOT, abs).replace(/\\/g, '/');
    if (rel.startsWith(sidebarRel)) sidebar.push(rel);
    else if (rel.startsWith(webRel)) components.push(rel);
  }

  return {
    sidebar: sidebar.length,
    components: components.length,
    samples: [...sidebar, ...components].slice(0, 8),
  };
}

// If the page.tsx body calls `redirect('/path/...')`, return that path. This
// lets short server-component redirect stubs satisfy reachability as long as
// their redirect target is itself wired.
function detectRedirectTarget(pagePathRel) {
  const abs = join(REPO_ROOT, pagePathRel);
  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  const m = content.match(/redirect\(\s*['"]([^'"]+)['"]\s*\)/);
  return m ? m[1] : null;
}

function main() {
  const [taskId, sprintArg] = process.argv.slice(2);
  if (!taskId) {
    die(2, 'Usage: check-nav-wiring.mjs <TASK_ID> [SPRINT]');
  }

  const { planPath, sprint, content } = readPlan(taskId, sprintArg);
  info(`[nav-wiring] Checking ${taskId} (sprint ${sprint}) — ${planPath}`);

  const createSection = extractSection(content, ['files to create', 'create (']);
  const createFiles = listFilePaths(createSection);
  const newPages = createFiles.filter((f) => /\/app\/[^\s]+\/page\.tsx$/.test(f));

  if (newPages.length === 0) {
    info(`[nav-wiring] OK — plan does not create any page.tsx under apps/web/src/app/.`);
    process.exit(0);
  }

  info(`[nav-wiring] Plan creates ${newPages.length} new page(s). Checking inbound references…`);

  const report = [];
  let blocking = false;
  for (const page of newPages) {
    const route = pagePathToRoute(page);
    const counts = countInboundReferences(route, page);
    let reachable = counts.sidebar > 0 || counts.components > 0;
    let redirectTarget = null;

    // Second chance: redirect pages. If the new page.tsx body calls
    // Next.js `redirect(...)` or is a server-component one-liner that just
    // forwards to another route, follow that target and check its
    // reachability. Pattern used by PG-184's /settings/deals -> /deals/deal-settings.
    if (!reachable) {
      redirectTarget = detectRedirectTarget(page);
      if (redirectTarget) {
        const targetCounts = countInboundReferences(redirectTarget, page);
        if (targetCounts.sidebar > 0 || targetCounts.components > 0) {
          reachable = true;
        }
      }
    }

    if (!reachable) blocking = true;
    report.push({ page, route, ...counts, reachable, redirectTarget });
  }

  // Pretty-print the findings.
  info(``);
  info(`| Route | Sidebar refs | Component refs | Reachable? |`);
  info(`|-------|--------------|----------------|------------|`);
  for (const r of report) {
    const redirectNote = r.redirectTarget ? ` (redirect -> ${r.redirectTarget})` : '';
    info(
      `| ${r.route ?? '?'} | ${r.sidebar} | ${r.components} | ${r.reachable ? 'YES' : 'NO'}${redirectNote} |`
    );
  }

  if (!blocking) {
    info(``);
    info(`[nav-wiring] OK — every new page has at least one inbound reference.`);
    process.exit(0);
  }

  process.stderr.write(
    '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `  BLOCK: Post-exec Navigation Wiring gate\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      `\n` +
      `  Task: ${taskId}\n` +
      `\n` +
      `  One or more new pages have ZERO inbound references from sidebar\n` +
      `  configs or any other component under apps/web/src/. PG-180 shipped\n` +
      `  /settings/help-center/articles with this exact gap — reachable only\n` +
      `  by typing the URL. The page is effectively dead to real users.\n` +
      `\n` +
      `  Unreachable routes:\n`
  );
  for (const r of report.filter((x) => !x.reachable)) {
    process.stderr.write(`    ✗ ${r.route}  (file: ${r.page})\n`);
  }
  process.stderr.write(
    `\n` +
      `  Fix:\n` +
      `    (a) Add an entry for this route to the relevant file under\n` +
      `        apps/web/src/components/sidebar/configs/*.ts.\n` +
      `    (b) OR link to it from a parent page / breadcrumb / settings\n` +
      `        index (e.g., a <Link href="${report.find((x) => !x.reachable)?.route ?? '/your/route'}">).\n` +
      `\n` +
      `  Waiver is NOT accepted by this gate. If the route is truly an\n` +
      `  admin-only direct-URL surface, gate it on roles inside the\n` +
      `  sidebar entry itself (roles: ['ADMIN','MANAGER']), not by omitting\n` +
      `  the entry entirely.\n` +
      `\n` +
      `  Source: .claude/skills/exec/references/phase4-completion-gates.md Gate 12\n` +
      `  Memory: feedback_ui_reachability_waiver_loophole.md (2026-04-20)\n` +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  );
  process.exit(1);
}

main();
