/**
 * Per-round metrics of the semantic review (owner ruling 2026-11-26: "no reasoning metrics").
 * One JSON object per line is appended to artifacts/codex-review/metrics.jsonl for every gate run:
 * a model round, a reuse of an earlier review, a visible skip, a deferral or a round-limit stop.
 *
 * Record fields (v = 1):
 *   v, ts, branch, pr (CODEX_REVIEW_PR or null), head, base_ref,
 *   round        the model round number on this branch (0 for a run that called no model)
 *   mode         'full' | 'delta' | 'delta-empty' | 'reuse' | 'skipped' | 'deferred' | 'round-limit'
 *   files, bytes, lines   what the gate looked at (reviewed hunks only, in delta mode)
 *   hunks_total, hunks_reviewed
 *   tier         'skip' | 'light' | 'strong'
 *   reviewer     'codex' | 'claude' | 'codex+claude' | 'none'
 *   model, effort, why    which model ran and why (the sizing rule, or the Claude condition)
 *   tokens       { total } when the CLI reported it, else null
 *   cost_usd     the Claude CLI's own estimate; null for Codex (plan quota, not priced)
 *   duration_ms
 *   findings     { critical, high, medium, low }   (this run's findings, carried ones included)
 *   finding_list [{ severity, file, line, rule, carried }]
 *   blocking     count of unwaived blocking findings
 *   verdict      'PASS' | 'FAIL' | 'SKIPPED' | 'DEFERRED'
 *   previous_round { round, findings, changed_code, unchanged, changed[] }: of the findings the
 *                previous round raised, how many had their code changed by this push
 *   note         free text (a skip or deferral reason, a model fallback)
 */
import path from 'node:path';

export const METRICS_VERSION = 1;
export const METRICS_FILE = 'metrics.jsonl';

/** The metrics file path: CODEX_REVIEW_METRICS_PATH, else <outDir>/metrics.jsonl. */
export function metricsPath(outDir, env = process.env) {
  return env.CODEX_REVIEW_METRICS_PATH || path.join(outDir, METRICS_FILE);
}

/** Counts findings by severity; any value that is not one of the four counts as `other`. */
export function severityCounts(findings) {
  const out = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) {
    const s = String(f.severity ?? '')
      .trim()
      .toLowerCase();
    if (s in out) out[s] += 1;
    else out.other = (out.other ?? 0) + 1;
  }
  return out;
}

/** Token total from codex's output ("tokens used\n12,345") or null. */
export function parseCodexTokens(text) {
  const m = /tokens used[:\s]*([\d,]+)/i.exec(text || '');
  if (!m) return null;
  const n = Number.parseInt(m[1].replace(/,/g, ''), 10);
  return Number.isFinite(n) ? { total: n } : null;
}

/** Tokens and cost from a `claude -p --output-format json` envelope, or nulls. */
export function parseClaudeUsage(stdout) {
  try {
    const e = JSON.parse(stdout);
    const u = e.usage || {};
    const total =
      (u.input_tokens || 0) +
      (u.output_tokens || 0) +
      (u.cache_creation_input_tokens || 0) +
      (u.cache_read_input_tokens || 0);
    return {
      tokens:
        total > 0
          ? { total, input: u.input_tokens ?? null, output: u.output_tokens ?? null }
          : null,
      costUsd: typeof e.total_cost_usd === 'number' ? e.total_cost_usd : null,
    };
  } catch {
    return { tokens: null, costUsd: null };
  }
}

/** One metrics record, with every field present (null when unknown). */
export function buildRecord(p) {
  const findings = p.findings ?? [];
  return {
    v: METRICS_VERSION,
    ts: (p.now ?? new Date()).toISOString(),
    branch: p.branch ?? null,
    pr: p.pr ?? null,
    head: p.head ?? null,
    base_ref: p.baseRef ?? null,
    round: p.round ?? 0,
    mode: p.mode,
    files: p.files ?? 0,
    bytes: p.bytes ?? 0,
    lines: p.lines ?? 0,
    hunks_total: p.hunksTotal ?? null,
    hunks_reviewed: p.hunksReviewed ?? null,
    tier: p.tier ?? 'skip',
    reviewer: p.reviewer ?? 'none',
    model: p.model ?? null,
    effort: p.effort ?? null,
    why: p.why ?? '',
    tokens: p.tokens ?? null,
    cost_usd: p.costUsd ?? null,
    duration_ms: p.durationMs ?? null,
    findings: severityCounts(findings),
    finding_list: findings.map((f) => ({
      severity: f.severity,
      file: f.file,
      line: f.line,
      rule: f.rule,
      carried: Boolean(f.carried),
    })),
    blocking: p.blocking ?? 0,
    verdict: p.verdict,
    previous_round: p.previousRound ?? null,
    note: p.note ?? '',
  };
}

/** Appends one record as a JSON line. `fs` is node:fs. Never throws: metrics must not break the gate. */
export function appendRecord(fs, file, record) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Records parsed from the file text; unparseable lines are skipped. */
export function parseMetrics(text) {
  return (text || '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter((r) => r && r.v === METRICS_VERSION);
}

/**
 * Rounds and cost per PR (or per branch when no PR number was recorded).
 * Model rounds are records with mode full/delta; skips, reuses and deferrals are counted apart.
 */
export function summarize(records) {
  const groups = new Map();
  for (const r of records) {
    const key = r.pr ? `PR #${r.pr}` : r.branch || '(no branch)';
    const g = groups.get(key) ?? {
      key,
      branch: r.branch,
      modelRounds: 0,
      skipped: 0,
      reused: 0,
      deferred: 0,
      roundLimit: 0,
      bytes: 0,
      tokens: 0,
      costUsd: 0,
      costKnown: false,
      reviewers: new Set(),
      models: new Set(),
      findings: { critical: 0, high: 0, medium: 0, low: 0 },
      acted: 0,
      raisedBeforeLastRound: 0,
      last: null,
    };
    if (r.mode === 'full' || r.mode === 'delta') {
      g.modelRounds += 1;
      g.bytes += r.bytes || 0;
      g.tokens += r.tokens?.total || 0;
      if (typeof r.cost_usd === 'number') {
        g.costUsd += r.cost_usd;
        g.costKnown = true;
      }
      if (r.reviewer && r.reviewer !== 'none') g.reviewers.add(r.reviewer);
      if (r.model) g.models.add(r.model);
      for (const k of Object.keys(g.findings)) {
        g.findings[k] += (r.findings?.[k] || 0) - carriedCount(r, k);
      }
    } else if (r.mode === 'skipped') g.skipped += 1;
    else if (r.mode === 'reuse') g.reused += 1;
    else if (r.mode === 'deferred') g.deferred += 1;
    else if (r.mode === 'round-limit') g.roundLimit += 1;
    if (r.previous_round) {
      g.acted += r.previous_round.changed_code || 0;
      g.raisedBeforeLastRound += r.previous_round.findings || 0;
    }
    g.last = r;
    groups.set(key, g);
  }
  return [...groups.values()];
}

function carriedCount(record, severity) {
  return (record.finding_list || []).filter(
    (f) => f.carried && String(f.severity).toLowerCase() === severity
  ).length;
}

/** The printable table: one block per PR with its rounds, reviewers, findings and cost. */
export function formatSummary(groups) {
  if (groups.length === 0) return 'No review metrics recorded yet.\n';
  const lines = [];
  let totalCost = 0;
  let totalRounds = 0;
  for (const g of groups) {
    totalCost += g.costUsd;
    totalRounds += g.modelRounds;
    const f = g.findings;
    const cost = g.costKnown
      ? `USD ${g.costUsd.toFixed(2)} (Claude calls; Codex is plan quota)`
      : 'no priced calls (Codex is plan quota)';
    lines.push(
      `${g.key}${g.branch && g.key !== g.branch ? ` (${g.branch})` : ''}`,
      `  model rounds : ${g.modelRounds}   skipped: ${g.skipped}   reused: ${g.reused}   deferred: ${g.deferred}   round-limit stops: ${g.roundLimit}`,
      `  reviewers    : ${[...g.reviewers].join(', ') || 'none'}   models: ${[...g.models].join(', ') || '-'}`,
      `  reviewed     : ${g.bytes} bytes, ${g.tokens} tokens reported`,
      `  new findings : critical ${f.critical}, high ${f.high}, medium ${f.medium}, low ${f.low}`,
      `  acted on     : ${g.acted} of ${g.raisedBeforeLastRound} earlier findings had their code changed on the next push`,
      `  cost         : ${cost}`,
      ''
    );
  }
  lines.push(
    `Total: ${groups.length} PR/branch(es), ${totalRounds} model round(s), USD ${totalCost.toFixed(2)} priced.`
  );
  return `${lines.join('\n')}\n`;
}

/**
 * The summary CLI, free of process state. Returns the exit code.
 * @param {{args: string[], env?: object, cwd: string, readFile: (p: string) => string, out: (s: string) => void}} io
 */
export function runMetricsCli({ args, env = process.env, cwd, readFile, out }) {
  const fileArg = args.find((a) => a.startsWith('--file='))?.slice('--file='.length);
  const file = fileArg || metricsPath(path.join(cwd, 'artifacts/codex-review'), env);
  let text;
  try {
    text = readFile(file);
  } catch {
    out(`No metrics file at ${file}.\n`);
    return 0;
  }
  const groups = summarize(parseMetrics(text));
  if (args.includes('--json')) {
    const plain = groups.map((g) => ({
      ...g,
      reviewers: [...g.reviewers],
      models: [...g.models],
      last: undefined,
    }));
    out(`${JSON.stringify(plain, null, 2)}\n`);
  } else {
    out(formatSummary(groups));
  }
  return 0;
}
