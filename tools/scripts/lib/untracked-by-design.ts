/**
 * Paths the repository deliberately does not track.
 *
 * ADR-067 keeps only canonical attestation files under .specify/sprints in git
 * (.specify/sprints/.gitignore): planning/, specifications/, context/, execution/
 * and every attestation-dir file except attestation.json, attestation-latest.json
 * and task-tracking.json are local working files. A "Completed" task whose
 * Artifacts To Track cites one of them cannot be checked from any checkout, so
 * the integrity checks must not count it as a missing artifact.
 *
 * The rules are read from the .gitignore itself so this never drifts from it.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SPECIFY_SPRINTS = '.specify/sprints/';

interface Rule {
  negate: boolean;
  dirOnly: boolean;
  regex: RegExp;
}

function globToRegex(glob: string): RegExp {
  let out = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      out += '.*';
      i++;
    } else if (c === '*') {
      out += '[^/]*';
    } else if (c === '?') {
      out += '[^/]';
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${out}$`);
}

/** Parse the subset of gitignore syntax .specify/sprints/.gitignore uses (anchored globs, `**`, `!`, trailing `/`). */
export function parseIgnoreRules(content: string): Rule[] {
  const rules: Rule[] = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!');
    let pattern = negate ? line.slice(1) : line;
    const dirOnly = pattern.endsWith('/');
    if (dirOnly) pattern = pattern.slice(0, -1);
    pattern = pattern.replace(/^\//, '');
    rules.push({ negate, dirOnly, regex: globToRegex(pattern) });
  }
  return rules;
}

/**
 * gitignore semantics for a file path relative to the .gitignore's directory:
 * a file is ignored if it, or any parent directory, is ignored (a parent that is
 * excluded cannot be re-included); the last matching rule wins at each level.
 */
export function isIgnored(relPath: string, rules: Rule[]): boolean {
  const parts = relPath.split('/').filter(Boolean);
  for (let depth = 1; depth <= parts.length; depth++) {
    const candidate = parts.slice(0, depth).join('/');
    const isDir = depth < parts.length;
    let ignored = false;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.regex.test(candidate)) ignored = !rule.negate;
    }
    if (ignored && isDir) return true;
    if (depth === parts.length) return ignored;
  }
  return false;
}

const cache = new Map<string, Rule[]>();

function rulesFor(repoRoot: string): Rule[] {
  let rules = cache.get(repoRoot);
  if (!rules) {
    const file = join(repoRoot, SPECIFY_SPRINTS, '.gitignore');
    rules = existsSync(file) ? parseIgnoreRules(readFileSync(file, 'utf8')) : [];
    cache.set(repoRoot, rules);
  }
  return rules;
}

/** True when `artifactPath` (repo-relative, any prefix such as SPEC: already stripped) is untracked by design. */
export function isUntrackedByDesign(artifactPath: string, repoRoot: string): boolean {
  const p = artifactPath.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p.startsWith(SPECIFY_SPRINTS)) return false;
  return isIgnored(p.slice(SPECIFY_SPRINTS.length), rulesFor(repoRoot));
}
