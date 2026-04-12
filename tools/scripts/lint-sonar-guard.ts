import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const TRACKED_EXTENSIONS = /\.(ts|tsx)$/i;
const EXCLUDED_PATH_SEGMENTS = [
  '/node_modules/',
  '/dist/',
  '/build/',
  '/.next/',
  '/coverage/',
  '/artifacts/',
  '/.turbo/',
  '/benchmarks/',
];

function runGit(command: string): string | null {
  try {
    return execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function parseLines(output: string | null): string[] {
  if (!output) return [];
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveBaseRef(): string | null {
  const explicitBase = process.env.SONAR_GUARD_BASE?.trim();
  const githubBase = process.env.GITHUB_BASE_REF?.trim();
  const candidates = [
    explicitBase,
    githubBase ? `origin/${githubBase}` : null,
    'origin/main',
    'main',
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    const mergeBase = runGit(`git merge-base ${candidate} HEAD`);
    if (mergeBase) return mergeBase;
  }

  return null;
}

function collectChangedFiles(): string[] {
  const override = process.env.SONAR_GUARD_FILES?.trim();
  const files = new Set<string>();

  if (override) {
    override
      .split(/[,\r\n]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .forEach((file) => files.add(file));
  } else if (process.env.CI) {
    const mergeBase = resolveBaseRef();
    if (mergeBase) {
      parseLines(runGit(`git diff --name-only --diff-filter=ACMR ${mergeBase}...HEAD`)).forEach(
        (file) => files.add(file)
      );
    } else {
      parseLines(runGit('git diff --name-only --diff-filter=ACMR HEAD~1...HEAD')).forEach((file) =>
        files.add(file)
      );
    }
  } else {
    const staged = parseLines(runGit('git diff --cached --name-only --diff-filter=ACMR'));
    const unstaged = parseLines(runGit('git diff --name-only --diff-filter=ACMR'));
    const untracked = parseLines(runGit('git ls-files --others --exclude-standard'));
    const localCandidates = staged.length > 0 ? staged : [...unstaged, ...untracked];
    localCandidates.forEach((file) => files.add(file));
  }

  return Array.from(files)
    .map((file) => file.replaceAll(/\\/g, '/'))
    .filter((file) => TRACKED_EXTENSIONS.test(file))
    .filter((file) => !EXCLUDED_PATH_SEGMENTS.some((segment) => file.includes(segment)))
    .filter((file) => existsSync(resolve(process.cwd(), file)));
}

function quoteFiles(files: string[]): string {
  return files.map((file) => `"${file.replaceAll(/"/g, '\\"')}"`).join(' ');
}

/**
 * Run a command, returning true on success and false on failure.
 * Does NOT exit the process — callers accumulate failures.
 */
function tryCommand(command: string): boolean {
  try {
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run eslint in batches to avoid Windows command-line length limits (~8191 chars).
 * Splits the file list into chunks and runs eslint for each chunk.
 * Returns true only if ALL batches pass.
 */
function runEslintBatched(baseCommand: string, files: string[], batchSize = 80): boolean {
  let allPassed = true;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    const command = `${baseCommand} ${quoteFiles(batch)}`;
    if (!tryCommand(command)) {
      allPassed = false;
    }
  }
  return allPassed;
}

function main() {
  const files = collectChangedFiles();

  if (files.length === 0) {
    console.log('sonar-guard: no changed TS/TSX files found, skipping.');
    return;
  }

  console.log(`sonar-guard: checking ${files.length} changed TS/TSX files.`);

  let allPassed = runEslintBatched(
    'pnpm exec eslint --config tools/eslint/sonar-guard.config.mjs --max-warnings=0',
    files
  );

  const webTsxFiles = files
    .filter((file) => file.startsWith('apps/web/src/'))
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => file.replace(/^apps\/web\//, ''));

  if (webTsxFiles.length > 0) {
    console.log(`sonar-guard: running web accessibility guard on ${webTsxFiles.length} file(s).`);
    const webPassed = runEslintBatched(
      'pnpm --filter web exec eslint --config eslint.sonar-guard.config.mjs --max-warnings=0',
      webTsxFiles,
      30
    );
    if (!webPassed) allPassed = false;
  }

  if (!allPassed) {
    process.exit(1);
  }
}

main();
