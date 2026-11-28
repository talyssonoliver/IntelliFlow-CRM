/**
 * The semantic-review run, kept free of process state so it is tested in-process: size the diff,
 * skip or reuse, apply the round limit, send only unseen hunks, pick the reviewer, then judge,
 * store the round and write the metrics. scripts/codex-review.mjs only wires argv, git, the codex
 * and claude CLIs and process.exit into it.
 *
 * run() returns the exit code (0 pass or recorded skip, 1 fail). Nothing here calls process.exit.
 */
import path from 'node:path';
import {
  collectNumstat,
  diffInputMessage,
  failureArtifact,
  isStaleReviewArtifact,
  makeCodexRunner,
  runChunkedReview,
  scopeChanges,
} from './codex-chunk-review.mjs';
import { collectScopedDiff } from './codex-diff.mjs';
import { makeReviewIo } from './codex-review-cache.mjs';
import {
  catalogFallbackFor,
  classifyDiff,
  modelForTier,
  parseCodexConfigModel,
  parseModelCatalog,
} from './review-tier.mjs';
import { deferredMessage, makeReviewer } from './review-policy.mjs';
import {
  deltaAgainst,
  loadBranch,
  maxRounds,
  nextBranchRecord,
  previousRoundOutcome,
  roundLimitMessage,
  storeBranch,
  withHunks,
} from './review-rounds.mjs';
import { appendRecord, buildRecord, metricsPath, parseCodexTokens } from './review-metrics.mjs';

/** Thrown to end a run with an exit code from anywhere inside it. */
class GateExit extends Error {
  constructor(code) {
    super(`gate exit ${code}`);
    this.code = code;
  }
}

/** Added + deleted lines of a diff text. */
export function countLines(text) {
  return text.split('\n').filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l)).length;
}

/** What the chunks' reviewers were, for the metrics: names, models, summed tokens and cost. */
export function summarizeRuns(runs) {
  const reviewers = [...new Set(runs.map((r) => r.reviewer).filter(Boolean))];
  const models = [...new Set(runs.map((r) => r.model).filter(Boolean))];
  const total = runs.reduce((n, r) => n + (r.tokens?.total || 0), 0);
  const cost = runs.reduce((n, r) => n + (typeof r.costUsd === 'number' ? r.costUsd : 0), 0);
  return {
    reviewer: reviewers.length ? reviewers.join('+') : 'none',
    model: models.join('+') || null,
    effort: runs.find((r) => r.effort)?.effort ?? null,
    fallback: runs.find((r) => r.modelFallback)?.modelFallback?.reason ?? null,
    tokens: total > 0 ? { total } : null,
    costUsd: runs.some((r) => typeof r.costUsd === 'number') ? cost : null,
  };
}

/** The sizing reason with the model-fallback reason, when a run had to drop its model. */
export function withFallback(why, fallback) {
  return fallback ? `${why}; ${fallback}` : why;
}

/** The prompt note for a round after the first: only unseen hunks are shown. */
export function deltaNoteFor(mode, round) {
  return mode === 'delta'
    ? `\nNOTE: this is review round ${round}. Only hunks added or changed since the last ` +
        'reviewed round are shown; the rest of the PR was reviewed already. Do not repeat earlier findings.\n'
    : '';
}

/** Added and deleted line counts per section, for sizing a delta. */
export function sectionStats(sections) {
  return sections.map((sec) => {
    const lines = sec.text.split('\n');
    return {
      file: sec.file,
      added: lines.filter((l) => /^\+(?!\+\+)/.test(l)).length,
      deleted: lines.filter((l) => /^-(?!--)/.test(l)).length,
    };
  });
}

/**
 * @param {object} d the wiring:
 *   baseRef, repoRoot, outDir, env, spawn (spawnSync), fs (node:fs), os homedir fn `homedir`,
 *   out(text), err(text), isInScope(file), commandAvailable(bin), codexLoggedIn(),
 *   runCodexReviewer, runClaude(prompt) -> { text, tokens, costUsd }, extract(raw),
 *   buildPrompt(deltaNote) -> (files, part, diffText) => string, writeSchema(), verbose,
 *   loadWaivers(), fingerprintOf(finding), waivedLines, sleep(ms), now()
 */
export function createGate(d) {
  const { baseRef, repoRoot, outDir, fs, out, err } = d;
  const env = d.env ?? process.env;
  const findingsPath = path.join(outDir, 'findings.json');
  const summaryPath = path.join(outDir, 'summary.txt');
  const statePath = path.join(outDir, 'round-state.json');
  const metricsFile = metricsPath(outDir, env);
  const now = d.now ?? (() => new Date());
  const readState = () => (fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf8') : '');

  function gitOut(args) {
    const r = d.spawn('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    return r.status === 0 ? String(r.stdout).trim() : '';
  }

  /** The branch the rounds are kept under; a detached HEAD keeps no rounds across pushes. */
  function branchKey() {
    if (env.CODEX_REVIEW_BRANCH) return env.CODEX_REVIEW_BRANCH;
    const b = gitOut(['rev-parse', '--abbrev-ref', 'HEAD']);
    return b && b !== 'HEAD' ? b : `detached@${gitOut(['rev-parse', '--short', 'HEAD'])}`;
  }

  /** The model slugs the ChatGPT plan lists (codex's own cache), or null when unreadable. */
  function planModels() {
    try {
      const file =
        env.CODEX_REVIEW_MODELS_CACHE || path.join(d.homedir(), '.codex', 'models_cache.json');
      return parseModelCatalog(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }

  /** The default model of the user's codex config, or null. Read-only; never written. */
  function codexConfigModel() {
    try {
      const file = env.CODEX_REVIEW_CODEX_CONFIG || path.join(d.homedir(), '.codex', 'config.toml');
      return parseCodexConfigModel(fs.readFileSync(file, 'utf8'));
    } catch {
      return null;
    }
  }

  /** The metrics record for this run; written exactly once per run. */
  function record(ctx, fields) {
    const rec = buildRecord({
      branch: ctx.branch,
      pr: env.CODEX_REVIEW_PR || null,
      head: ctx.head,
      baseRef,
      durationMs: Date.now() - ctx.started,
      now: now(),
      ...fields,
    });
    appendRecord(fs, metricsFile, rec);
    return rec;
  }

  /** Writes the failure artifacts and ends the run with 1. Never a PASS. */
  function stopGate(message, scopedFiles, findings) {
    const artifact = failureArtifact({ baseRef, scopedFiles, findings, message });
    fs.writeFileSync(findingsPath, JSON.stringify(artifact, null, 2));
    fs.writeFileSync(summaryPath, `${message}\n`);
    out(`${message}\n`);
    throw new GateExit(1);
  }

  /** A diff that needs no model: printed, written to findings.json and the metrics, exit 0. */
  function finishSkip(ctx, sizing, scopedFiles) {
    const reason = sizing.reason;
    out(
      `[codex-review] skipped: ${reason}. No model was called; this is a recorded skip, not a review.\n`
    );
    fs.writeFileSync(
      findingsPath,
      JSON.stringify(
        {
          findings: [],
          scoped_files: scopedFiles,
          base_ref: baseRef,
          verdict: 'SKIPPED',
          skipped_reason: reason,
        },
        null,
        2
      )
    );
    fs.writeFileSync(summaryPath, `skipped: ${reason}\nNo model was called.\n`);
    record(ctx, {
      mode: 'skipped',
      round: 0,
      tier: 'skip',
      files: sizing.files,
      lines: sizing.lines,
      why: reason,
      verdict: 'SKIPPED',
      note: `skipped: ${reason}`,
    });
    throw new GateExit(0);
  }

  /** Fingerprints, waivers, artifacts, round state, metrics and the exit code for a reviewed diff. */
  function finish({
    scopedFiles,
    findings: rawFindings,
    reviewerUsed,
    chunkCount,
    io,
    cache,
    ctx,
    meta,
    sections = null,
    prev = null,
    modelRound = false,
  }) {
    // Fingerprints are recomputed from the source at the flagged line (our normalisation is the
    // contract, not the model's). A finding carried from an earlier round keeps the fingerprint it
    // was stamped with: its line number may have moved, its code has not.
    const waivers = d.loadWaivers();
    const findings = rawFindings.map((f) => ({
      ...f,
      fingerprint: f.carried && f.fingerprint ? f.fingerprint : d.fingerprintOf(f),
    }));
    const { summary, blocking, lowLine } = io.complete({
      rawFindings,
      findings,
      waivers,
      cache,
      scopedFiles,
      reviewerUsed,
      chunkCount,
      waivedLines: d.waivedLines,
    });
    out(`${summary}\n${lowLine ?? ''}`);

    const pass = blocking.length === 0;
    if (sections && prev) {
      const carried = findings.filter((f) => f.carried);
      const fresh = withHunks(
        findings.filter((f) => !f.carried),
        sections
      );
      const next = nextBranchRecord({
        prev,
        head: ctx.head,
        sections,
        findings: [...carried, ...fresh],
        modelRound,
        pass,
        now: now(),
      });
      fs.writeFileSync(statePath, storeBranch(readState(), ctx.branch, next));
    }
    record(ctx, {
      reviewer: 'none',
      ...meta,
      findings,
      blocking: blocking.length,
      verdict: pass ? 'PASS' : 'FAIL',
      note: meta.note ?? '',
    });

    if (pass) {
      out('[codex-review] Gate PASS — no unwaived blocking findings.\n');
      throw new GateExit(0);
    }
    err(
      `[codex-review] Gate FAIL — ${blocking.length} unwaived blocking finding(s).\n` +
        `  To suppress a false-positive, add its fingerprint to tools/audit/codex-review-waivers.yaml\n` +
        `  (check with: node scripts/codex-review.mjs --check-waivers)\n` +
        `  with a non-empty reason, author, and date.\n`
    );
    throw new GateExit(1);
  }

  function main() {
    fs.mkdirSync(outDir, { recursive: true });
    const ctx = { started: Date.now(), branch: branchKey(), head: gitOut(['rev-parse', 'HEAD']) };

    // 1. Scope (a base that does not resolve FAILS the gate) and size of the change.
    const scope = scopeChanges(baseRef, d.spawn, d.isInScope);
    if (scope.message) stopGate(scope.message, [], []);
    const { changed: changedFiles, scoped: scopedFiles } = scope;
    out(`[codex-review] base ref : ${baseRef}\n`);
    out(`[codex-review] changed  : ${changedFiles.length} files total\n`);
    out(`[codex-review] in scope : ${scopedFiles.length} files\n`);

    let stats;
    let sections = [];
    try {
      stats = collectNumstat(baseRef, d.spawn);
      if (scopedFiles.length > 0) {
        sections = collectScopedDiff({
          baseRef,
          files: scopedFiles,
          repoRoot,
          spawn: d.spawn,
        });
      }
    } catch (error) {
      stopGate(diffInputMessage(error), scopedFiles, []);
    }
    const sizing = classifyDiff(stats, sections, { scoped: scopedFiles });
    out(
      `[codex-review] sizing   : ${sizing.tier}${sizing.risky ? ' (risky)' : ''} - ${sizing.reason}\n`
    );

    // 2. Docs, tests, generated, comment-only: no model, and a visible record of why.
    if (sizing.tier === 'skip') finishSkip(ctx, sizing, scopedFiles);

    // 3. The same head and the same diff was reviewed already: reuse it (no model, no round).
    const io = makeReviewIo({
      repoRoot,
      outDir,
      baseRef,
      isInScope: d.isInScope,
      spawn: d.spawn,
      fs,
      out,
      env,
      scope: () => scope,
      collect: () => sections,
    });
    const cache = io.lookup();
    if (cache.reuse) {
      finish({
        ...cache.reuse,
        io,
        cache: null,
        ctx,
        meta: {
          mode: 'reuse',
          tier: sizing.tier,
          why: 'same head and same diff already reviewed',
          files: scopedFiles.length,
        },
      });
    }

    // 4. The round limit: after N failed rounds a human decides. Never an auto-waiver.
    const prev = loadBranch(readState(), ctx.branch);
    const limit = maxRounds(env);
    if (prev.rounds >= limit) {
      const message = roundLimitMessage({
        branch: ctx.branch,
        rounds: prev.rounds,
        limit,
        findings: prev.findings,
      });
      record(ctx, {
        mode: 'round-limit',
        round: prev.rounds,
        tier: sizing.tier,
        verdict: 'FAIL',
        findings: prev.findings,
        blocking: prev.findings.length,
        note: message.split('\n')[0],
      });
      stopGate(message, scopedFiles, prev.findings);
    }

    // 5. Only the hunks unseen since the last reviewed round.
    const delta = deltaAgainst(sections, prev);
    const mode = prev.reviewedHunks.length > 0 ? 'delta' : 'full';
    const common = {
      round: prev.rounds + 1,
      files: delta.review.length,
      bytes: delta.review.reduce((n, sec) => n + Buffer.byteLength(sec.text), 0),
      lines: delta.review.reduce((n, sec) => n + countLines(sec.text), 0),
      hunksTotal: delta.seenHunks + delta.newHunks,
      hunksReviewed: delta.newHunks,
      previousRound: previousRoundOutcome(prev, delta.dropped, delta.carried),
    };
    const carried = delta.carried.map((f) => ({ ...f, carried: true }));
    out(
      `[codex-review] round ${prev.rounds + 1}/${limit} (${mode}): ${delta.newHunks} new hunk(s), ` +
        `${delta.seenHunks} already reviewed, ${carried.length} finding(s) carried forward\n`
    );

    // Nothing new to look at, or only trivial new hunks: no model; the carried findings still judge.
    let deltaSizing = sizing;
    if (delta.newHunks === 0) {
      deltaSizing = {
        tier: 'skip',
        risky: sizing.risky,
        reason: 'every hunk was already reviewed in an earlier round',
      };
    } else if (mode === 'delta' && !sizing.risky) {
      deltaSizing = classifyDiff(sectionStats(delta.review), delta.review, { scoped: scopedFiles });
    }
    if (deltaSizing.tier === 'skip') {
      out(`[codex-review] skipped: no model needed for this round (${deltaSizing.reason}).\n`);
      finish({
        scopedFiles,
        findings: carried,
        reviewerUsed: 'none (no model needed this round)',
        chunkCount: 0,
        io,
        cache,
        ctx,
        sections,
        prev,
        modelRound: false,
        meta: {
          ...common,
          mode: delta.newHunks === 0 ? 'delta-empty' : 'skipped',
          round: 0,
          tier: 'skip',
          why: deltaSizing.reason,
          note: `skipped: ${deltaSizing.reason}`,
        },
      });
    }

    // 6. Pick the reviewer: Codex on the tier's model; Claude only for a risky diff Codex cannot review.
    const forceFallback = env.CODEX_REVIEW_FORCE_FALLBACK === '1';
    const codexUsable = !forceFallback && d.commandAvailable('codex') && d.codexLoggedIn();
    const claudeUsable = d.commandAvailable('claude');
    const available = planModels();
    const chosen = modelForTier(deltaSizing.tier, env, available);
    const strong = modelForTier('strong', env, available);
    const plan = {
      tier: deltaSizing.tier,
      risky: sizing.risky,
      model: chosen.model,
      effort: chosen.effort,
      why: `${deltaSizing.reason}; ${deltaSizing.tier} tier${chosen.note ? `; ${chosen.note}` : ''}`,
    };
    out(
      `[codex-review] reviewer : codex ${chosen.model ?? '(config model)'} / effort ${chosen.effort}` +
        `${sizing.risky ? '; Claude only if Codex cannot review (risky diff)' : '; no Claude for this diff'}\n`
    );

    d.writeSchema();
    const log = { out, err };
    const runCodex = makeCodexRunner({
      lastMsgPath: path.join(outDir, 'codex-last-message.txt'),
      repoRoot,
      fs,
      runCodexReviewer: d.runCodexReviewer,
      spawn: d.spawn,
      verbose: Boolean(d.verbose),
      log,
    });
    const reviewer = makeReviewer({
      plan,
      codexUsable,
      claudeUsable,
      runCodex: (prompt, tier) => {
        const r = runCodex(prompt, tier);
        return { ...r, tokens: parseCodexTokens(`${r.stdout}\n${r.stderr}`) };
      },
      runClaude: d.runClaude,
      extract: d.extract,
      log,
      sleep: d.sleep,
      now,
      models: { strong },
      env,
      // Asked only after the codex config model failed as "not on the plan" too.
      catalogFallback: () => {
        const available = planModels();
        const configModel = codexConfigModel();
        if (!available || (configModel && available.some((m) => m.slug === configModel))) {
          return null;
        }
        const alt = catalogFallbackFor(plan.tier, available, env);
        if (!alt) return null;
        const why = configModel
          ? `config model ${configModel} is missing from the plan catalog`
          : 'no config model is set';
        return { ...alt, reason: why };
      },
    });
    out('[codex-review] Preparing diff + review prompt ...\n');
    const result = runChunkedReview({
      baseRef,
      scopedFiles,
      repoRoot,
      spawn: d.spawn,
      buildPrompt: d.buildPrompt(deltaNoteFor(mode, prev.rounds + 1)),
      review: reviewer,
      write: (name, text) => fs.writeFileSync(path.join(outDir, name), text, 'utf8'),
      clearStale: () =>
        fs
          .readdirSync(outDir)
          .filter(isStaleReviewArtifact)
          .forEach((name) => fs.rmSync(path.join(outDir, name))),
      log,
      sections: delta.review,
    });
    const used = summarizeRuns(result.runs ?? []);
    if (result.kind === 'deferred') {
      const deferred = (result.runs ?? []).find((r) => r.deferred)?.deferred ?? {
        reason: 'codex unavailable',
        resetAt: null,
      };
      const message = deferredMessage({
        reason: deferred.reason,
        resetAt: deferred.resetAt,
        risky: sizing.risky,
        claudeUsable,
      });
      record(ctx, {
        ...common,
        round: 0,
        mode: 'deferred',
        tier: plan.tier,
        reviewer: used.reviewer,
        model: plan.model,
        effort: plan.effort,
        why: withFallback(plan.why, used.fallback),
        verdict: 'DEFERRED',
        findings: carried,
        blocking: carried.length,
        note: message.split('\n')[0],
      });
      stopGate(message, scopedFiles, carried);
    }
    if (result.kind === 'fail') {
      record(ctx, {
        ...common,
        mode,
        tier: plan.tier,
        reviewer: used.reviewer,
        model: used.model,
        effort: plan.effort,
        why: withFallback(plan.why, used.fallback),
        tokens: used.tokens,
        costUsd: used.costUsd,
        verdict: 'FAIL',
        note: result.message,
      });
      stopGate(result.message, scopedFiles, result.findings);
    }

    out(`[codex-review] reviewer : ${result.reviewerUsed}\n`);
    finish({
      scopedFiles,
      findings: [...carried, ...result.findings],
      reviewerUsed: result.reviewerUsed,
      chunkCount: result.chunkCount,
      io,
      cache,
      ctx,
      sections,
      prev,
      modelRound: true,
      meta: {
        ...common,
        mode,
        tier: plan.tier,
        reviewer: used.reviewer,
        model: used.model,
        effort: used.effort ?? plan.effort,
        why: withFallback(plan.why, used.fallback),
        tokens: used.tokens,
        costUsd: used.costUsd,
        note: used.fallback ? `model fallback: ${used.fallback}` : '',
      },
    });
  }

  /** Runs the review and returns the exit code. */
  function run() {
    try {
      main();
    } catch (error) {
      if (error instanceof GateExit) return error.code;
      throw error;
    }
    return 0;
  }

  return { run };
}
