/**
 * Who reviews, and what happens when Codex cannot (owner ruling 2026-11-26).
 *
 *   1. Codex reviews every non-skipped diff, on the model the tier picked (review-tier.mjs).
 *   2. Claude reviews ONLY when Codex is capped, failed or unavailable AND the diff is risky
 *      (or an owner/orchestrator sets CODEX_REVIEW_ALLOW_CLAUDE=1), and then with the lean
 *      flags from review-commands.mjs.
 *   3. Otherwise the gate WAITS for Codex's reset when it is near (CODEX_REVIEW_MAX_WAIT_MIN,
 *      default 20) and retries once, or records "REVIEW_DEFERRED: codex unavailable" and FAILS.
 *      A deferral is never a pass and never lowers the gate for a risky diff.
 *
 * All process access (running codex or claude, sleeping, the clock) is injected, so the rules are
 * unit-tested without a model.
 */

import { claudeReviewModel } from './review-commands.mjs';

export const DEFAULT_MAX_WAIT_MIN = 20;
/** Minutes added to Codex's stated reset time before retrying. */
export const RESET_MARGIN_MIN = 1;

const CAP_RE =
  /usage limit|hit your .{0,20}limit|rate.?limit|quota|try again (at|in|later)|too many requests|\b429\b|plan limit|insufficient_quota|capacity/i;

/** Does a failed Codex run read as a usage cap (as opposed to a crash or a bad flag)? */
export function isCapped(text) {
  return CAP_RE.test(text || '');
}

/**
 * When Codex says it may be tried again: "try again at 10:57 PM" (local time, today or the next
 * day) or "try again in 2 hours 5 minutes". Returns a Date, or null when no time is stated.
 */
export function parseResetAt(text, now = new Date()) {
  const s = text || '';
  const at = /try again at\s+(\d{1,2}):(\d{2})\s*(am|pm)?/i.exec(s);
  if (at) {
    let h = Number.parseInt(at[1], 10);
    const min = Number.parseInt(at[2], 10);
    const mer = (at[3] || '').toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    const d = new Date(now);
    d.setHours(h, min, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  const inn =
    /try again in\s+(?:(\d+)\s*(?:days?|d)\b)?\s*(?:(\d+)\s*(?:hours?|hrs?|h)\b)?\s*(?:(\d+)\s*(?:minutes?|mins?|m)\b)?/i.exec(
      s
    );
  if (inn && (inn[1] || inn[2] || inn[3])) {
    const ms =
      (Number(inn[1] || 0) * 24 * 60 + Number(inn[2] || 0) * 60 + Number(inn[3] || 0)) * 60_000;
    return new Date(now.getTime() + ms);
  }
  return null;
}

/** Wait limit in ms from the env (minutes), default DEFAULT_MAX_WAIT_MIN. 0 disables waiting. */
export function maxWaitMs(env = process.env) {
  const raw = env.CODEX_REVIEW_MAX_WAIT_MIN;
  const n = raw === undefined || raw === '' ? DEFAULT_MAX_WAIT_MIN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? n * 60_000 : DEFAULT_MAX_WAIT_MIN * 60_000;
}

/** May Claude review this diff? Only a risky one, or when an owner explicitly allows it. */
export function claudeAllowed({ risky, env = process.env }) {
  return Boolean(risky) || env.CODEX_REVIEW_ALLOW_CLAUDE === '1';
}

/** The text a deferral prints and writes to findings.json. */
export function deferredMessage({ reason, resetAt, risky, claudeUsable }) {
  const when = resetAt
    ? ` Codex resets about ${resetAt.toISOString()}; run the gate again after it.`
    : '';
  const claude = risky
    ? claudeUsable
      ? ' The Claude fallback was tried and gave no parseable review.'
      : ' This diff is risky, but the Claude CLI is not available either.'
    : ' This diff is not risky, so Claude is not used (CODEX_REVIEW_ALLOW_CLAUDE=1 lets an owner allow it).';
  return (
    `REVIEW_DEFERRED: codex unavailable (${reason}).${when}${claude} ` +
    'Gate FAIL - the diff was NOT reviewed. This is not a pass and nothing is waived; ' +
    'retry at the reset, or ask the owner/orchestrator to decide.'
  );
}

/**
 * Builds the per-prompt reviewer. State (a cap seen once, a wait done once) is kept across the
 * chunks of one run, so a capped Codex is not retried for every chunk.
 *
 * @param {object} deps
 * @param {{tier: string, risky: boolean, model: string|null, effort: string|null, why: string}} deps.plan
 * @param {boolean} deps.codexUsable
 * @param {boolean} deps.claudeUsable
 * @param {(prompt: string, opts: {model: string|null, effort: string|null}) => object} deps.runCodex
 *   returns { raw, status, stderr, stdout, tokens? }
 * @param {(prompt: string, opts: {model: string}) => object} deps.runClaude returns { text, tokens?, costUsd? }
 * @param {(raw: string) => object|null} deps.extract
 * @param {{out: Function, err: Function}} deps.log
 * @param {(ms: number) => void} deps.sleep
 * @param {() => Date} deps.now
 * @param {{strongModel: {model: string|null, effort: string|null}}} deps.models
 */
export function makeReviewer({
  plan,
  codexUsable,
  claudeUsable,
  runCodex,
  runClaude,
  extract,
  log,
  sleep,
  now = () => new Date(),
  models,
  env = process.env,
}) {
  const state = {
    codexDown: !codexUsable,
    resetAt: null,
    reason: codexUsable ? '' : 'not installed or not logged in',
    waited: false,
  };
  const allowClaude = claudeAllowed({ risky: plan.risky, env });

  function tryCodex(prompt, opts, why) {
    log.out(
      `[codex-review] Codex review (${opts.model ?? 'config model'}, effort ${opts.effort ?? 'config'}; ${why})\n`
    );
    const r = runCodex(prompt, opts);
    const raw = r.raw || '';
    const parsed = extract(raw);
    return { r, raw, parsed };
  }

  return function review(prompt) {
    const attempts = [];
    if (!state.codexDown) {
      let opts = { model: plan.model, effort: plan.effort };
      let a = tryCodex(prompt, opts, plan.why);
      if (a.parsed) {
        return {
          parsed: a.parsed,
          reviewer: 'codex',
          raw: a.raw,
          ...opts,
          tokens: a.r.tokens ?? null,
          attempts,
        };
      }
      const failText = `${a.r.stderr || ''}\n${a.r.stdout || ''}\n${a.raw}`;
      attempts.push({
        reviewer: 'codex',
        ...opts,
        status: a.r.status ?? -1,
        capped: isCapped(failText),
      });
      if (!isCapped(failText) && plan.tier === 'light') {
        // A light model that errors (not a cap) may be unknown to this CLI: one escalation to the strong model.
        opts = { model: models.strong.model, effort: models.strong.effort };
        log.err(
          '[codex-review] WARN: light Codex model gave no findings; trying the strong model once.\n'
        );
        a = tryCodex(prompt, opts, 'escalated after a light-model failure');
        if (a.parsed) {
          return {
            parsed: a.parsed,
            reviewer: 'codex',
            raw: a.raw,
            ...opts,
            tokens: a.r.tokens ?? null,
            attempts,
          };
        }
        attempts.push({ reviewer: 'codex', ...opts, status: a.r.status ?? -1, capped: false });
      }
      const text = `${a.r.stderr || ''}\n${a.r.stdout || ''}\n${a.raw}`;
      if (isCapped(text)) {
        state.resetAt = parseResetAt(text, now());
        state.reason = 'usage cap';
        const wait = state.resetAt
          ? state.resetAt.getTime() - now().getTime() + RESET_MARGIN_MIN * 60_000
          : null;
        if (!state.waited && wait !== null && wait <= maxWaitMs(env)) {
          state.waited = true;
          log.out(
            `[codex-review] Codex is capped; waiting ${Math.ceil(wait / 60_000)} min for its reset, then retrying once.\n`
          );
          sleep(Math.max(wait, 0));
          const b = tryCodex(prompt, opts, 'retry at the reset');
          if (b.parsed) {
            return {
              parsed: b.parsed,
              reviewer: 'codex',
              raw: b.raw,
              ...opts,
              tokens: b.r.tokens ?? null,
              attempts,
            };
          }
          attempts.push({
            reviewer: 'codex',
            ...opts,
            status: b.r.status ?? -1,
            capped: isCapped(`${b.r.stderr}${b.raw}`),
          });
        }
      } else {
        state.reason = `codex exit ${a.r.status ?? -1}, no parseable findings`;
      }
      state.codexDown = true;
    }
    if (allowClaude && claudeUsable) {
      log.out(
        '[codex-review] Codex unavailable and the diff is risky: Claude review (lean flags).\n'
      );
      const claudeModel = claudeReviewModel(env);
      const c = runClaude(prompt, { model: claudeModel });
      const raw = c.text || '';
      const parsed = extract(raw);
      if (parsed) {
        return {
          parsed,
          reviewer: 'claude',
          raw,
          model: claudeModel,
          effort: null,
          tokens: c.tokens ?? null,
          costUsd: c.costUsd ?? null,
          attempts,
        };
      }
      attempts.push({ reviewer: 'claude', status: -1, capped: false });
      return {
        parsed: null,
        reviewer: null,
        raw,
        deferred: {
          reason: `${state.reason}; claude gave no parseable review`,
          resetAt: state.resetAt,
        },
        attempts,
      };
    }
    return {
      parsed: null,
      reviewer: null,
      raw: '',
      deferred: { reason: state.reason || 'codex unavailable', resetAt: state.resetAt },
      attempts,
    };
  };
}
