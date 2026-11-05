#!/usr/bin/env node
/**
 * Refuses generated output nobody reads. A staged or branch change in a generated
 * zone must be grandfathered, cited by an attestation, or registered in
 * tools/generated-paths.yml with a reader that still names it. Workflows and hooks
 * must stage by name. There is no skip variable.
 *
 *   node scripts/check-generated-registry.mjs --staged         (pre-commit)
 *   node scripts/check-generated-registry.mjs --base <ref>     (pre-ship, CI)
 *
 * A string match proves a reader names a path, not that it uses it: reviewing
 * entries stays with the pull request.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const REGISTRY_PATH = 'tools/generated-paths.yml';
export const GRANDFATHER_PATH = 'tools/generated-paths.grandfathered.txt';
export const DEFAULT_MAX_KB = 1024;

const ZONES = [
  /^artifacts\//,
  /^packages\/[^/]+\/artifacts\//,
  /^\.lighthouseci\//,
  /^\.specify\/sprints\/[^/]+\/(execution|context)\//,
  /^apps\/[^/]+\/[^/]*-output\.json$/,
  /\.sarif$/,
  /(^|\/)lcov\.info$/,
  /(^|\/)junit[^/]*\.xml$/,
];

const BROAD_ADD =
  /\bgit\s+add\b(?:\s+-{1,2}[a-zA-Z-]+)*\s+(?:\.|artifacts\/?|-A|--all)(?:\s|$)|\bgit\s+add\s+(?:-A|--all)\b/;

/** Readers that only mention a path: they don't make its output worth committing. */
const NOT_A_READER = [
  /(^|\/)__tests__\//,
  /\.test\.[cm]?[jt]sx?$/,
  /^docs\//,
  /\.md$/,
  /(^|\/)\.gitignore$/,
  /^\.gitleaks/,
  /^\.prettierignore$/,
  /^tools\/lint\//,
];

export const inZone = (file) => ZONES.some((zone) => zone.test(file));

const LITERAL = /[.+^${}()|[\]\\]/g;
const ANY_DIRS = '\0';

/** `*` stays inside a folder, and `**` crosses folders. */
export function globToRegExp(glob) {
  const body = glob
    .replace(LITERAL, String.raw`\$&`)
    .replaceAll('**/', ANY_DIRS)
    .replaceAll('**', '.*')
    .replaceAll('*', '[^/]*')
    .replaceAll(ANY_DIRS, '(?:.*/)?');
  return new RegExp(`^${body}$`);
}

export function findEntry(registry, file) {
  return (registry.entries ?? []).find((entry) => globToRegExp(entry.path).test(file));
}

function entryProblems(entry, file, { readFile, sizeKb, isIgnored }) {
  if (entry.outcome !== 'tracked') {
    return [`${file}: registered as "${entry.outcome}", so it must not be committed.`];
  }
  const problems = [];
  const readers = entry.readers ?? [];
  for (const reader of readers) {
    const text = readFile(reader.file);
    if (text === null) problems.push(`${file}: reader ${reader.file} no longer exists.`);
    else if (!text.includes(reader.contains)) {
      problems.push(`${file}: reader ${reader.file} no longer contains "${reader.contains}".`);
    }
  }
  const real = readers.filter(
    (reader) => reader.file !== entry.writer && !NOT_A_READER.some((re) => re.test(reader.file))
  );
  if (real.length === 0) {
    problems.push(
      `${file}: nothing reads it. A test, a doc, its own writer or an exclusion list doesn't count.`
    );
  }
  if (isIgnored(file) && !(entry.force === true && entry.reason)) {
    problems.push(
      `${file}: is ignored and force-added, so its entry needs force: true and a reason.`
    );
  }
  const limit = entry.max_kb ?? DEFAULT_MAX_KB;
  if (sizeKb(file) > limit) problems.push(`${file}: is over its ${limit} KB limit.`);
  return problems;
}

function changeProblems(file, context) {
  const { registry, isCited } = context;
  const entry = findEntry(registry, file);
  if (entry) return entryProblems(entry, file, context);
  if (/^artifacts\/lighthouse\/.*\.html$/.test(file)) {
    return [`${file}: Lighthouse HTML has no reader. Keep it local; the gate reads the JSON.`];
  }
  if (isCited(file)) return [];
  return [
    `${file}: generated output with no registry entry. Add it to ${REGISTRY_PATH} with what reads it, cite it from an attestation, or leave it uncommitted.`,
  ];
}

function grandfatherProblems({ grandfathered, baseGrandfathered, tracked }) {
  const problems = [];
  for (const file of grandfathered) {
    if (baseGrandfathered && !baseGrandfathered.has(file)) {
      problems.push(`${GRANDFATHER_PATH}: ${file} was added. This list can only shrink.`);
    }
    if (!tracked.has(file)) {
      problems.push(`${GRANDFATHER_PATH}: ${file} is no longer tracked, so remove its line.`);
    }
  }
  return problems;
}

function broadAddProblems(scripts) {
  const problems = [];
  for (const { file, text } of scripts) {
    text.split(/\r?\n/).forEach((line, index) => {
      if (!line.trimStart().startsWith('#') && BROAD_ADD.test(line)) {
        problems.push(`${file}:${index + 1}: staging must name paths, not "${line.trim()}".`);
      }
    });
  }
  return problems;
}

/** Everything that decides the result, with the file system and git passed in. */
export function evaluate(context) {
  const { changes, grandfathered } = context;
  const problems = [...grandfatherProblems(context), ...broadAddProblems(context.scripts)];
  for (const { status, file } of changes) {
    if (status === 'D' || !inZone(file) || grandfathered.has(file)) continue;
    problems.push(...changeProblems(file, context));
  }
  return problems;
}

const parseList = (text) =>
  new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  );

function git(args, input) {
  return spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, input });
}

function mustGit(args) {
  const result = git(args);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function parseChanges(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [status, file] = line.split('\t');
      return { status: status[0], file };
    });
}

function readOrNull(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function citedPaths(tracked) {
  const cited = new Set();
  for (const file of tracked) {
    if (
      !/^\.specify\/sprints\/[^/]+\/attestations\/[^/]+\/attestation(-latest)?\.json$/.test(file)
    ) {
      continue;
    }
    try {
      const hashes = JSON.parse(fs.readFileSync(file, 'utf8')).artifact_hashes;
      for (const key of Object.keys(hashes ?? {})) cited.add(key.replaceAll('\\', '/'));
    } catch {
      // An unreadable attestation cites nothing here; its own validators report it.
    }
  }
  return cited;
}

function scriptsToScan(tracked) {
  return [...tracked]
    .filter((file) => /^\.github\/(workflows|actions)\/.*\.ya?ml$|^\.husky\/[^_/][^/]*$/.test(file))
    .map((file) => ({ file, text: readOrNull(file) ?? '' }));
}

function loadContext(args) {
  const staged = args.includes('--staged');
  const baseAt = args.indexOf('--base');
  const baseRef = baseAt === -1 ? null : args[baseAt + 1];
  if (staged === Boolean(baseRef)) {
    throw new Error('Use exactly one of --staged or --base <ref>.');
  }
  const base = staged ? 'HEAD' : mustGit(['merge-base', baseRef, 'HEAD']).trim();
  const changes = parseChanges(
    mustGit(
      staged
        ? ['diff', '--cached', '--name-status', '--no-renames']
        : ['diff', '--name-status', '--no-renames', `${base}...HEAD`]
    )
  );
  const tracked = new Set(mustGit(['ls-files']).split(/\r?\n/).filter(Boolean));
  const before = git(['show', `${base}:${GRANDFATHER_PATH}`]);
  let cited = null;
  return {
    changes,
    tracked,
    registry: YAML.parse(fs.readFileSync(REGISTRY_PATH, 'utf8')) ?? {},
    grandfathered: parseList(fs.readFileSync(GRANDFATHER_PATH, 'utf8')),
    baseGrandfathered: before.status === 0 ? parseList(before.stdout) : null,
    scripts: scriptsToScan(tracked),
    readFile: readOrNull,
    sizeKb: (file) => (fs.existsSync(file) ? fs.statSync(file).size / 1024 : 0),
    isIgnored: (file) => git(['check-ignore', '-q', '--no-index', file]).status === 0,
    isCited: (file) => {
      cited ??= citedPaths(tracked);
      return cited.has(file);
    },
  };
}

function main() {
  const problems = evaluate(loadContext(process.argv.slice(2)));
  if (problems.length === 0) {
    console.log('check-generated-registry: OK');
    return 0;
  }
  console.error(`check-generated-registry: ${problems.length} problem(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`check-generated-registry: ${error.message}`);
    process.exit(1);
  }
}
