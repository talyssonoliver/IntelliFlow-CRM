/**
 * The semantic-review reviewers read; they never start processes. On 2026-11-07 a codex review
 * started a full Chromium on the owner's PC, which is a failed Windows sign-in.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CLAUDE_REVIEW_ARGS, codexExecArgs } from '../lib/review-commands.mjs';

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

  it('is what codex-review.mjs actually runs', () => {
    const script = readFileSync(path.join(__dirname, '..', 'codex-review.mjs'), 'utf8');
    expect(script).toMatch(/spawnSync\('codex', codexExecArgs\(lastMsgPath\)/);
    expect(script).toMatch(/spawnSync\('claude', \[\.\.\.CLAUDE_REVIEW_ARGS\]/);
    // No other codex exec or claude -p call sneaks past the helper.
    expect(script).not.toMatch(/spawnSync\('codex', \['exec'/);
    expect(script).not.toMatch(/spawnSync\('claude', \['-p'/);
  });
});
