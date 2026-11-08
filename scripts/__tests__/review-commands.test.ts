/**
 * The semantic-review reviewers read; they never start processes. On 2026-11-07 a codex review
 * started a full Chromium on the owner's PC, which is a failed Windows sign-in.
 * A fake spawn stands in for the reviewers here: nothing is started.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  CLAUDE_REVIEW_ARGS,
  claudeReviewText,
  codexExecArgs,
  reviewerSpawnOptions,
  runClaudeReviewer,
  runCodexReviewer,
} from '../lib/review-commands.mjs';

describe('reviewer command lines', () => {
  it('runs codex in the read-only sandbox, overriding the global config', () => {
    const args = codexExecArgs('/tmp/last.txt');
    expect(args.slice(0, 2)).toEqual(['exec', '-']);
    expect(args[args.indexOf('-s') + 1]).toBe('read-only');
    expect(args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(args.slice(-2)).toEqual(['-o', '/tmp/last.txt']);
  });

  it('runs the Claude fallback headless with both shell tools removed', () => {
    expect(CLAUDE_REVIEW_ARGS.slice(0, 3)).toEqual(['-p', '--output-format', 'json']);
    const disallowed = CLAUDE_REVIEW_ARGS.slice(
      CLAUDE_REVIEW_ARGS.indexOf('--disallowedTools') + 1
    );
    expect(disallowed).toEqual(expect.arrayContaining(['Bash', 'PowerShell']));
  });
});

describe('starting the reviewers', () => {
  it('gives each reviewer the prompt on stdin, the repo as cwd and a 5-minute limit', () => {
    const options = reviewerSpawnOptions('PROMPT', '/repo', 'linux', { A: '1' });
    expect(options).toMatchObject({
      encoding: 'utf8',
      input: 'PROMPT',
      cwd: '/repo',
      shell: false,
      env: { A: '1' },
      timeout: 5 * 60 * 1000,
    });
    expect(reviewerSpawnOptions('P', '/repo', 'win32').shell).toBe(true);
    expect(reviewerSpawnOptions('P', '/repo').env).toEqual({ ...process.env });
  });

  it('starts codex read-only and claude without shell tools', () => {
    const spawn = vi.fn(() => ({ stdout: '', stderr: '', status: 0 }));
    runCodexReviewer('PROMPT', '/tmp/last.txt', '/repo', spawn as never);
    runClaudeReviewer('PROMPT', '/repo', spawn as never);
    expect(spawn).toHaveBeenNthCalledWith(
      1,
      'codex',
      codexExecArgs('/tmp/last.txt'),
      expect.objectContaining({ input: 'PROMPT', cwd: '/repo' })
    );
    expect(spawn).toHaveBeenNthCalledWith(
      2,
      'claude',
      [...CLAUDE_REVIEW_ARGS],
      expect.objectContaining({ input: 'PROMPT', cwd: '/repo' })
    );
  });

  it("reads the review text from Claude's JSON envelope, else the raw output", () => {
    expect(claudeReviewText({ stdout: JSON.stringify({ result: 'FINDINGS' }) })).toBe('FINDINGS');
    expect(claudeReviewText({ stdout: JSON.stringify({ other: 1 }) })).toBe('{"other":1}');
    expect(claudeReviewText({ stdout: 'not json {findings: []}' })).toBe('not json {findings: []}');
    expect(claudeReviewText({ stdout: '', stderr: 'boom' })).toBe('boom');
    expect(claudeReviewText({})).toBe('');
  });

  it('is what codex-review.mjs actually runs', () => {
    const script = readFileSync(path.join(__dirname, '..', 'codex-review.mjs'), 'utf8');
    expect(script).toMatch(/runCodexReviewer\(fullPrompt, lastMsgPath, REPO_ROOT, spawnSync\)/);
    expect(script).toMatch(/runClaudeReviewer\(fullPrompt, REPO_ROOT, spawnSync\)/);
    // No review run starts past the helper (`codex login status` is only an auth check).
    expect(script).not.toMatch(/spawnSync\(\s*'codex',\s*\[\s*'exec'/);
    expect(script).not.toMatch(/spawnSync\(\s*'claude'/);
  });
});
