/**
 * SonarCloud's analysis scope, read from `sonar-project.properties` — the ONE
 * place it is defined.
 *
 * check-diff-coverage.mjs mirrors Sonar's `new_coverage` condition locally. It
 * used to carry its own hand-copied regex lists of `sonar.sources` and
 * `sonar.coverage.exclusions`, and those copies drifted: the properties file
 * excluded every `apps/api/src/modules/legal/*.router.ts` while the copy listed
 * seven by name, and the test file mirrored a third, different list (it still
 * treated `apps/workers/` as a source root). Deriving the scope from the
 * properties file at runtime makes pre-ship and Sonar agree by construction.
 */
import fs from 'node:fs';
import path from 'node:path';

export const SONAR_PROPERTIES_FILE = 'sonar-project.properties';

/**
 * Parse a Java-style .properties document into a key → raw value map.
 * Supports `#`/`!` comment lines and backslash line continuations, which is
 * all sonar-project.properties uses.
 *
 * @param {string} text
 * @returns {Map<string, string>}
 */
export function parseProperties(text) {
  const props = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trimStart();
    if (line === '' || line.startsWith('#') || line.startsWith('!')) continue;
    while (line.endsWith('\\') && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i].trimStart();
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    props.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return props;
}

/**
 * A comma-separated property as a list of trimmed, non-empty entries.
 *
 * @param {Map<string, string>} props
 * @param {string} key
 * @returns {string[]}
 */
export function listProperty(props, key) {
  return (props.get(key) ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Translate a Sonar path pattern into an anchored RegExp over a repo-relative,
 * forward-slash path. Sonar semantics: `**` = zero or more directories,
 * `*` = zero or more characters within one path segment, `?` = one character.
 *
 * @param {string} glob
 * @returns {RegExp}
 */
export function sonarGlobToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      if (glob[i + 2] === '/') {
        re += '(?:.*/)?';
        i += 2;
      } else {
        re += '.*';
        i += 1;
      }
    } else if (c === '*') {
      re += '[^/]*';
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += /[\\^$.|+()[\]{}]/.test(c) ? `\\${c}` : c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** @param {string} dir */
function stripTrailingSlashes(dir) {
  let end = dir.length;
  while (end > 0 && dir[end - 1] === '/') end--;
  return dir.slice(0, end);
}

/**
 * The parts of Sonar's scope the diff-coverage gate needs.
 *
 * @param {string} text sonar-project.properties contents
 */
export function sonarScopeFromProperties(text) {
  const props = parseProperties(text);
  const sourceRoots = listProperty(props, 'sonar.sources').map(stripTrailingSlashes);
  if (sourceRoots.length === 0) {
    throw new Error(`${SONAR_PROPERTIES_FILE} declares no sonar.sources`);
  }
  return {
    sourceRoots,
    exclusions: listProperty(props, 'sonar.exclusions').map(sonarGlobToRegExp),
    coverageExclusions: listProperty(props, 'sonar.coverage.exclusions').map(sonarGlobToRegExp),
  };
}

/**
 * @param {string} repoRoot
 */
export function loadSonarScope(repoRoot) {
  return sonarScopeFromProperties(
    fs.readFileSync(path.join(repoRoot, SONAR_PROPERTIES_FILE), 'utf8')
  );
}
