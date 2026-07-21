#!/usr/bin/env node
/**
 * phantom-completed-audit.mjs — one-shot audit of Sprint_plan.csv for
 * "phantom-Completed" rows: tasks marked Completed with NO shipping trail.
 *
 * Background (GitHub #583): PR #567 remediation found rows born already
 * `Completed` via bulk-sync commits despite no shipped PR. This script audits
 * the WHOLE CSV for that pattern and produces a triage report.
 *
 * What counts as evidence a Completed row really shipped:
 *   - a MERGED PR whose TITLE references the Task ID with a feature-class prefix
 *     (feat/fix/perf/refactor), or
 *   - a COMMIT whose SUBJECT references the Task ID with a feature-class prefix.
 *
 * Signals gathered per Completed row:
 *   - merged PRs referencing the Task ID (title = strong, body = weak)
 *   - commits (--all) referencing the Task ID (subject = strong, body = weak)
 *   - birth: the earliest commit that added the row to the CSV, and the Status
 *     the row had AT that commit (born-Completed vs evolved Backlog/In Progress)
 *   - whether that birth commit is a bulk-sync (telltale subject, or it is the
 *     birth of many rows at once)
 *
 * Classification:
 *   confirmed-shipped : has a feature-class merged PR OR feature-class commit.
 *   phantom-Completed : (zero PR AND zero commit evidence) OR
 *                       (born directly Completed in a bulk-sync commit AND no
 *                        feature-class PR/commit).
 *   needs-review      : everything else — some weak/administrative evidence
 *                       (chore/test PR, body-only mention) but no feature PR.
 *
 * READ-ONLY. Never mutates the CSV. Only runs read-only git/gh commands.
 *
 * Usage:  node tools/scripts/audit/phantom-completed-audit.mjs
 * Outputs:
 *   artifacts/reports/phantom-completed-audit.json
 *   docs/audit/phantom-completed-<YYYY-MM-DD>.md
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import Papa from 'papaparse';

const ROOT = process.cwd();
const CSV = join(ROOT, 'apps', 'project-tracker', 'docs', 'metrics', '_global', 'Sprint_plan.csv');
const CSV_REL = 'apps/project-tracker/docs/metrics/_global/Sprint_plan.csv';
const FEATURE_PREFIX = /^(feat|fix|perf|refactor)(\(|:|!)/i;
const BULK_SUBJECT =
  /(sync|bulk|regenerate|backfill|\bimport\b|update components|task files|add new task|all sprint task|metrics\)|project-tracker\))/i;

const t0 = Date.now();

function git(args) {
  try {
    // stderr ignored: pickaxe --follow can name a historical commit where the CSV
    // lived at another path; git warns on stdout-less `show` — harmless noise here.
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (e) {
    return (e.stdout || '').toString();
  }
}
function ghJson(args) {
  try {
    const out = execFileSync('gh', args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
    return JSON.parse(out || '[]');
  } catch (e) {
    process.stderr.write(
      `WARN gh failed (${args.join(' ')}): ${(e.message || '').slice(0, 200)}\n`
    );
    return null;
  }
}
function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function wordRe(id) {
  // case-insensitive because commit/PR titles use lowercase ids, e.g. feat(automation-003)
  return new RegExp(`\\b${escRe(id)}\\b`, 'i');
}

// ---------------------------------------------------------------------------
// 1. Parse the canonical CSV (papaparse handles multi-line quoted cells).
// ---------------------------------------------------------------------------
const raw = readFileSync(CSV, 'utf8');
const { data: rows } = Papa.parse(raw, { header: true, skipEmptyLines: true });
const completed = rows
  .map((r) => ({
    id: (r['Task ID'] || '').trim(),
    section: (r['Section'] || '').trim(),
    sprint: (r['Target Sprint'] || '').trim(),
    status: (r['Status'] || '').trim(),
  }))
  .filter((r) => r.id && r.status === 'Completed');
process.stderr.write(`Parsed ${rows.length} rows; ${completed.length} Completed.\n`);
const ids = completed.map((r) => r.id);
const idRe = ids.map((id) => ({ id, re: wordRe(id) }));

// ---------------------------------------------------------------------------
// 2. Commit index — TWO `git log` dumps, matched in-memory.
//    A commit "shipped" only if it is reachable from origin/main (squash-merges
//    land the feature commit there). `--all` additionally sees WORK-IN-PROGRESS
//    on unmerged branches, which is evidence but NOT proof of shipping.
// ---------------------------------------------------------------------------
const US = '\x1f'; // unit separator between fields
const RS = '\x1e'; // record separator between commits
const MAIN_REF = git(['rev-parse', '--verify', 'origin/main']).trim() ? 'origin/main' : 'HEAD';

function dumpCommits(refArgs) {
  return git(['log', ...refArgs, '--no-merges', `--format=%H${US}%s${US}%b${RS}`])
    .split(RS)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((c) => {
      const [hash = '', subject = '', body = ''] = c.split(US);
      return { hash: hash.trim(), subject: subject.trim(), body: body.trim() };
    });
}
const mainCommits = dumpCommits([MAIN_REF]);
const allCommits = dumpCommits(['--all']);
process.stderr.write(
  `Indexed ${mainCommits.length} ${MAIN_REF} commits, ${allCommits.length} across all refs.\n`
);

function buildCommitHits(commits) {
  const hits = new Map(); // id -> {featClass, subjects[], bodyOnly}
  for (const { id } of idRe) hits.set(id, { featClass: false, subjects: [], bodyOnly: false });
  for (const c of commits) {
    const hay = `${c.subject}\n${c.body}`;
    for (const { id, re } of idRe) {
      if (!re.test(hay)) continue;
      const rec = hits.get(id);
      if (re.test(c.subject)) {
        rec.subjects.push(`${c.hash.slice(0, 9)} ${c.subject}`);
        if (FEATURE_PREFIX.test(c.subject)) rec.featClass = true;
      } else {
        rec.bodyOnly = true;
      }
    }
  }
  return hits;
}
const mainHits = buildCommitHits(mainCommits); // proof of shipping
const commitHits = buildCommitHits(allCommits); // any mention (incl. unmerged branches)

// ---------------------------------------------------------------------------
// 3. PR index — ONE `gh pr list` call, matched in-memory.
// ---------------------------------------------------------------------------
const prsRaw = ghJson([
  'pr',
  'list',
  '--state',
  'merged',
  '--limit',
  '2000',
  '--json',
  'number,title,body,mergedAt',
]);
const ghAvailable = prsRaw !== null;
const prs = ghAvailable ? prsRaw : [];
process.stderr.write(
  `Fetched ${prs.length} merged PRs${ghAvailable ? '' : ' (gh UNAVAILABLE — PR evidence skipped)'}.\n`
);

const prHits = new Map(); // id -> {featClass:bool, title:[], bodyOnly:bool}
for (const { id } of idRe) prHits.set(id, { featClass: false, titlePRs: [], bodyPRs: [] });
for (const pr of prs) {
  const title = pr.title || '';
  const body = pr.body || '';
  for (const { id, re } of idRe) {
    const inTitle = re.test(title);
    const inBody = re.test(body);
    if (!inTitle && !inBody) continue;
    const rec = prHits.get(id);
    if (inTitle) {
      rec.titlePRs.push({ number: pr.number, title, mergedAt: pr.mergedAt });
      if (FEATURE_PREFIX.test(title)) rec.featClass = true;
    } else {
      rec.bodyPRs.push({ number: pr.number, title, mergedAt: pr.mergedAt });
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Birth analysis — only for rows NOT already confirmed-shipped.
//    (bounded: keeps runtime well under 5 min).
// ---------------------------------------------------------------------------
function confirmedShipped(id) {
  // A feature-class MERGED PR (title), or a feature-class commit that landed on
  // origin/main (squash-merge). Unmerged-branch feat commits do NOT count.
  return prHits.get(id).featClass || mainHits.get(id).featClass;
}
const suspects = completed.filter((r) => !confirmedShipped(r.id));
process.stderr.write(
  `Confirmed-shipped: ${completed.length - suspects.length}. Running birth analysis on ${suspects.length} suspects...\n`
);

// Cache parsed CSV blobs per commit (a bulk commit is the birth of many rows).
const blobCache = new Map();
function statusAtCommit(hash, id) {
  if (!blobCache.has(hash)) {
    const blob = git(['show', `${hash}:${CSV_REL}`]);
    if (!blob) {
      blobCache.set(hash, null);
    } else {
      const map = new Map();
      const parsed = Papa.parse(blob, { header: true, skipEmptyLines: true });
      for (const r of parsed.data) {
        const rid = (r['Task ID'] || '').trim();
        if (rid) map.set(rid, (r['Status'] || '').trim());
      }
      blobCache.set(hash, map);
    }
  }
  const m = blobCache.get(hash);
  return m ? m.get(id) : undefined; // undefined => row not present (or path missing) at that commit
}

const birth = new Map(); // id -> {hash, subject, status}
for (const r of suspects) {
  // pickaxe anchored on "ID," (first column) across all branches + renames; oldest = birth-ish
  const pk = git(['log', '--all', '--follow', '--oneline', '-S', `${r.id},`, '--', CSV_REL])
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  let rec = null;
  // Walk oldest -> newer; first commit whose blob actually contains the row = true birth.
  for (const line of pk.reverse()) {
    const sp = line.indexOf(' ');
    const hash = sp < 0 ? line : line.slice(0, sp);
    const subject = sp < 0 ? '' : line.slice(sp + 1);
    const st = statusAtCommit(hash, r.id);
    if (st !== undefined) {
      rec = { hash, subject, status: st };
      break;
    }
  }
  birth.set(r.id, rec);
}

// bulk-sync detection: telltale subject OR birth-commit births many suspect rows.
const birthCounts = new Map();
for (const r of suspects) {
  const b = birth.get(r.id);
  if (b) birthCounts.set(b.hash, (birthCounts.get(b.hash) || 0) + 1);
}
function isBulkSync(b) {
  if (!b) return false;
  return BULK_SUBJECT.test(b.subject) || (birthCounts.get(b.hash) || 0) >= 3;
}

// ---------------------------------------------------------------------------
// 5. Classify + build evidence records.
// ---------------------------------------------------------------------------
function classify(r) {
  const id = r.id;
  const pr = prHits.get(id);
  const cm = commitHits.get(id);
  const b = birth.get(id) || null;
  const anyPR = pr.titlePRs.length > 0 || pr.bodyPRs.length > 0;
  const anyCommit = cm.subjects.length > 0 || cm.bodyOnly;
  const featPR = pr.featClass;
  const featMainCommit = mainHits.get(id).featClass; // feature landed on main
  const branchOnlyFeat = cm.featClass && !featMainCommit; // feature exists only on an unmerged branch
  const bornCompleted = !!b && b.status === 'Completed';
  const bulk = isBulkSync(b);

  let category;
  if (featPR || featMainCommit) {
    category = 'confirmed-shipped';
  } else if (!anyPR && !anyCommit) {
    category = 'phantom-Completed'; // zero evidence anywhere
  } else if (bornCompleted && bulk && !branchOnlyFeat) {
    category = 'phantom-Completed'; // born Completed in a bulk-sync, no real work
  } else {
    category = 'needs-review'; // weak/administrative evidence, or unmerged WIP
  }

  const evidence = {
    mergedPRs_title: pr.titlePRs.map((p) => ({
      number: p.number,
      title: p.title,
      mergedAt: p.mergedAt,
    })),
    mergedPRs_bodyOnly: pr.bodyPRs.map((p) => p.number),
    featureClassPR: featPR,
    commits_subject: cm.subjects.slice(0, 8),
    commits_bodyOnly: cm.bodyOnly,
    featureClassCommitOnMain: featMainCommit,
    featureWorkOnUnmergedBranchOnly: branchOnlyFeat,
    birthCommit: b ? b.hash : null,
    birthSubject: b ? b.subject : null,
    birthStatus: b
      ? b.status
      : featPR || featMainCommit
        ? '(not analyzed — confirmed-shipped)'
        : 'unknown',
    bornCompleted,
    bulkSyncBirth: bulk,
    bornCompletedInBulkSync: bornCompleted && bulk,
  };

  let recommendation;
  if (category === 'confirmed-shipped') {
    recommendation = 'leave — feature-class PR/commit on main';
  } else if (category === 'phantom-Completed') {
    if (!anyPR && !anyCommit) recommendation = 'flip to Backlog — zero PR and zero commit evidence';
    else
      recommendation = 'flip to Backlog OR verify — born Completed in a bulk-sync, no feature PR';
  } else {
    const bits = [];
    if (branchOnlyFeat) bits.push('feature work on an UNMERGED branch (not on main)');
    if (pr.titlePRs.length)
      bits.push(`non-feature PR(s) #${pr.titlePRs.map((p) => p.number).join(', #')}`);
    if (pr.bodyPRs.length)
      bits.push(`body-only PR(s) #${pr.bodyPRs.map((p) => p.number).join(', #')}`);
    if (cm.subjects.length) bits.push(`${cm.subjects.length} non-feature/branch commit(s)`);
    else if (cm.bodyOnly) bits.push('body-only commit mention');
    recommendation = `verify — ${bits.join('; ') || 'weak evidence'}; no feature PR on main (born ${b ? b.status : 'unknown'})`;
  }

  return { id, section: r.section, sprint: r.sprint, category, recommendation, evidence };
}

const results = completed.map(classify);
const byCat = { 'confirmed-shipped': [], 'needs-review': [], 'phantom-Completed': [] };
for (const r of results) byCat[r.category].push(r);

// Group phantom rows by the commit that first added them — a bulk-sync commit
// that "births" dozens of Completed rows at once is the smoking gun (#583).
const phantomBirthGroups = {};
for (const r of byCat['phantom-Completed']) {
  const h = r.evidence.birthCommit || '(unknown)';
  (phantomBirthGroups[h] ||= {
    commit: h,
    subject: r.evidence.birthSubject || '',
    count: 0,
    tasks: [],
  }).count++;
  phantomBirthGroups[h].tasks.push(r.id);
}
const phantomBirthList = Object.values(phantomBirthGroups).sort((a, b) => b.count - a.count);
// Date-stamp each birth commit (best-effort) so genesis vs later-sync is visible.
for (const g of phantomBirthList) {
  if (g.commit === '(unknown)') continue;
  g.date = git(['show', '-s', '--format=%cs', g.commit]).trim();
}

const runtimeSec = ((Date.now() - t0) / 1000).toFixed(1);
const date = new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// 6. Emit JSON report.
// ---------------------------------------------------------------------------
const jsonReport = {
  generatedAt: new Date().toISOString(),
  issue: 'https://github.com/talyssonoliveira/intelliFlow-CRM/issues/583',
  csv: CSV_REL,
  ghAvailable,
  runtimeSeconds: Number(runtimeSec),
  totals: {
    completedRows: completed.length,
    confirmedShipped: byCat['confirmed-shipped'].length,
    needsReview: byCat['needs-review'].length,
    phantomCompleted: byCat['phantom-Completed'].length,
  },
  phantomBirthGroups: phantomBirthList,
  results,
};
mkdirSync(join(ROOT, 'artifacts', 'reports'), { recursive: true });
writeFileSync(
  join(ROOT, 'artifacts', 'reports', 'phantom-completed-audit.json'),
  JSON.stringify(jsonReport, null, 2) + '\n',
  'utf8'
);

// ---------------------------------------------------------------------------
// 7. Emit Markdown report.
// ---------------------------------------------------------------------------
function mdTable(list, opts = {}) {
  if (!list.length) return '_None._\n';
  const head =
    '| Task ID | Sprint | Added-in-commit | Born status | Evidence | Recommendation |\n|---|---|---|---|---|---|\n';
  const body = list
    .map((r) => {
      const e = r.evidence;
      const added = e.birthCommit
        ? `\`${e.birthCommit.slice(0, 9)}\`${e.bulkSyncBirth ? ' (bulk-sync)' : ''}`
        : '—';
      const born = e.birthStatus;
      let ev;
      if (opts.confirmed) {
        const prs = e.mergedPRs_title.map((p) => `#${p.number}`).join(', ');
        const feat = e.featureClassPR
          ? 'feat PR'
          : e.featureClassCommitOnMain
            ? 'feat commit on main'
            : '';
        ev = [feat, prs].filter(Boolean).join(' ') || 'feature-class commit on main';
      } else {
        const parts = [];
        if (e.mergedPRs_title.length)
          parts.push(`PR ${e.mergedPRs_title.map((p) => `#${p.number}`).join(',')}`);
        if (e.mergedPRs_bodyOnly.length) parts.push(`body-PR #${e.mergedPRs_bodyOnly.join(',#')}`);
        if (e.commits_subject.length) parts.push(`${e.commits_subject.length} commit(s)`);
        else if (e.commits_bodyOnly) parts.push('body-only commit');
        if (!parts.length) parts.push('**none**');
        ev = parts.join('; ');
      }
      return `| ${r.id} | ${r.sprint || '—'} | ${added} | ${born} | ${ev} | ${r.recommendation} |`;
    })
    .join('\n');
  return head + body + '\n';
}

const md = `# Sprint_plan.csv — Phantom-Completed Audit (${date})

> Generated by \`tools/scripts/audit/phantom-completed-audit.mjs\` for [issue #583](https://github.com/talyssonoliveira/intelliFlow-CRM/issues/583). **Read-only** — the CSV was not modified. Runtime: ${runtimeSec}s.${ghAvailable ? '' : '\n>\n> ⚠️ **gh was unavailable** — merged-PR evidence could not be fetched; treat PR-based classifications as incomplete.'}

## Summary

| Metric | Count |
|---|---|
| Total Completed rows | **${completed.length}** |
| ✅ confirmed-shipped | ${byCat['confirmed-shipped'].length} |
| 🟠 needs-review | ${byCat['needs-review'].length} |
| 🔴 phantom-Completed | ${byCat['phantom-Completed'].length} |

**Method.** A Completed row is **confirmed-shipped** when a merged PR *title* or a
commit *subject* references its Task ID with a feature-class prefix
(\`feat\`/\`fix\`/\`perf\`/\`refactor\`). It is **phantom-Completed** when it has *zero*
PR and *zero* commit evidence, **or** it was born directly \`Completed\` in a
bulk-sync commit with no feature PR/commit. Everything else — administrative
evidence only (a \`chore\`/\`test\` PR, a CSV "flip to Completed" commit, or a
body-only mention) — is **needs-review**. Task-ID matching is word-boundary and
case-insensitive (titles use lowercase ids, e.g. \`feat(automation-003)\`).

Evidence for each row: one \`gh pr list --state merged\` scan (${prs.length} PRs),
a \`git log ${MAIN_REF}\` scan (${mainCommits.length} landed commits) plus a
\`git log --all\` scan (${allCommits.length} across all refs, to spot unmerged
WIP), and — for the ${suspects.length} rows not already confirmed — a CSV-history
pickaxe to find the commit that first added the row and the Status it had there.

## 🔴 phantom-Completed (${byCat['phantom-Completed'].length})

Marked \`Completed\` with no shipping trail. Recommend flipping to \`Backlog\` (or
verifying the artefact really exists before leaving).

### Phantom births by commit

Which commit first added each phantom row. A single commit that births dozens of
already-\`Completed\` rows is a bulk-sync backfill — the pattern #583 targets. The
earliest (project-genesis) commit is a pre-PR-workflow import; later dates are
the more surprising cases.

| Added-in-commit | Date | Phantom rows | Subject |
|---|---|---|---|
${phantomBirthList.map((g) => `| \`${g.commit.slice(0, 9)}\` | ${g.date || '—'} | ${g.count} | ${(g.subject || '').replace(/\|/g, '\\|').slice(0, 70)} |`).join('\n')}

### Full phantom row list

${mdTable(byCat['phantom-Completed'])}

## 🟠 needs-review (${byCat['needs-review'].length})

Some evidence exists but no feature-class PR. A human should confirm the feature
shipped or flip the row.

${mdTable(byCat['needs-review'])}

## ✅ confirmed-shipped (${byCat['confirmed-shipped'].length})

A feature-class merged PR or commit references the Task ID. No action.

${mdTable(byCat['confirmed-shipped'], { confirmed: true })}

---

### Control cases (issue #583 test plan)

The test plan expected: AUTOMATION-003 → phantom-Completed, PG-191 →
confirmed-shipped, IFC-214 → needs-review/backlog.

${['AUTOMATION-003', 'PG-191', 'IFC-214']
  .map((id) => {
    const r = results.find((x) => x.id === id);
    if (!r) return `- **${id}** — not a Completed row (status differs).`;
    const prs = r.evidence.mergedPRs_title.map((p) => `#${p.number}`).join(', ');
    return `- **${id}** → \`${r.category}\`. Born \`${r.evidence.birthStatus}\`${r.evidence.birthCommit ? ` in \`${r.evidence.birthCommit.slice(0, 9)}\`` : ''}. ${r.recommendation}${prs ? ` (${prs})` : ''}.`;
  })
  .join('\n')}

> **⚠️ Finding — the AUTOMATION-003 control assumption is stale.** The issue
> states AUTOMATION-003 "was born already Completed via a March bulk-sync commit
> (\`e09c95597\`) despite no shipped PR ever existing." Git no longer bears this
> out: \`e09c95597\` never contained an AUTOMATION-003 row; the row was first
> added — as \`In Progress\`, not \`Completed\` — by its own feature commit
> \`1d678c1aa\` on 2026-06-30, then **shipped via feat PR #566** and marked
> Completed by chore #567. So AUTOMATION-003 is genuinely **confirmed-shipped**
> today; the #567 remediation already fixed the original phantom. The task that
> was actually born in the March bulk-sync \`e09c95597\` is **PG-191**, which has
> since shipped via feat PR #575 (confirmed-shipped). The real phantom backlog is
> the ${byCat['phantom-Completed'].length} rows above — dominated by the
> 2025-12-14 project-genesis import (\`7ce5fbaa2\`, 116 rows) — none of which have
> any PR or commit trail.
`;

mkdirSync(join(ROOT, 'docs', 'audit'), { recursive: true });
const mdPath = join(ROOT, 'docs', 'audit', `phantom-completed-${date}.md`);
writeFileSync(mdPath, md, 'utf8');

// ---------------------------------------------------------------------------
// 8. Console summary (printed immediately for the transcript).
// ---------------------------------------------------------------------------
process.stdout.write(`\n=== PHANTOM-COMPLETED AUDIT (${date}) ===\n`);
process.stdout.write(`Completed rows: ${completed.length}\n`);
process.stdout.write(`  confirmed-shipped: ${byCat['confirmed-shipped'].length}\n`);
process.stdout.write(`  needs-review:      ${byCat['needs-review'].length}\n`);
process.stdout.write(`  phantom-Completed: ${byCat['phantom-Completed'].length}\n`);
process.stdout.write(`Runtime: ${runtimeSec}s  (gh ${ghAvailable ? 'ok' : 'UNAVAILABLE'})\n\n`);
process.stdout.write(`Top phantom-Completed (up to 15):\n`);
for (const r of byCat['phantom-Completed'].slice(0, 15)) {
  process.stdout.write(
    `  ${r.id.padEnd(16)} born=${(r.evidence.birthStatus || '?').padEnd(12)} added=${(r.evidence.birthCommit || '—').slice(0, 9)} ${r.evidence.bulkSyncBirth ? '[bulk]' : ''} :: ${r.recommendation}\n`
  );
}
process.stdout.write(`\nControls: `);
for (const id of ['AUTOMATION-003', 'PG-191', 'IFC-214']) {
  const r = results.find((x) => x.id === id);
  process.stdout.write(`${id}=${r ? r.category : 'N/A'}  `);
}
process.stdout.write(
  `\n\nJSON:  artifacts/reports/phantom-completed-audit.json\nMD:    docs/audit/phantom-completed-${date}.md\n`
);
