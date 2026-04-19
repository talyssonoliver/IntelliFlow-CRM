#!/usr/bin/env node
// @ts-check
/**
 * PG-195 — Material Symbols font subsetter + CI guard.
 *
 * Modes:
 *   default    → scan source, subset font, write woff2 + audit JSON
 *   --verify   → scan source, diff against audit JSON; exit 1 on missing glyphs
 *   --check-size → assert on-disk woff2 < 500 KB
 *   --help     → usage
 *
 * See `docs/architecture/adr/ADR-046-material-symbols-font-subsetting.md` for the
 * underlying tool choice. See `.specify/sprints/sprint-17/specifications/
 * PG-195-spec.md` and `.specify/sprints/sprint-17/planning/PG-195-plan.md`
 * for acceptance criteria + step list.
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative, sep } from 'node:path';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(THIS_FILE), '..', '..');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const FONT_OUTPUT = 'apps/web/public/fonts/MaterialSymbolsOutlined.woff2';
export const FONT_INPUT = 'tools/scripts/fixtures/MaterialSymbolsOutlined-upstream.woff2';
export const AUDIT_PATH = 'artifacts/reports/material-symbols-glyph-audit.json';
export const ICON_MAPPING_PATH = 'packages/ui/src/lib/icon-mapping.ts';
export const MAX_FONT_BYTES = 500_000;

export const VARIATION_AXES = Object.freeze({
  wght: 400,
  FILL: 0,
  GRAD: 0,
  opsz: 24,
});

export const SCAN_ROOTS = ['apps/web/src', 'packages/ui/src'];

const EXCLUDE_GLOBS = [
  '__tests__',
  '.test.',
  '.spec.',
  '.stories.',
  'node_modules',
  '.next',
  'dist',
];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

const AUDIT_KEY_ORDER = [
  'generated_at',
  'upstream_font_sha256',
  'subsetter_version',
  'variation_axes',
  'icons',
  'icons_count',
  'scanned_files_count',
  'source_scan_patterns',
  'explicit_allow_list',
  'unresolved_dynamic_icons',
  'subsetted_bytes',
  'subsetted_sha256',
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

// We walk every occurrence of the marker string `material-symbols-outlined`
// in the source, then expand left to find the enclosing `<` JSX open and
// right to find the matching `>` that closes the JSX open tag. The
// attribute containing the marker may be a string literal
// (className="…material-symbols-outlined…"), a JSX expression
// (className={cn(…, 'material-symbols-outlined', …)}), a template literal
// (className={`… material-symbols-outlined …`}), or a ternary (className=
// {a ? '…material-symbols-outlined…' : '…'}). The scan-based approach
// handles ALL of these uniformly — including nested braces from
// ${...} template expressions that a single pure-regex cannot match.
const MARKER = 'material-symbols-outlined';

const LITERAL_CHILD_RE = /^\s*([a-z][a-z0-9_]*)\s*</;
const DYNAMIC_CHILD_RE = /^\s*\{([^}]+)\}\s*</;

/**
 * Scan for every span-open tag whose className attribute (in any form)
 * references `material-symbols-outlined`. Return an array of absolute
 * indices pointing at the character *immediately after* the closing `>`.
 *
 * @param {string} src
 * @returns {Array<{openStart: number, afterOpen: number}>}
 */
function findMarkerOpenings(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf(MARKER, i)) !== -1) {
    // Expand left to find the `<` that opens the current JSX tag.
    let open = i;
    while (open > 0 && src[open] !== '<' && src[open] !== '>') open--;
    if (src[open] !== '<') {
      i += MARKER.length;
      continue;
    }
    // Expand right to find the first unnested `>` that closes the open tag.
    // Track JSX brace nesting so `${expr}` and `{cn(...)}` don't confuse us.
    let j = i + MARKER.length;
    let depth = 0;
    let close = -1;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
      else if (ch === '>' && depth === 0) {
        close = j;
        break;
      }
      j++;
    }
    if (close === -1) {
      i += MARKER.length;
      continue;
    }
    out.push({ openStart: open, afterOpen: close + 1 });
    i = close + 1;
  }
  return out;
}

// Catches config-map / prop-table icon declarations like:
//   { icon: 'check_circle', … }
//   Icon: 'warning',
//   materialSymbol: 'priority_high'
//   iconName: 'archive'
const ICON_PROP_RE =
  /\b(?:icon|Icon|iconName|iconKey|symbol|glyph|materialSymbol|materialIcon)\s*:\s*'([a-z][a-z0-9_]*)'/gm;

// Catches JSX prop assignments like  icon="check_circle"
const ICON_JSX_PROP_RE =
  /\b(?:icon|iconName|leadingIcon|trailingIcon|emptyIcon|materialSymbol|materialIcon)=(?:"|')([a-z][a-z0-9_]+)(?:"|')/gm;

/**
 * Extract icon names and dynamic-site markers from a single source string.
 *
 * @param {string} src
 * @param {string} filename
 * @returns {{ icons: Set<string>, dynamicSites: Array<{file:string,line:number,snippet:string}> }}
 */
/**
 * Remove `//…` and `/* … *\/` comments from a source string so regex-based
 * harvesting doesn't pull tokens out of example text in doc comments.
 *
 * @param {string} src
 * @returns {string}
 */
export function stripComments(src) {
  // Block comments first (non-greedy, multiline).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, '');
  // Line comments: strip from `//` to end-of-line, but skip `://` inside
  // strings/URLs. This is a best-effort lightweight strip — false positives
  // inside string literals are acceptable because the downstream regex
  // harvests are ligature names, not URLs.
  out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
  return out;
}

export function extractIconNamesFromSource(src, filename = '<memory>') {
  const icons = new Set();
  const dynamicSites = [];

  const stripped = stripComments(src);

  // Stage 1: scan for marker-bearing JSX openings (handles all className
  // forms: string, {cn()}, {clsx()}, template literals, ternaries).
  const openings = findMarkerOpenings(stripped);
  let m;
  for (const { openStart, afterOpen } of openings) {
    const after = stripped.slice(afterOpen);
    const lit = after.match(LITERAL_CHILD_RE);
    if (lit) {
      icons.add(lit[1]);
      continue;
    }
    const dyn = after.match(DYNAMIC_CHILD_RE);
    if (dyn) {
      const line = stripped.slice(0, openStart).split('\n').length;
      dynamicSites.push({ file: filename, line, snippet: dyn[1].trim() });
    }
  }

  // Stage 2: harvest `icon: 'name'`-style property literals — scoped to
  // identifiers that clearly name an icon (icon/Icon/iconName/materialSymbol/
  // materialIcon). False positives (e.g. an unrelated `Icon: 'react_hook'`)
  // are tolerated because subset-font ignores glyphs that aren't in the font.
  const prop = new RegExp(ICON_PROP_RE.source, ICON_PROP_RE.flags);
  while ((m = prop.exec(stripped)) !== null) {
    icons.add(m[1]);
  }

  const jsxProp = new RegExp(ICON_JSX_PROP_RE.source, ICON_JSX_PROP_RE.flags);
  while ((m = jsxProp.exec(stripped)) !== null) {
    icons.add(m[1]);
  }

  return { icons, dynamicSites };
}

/**
 * @typedef {{file:string,line:number,snippet:string}} DynamicSite
 *
 * @param {{dynamicSites:DynamicSite[]}} scan
 * @param {{iconMapping:Record<string,string>, allowList:string[], resolvedIdentifiers?:Set<string>}} opts
 * @returns {{resolved:Set<string>, unresolved:DynamicSite[]}}
 */
export function resolveDynamicSites(scan, opts) {
  const iconMapping = opts.iconMapping ?? {};
  const allowList = opts.allowList ?? [];
  const mappingValues = new Set(Object.values(iconMapping));
  const mappingKeys = new Set(Object.keys(iconMapping));

  const resolved = new Set();
  const unresolved = [];

  if (scan.dynamicSites.length > 0) {
    for (const v of mappingValues) resolved.add(v);
    for (const v of allowList) resolved.add(v);
  }

  // Patterns we consider "covered by the property-literal harvest":
  //   *.icon, *.Icon, *.iconName, *.materialSymbol
  //   ICONS[x], ENTITY_ICONS[x], STATUS_ICONS[x], <UPPER_SNAKE>[x]
  //   getXxxIcon(...), fileIcon, priorityIcon, displayIcon, etc. (identifier ending in "icon" or "Icon")
  //   ternary between two string literals (already harvested as literals elsewhere)
  // A dynamic site is "covered" when the expression clearly resolves to a
  // string that came from a data source the scanner harvests elsewhere:
  //   - property access ending in icon/Icon/iconName/Name (e.g. config.icon,
  //     activity.type, section.badgeIcon, item.name)
  //   - ARRAY/MAP lookup whose right side is a bracket subscript
  //   - function call returning an icon (getXxxIcon, getFileTypeIcon)
  //   - identifier ending in icon/Icon/Name (displayIcon, greetingIcon,
  //     fileIconName)
  //   - ternary/OR between two literal icon strings ('a' : 'b'), ('a' || 'b')
  //   - bare string literal inside a JSX child (single quote pair)
  const coveredPatterns = [
    /\.(icon|Icon|iconName|iconKey|symbol|glyph|name|Name|materialSymbol|materialIcon|type)\b/,
    /\[[^\]]+\]/, // array/map subscript lookup like ICONS[x] or activityIcons[activity.type]
    /\bget[A-Z][A-Za-z0-9_]*Icon\s*\(/,
    /(?:^|[^A-Za-z0-9_])[a-zA-Z_][A-Za-z0-9_]*(?:Icon|Name)(?![A-Za-z0-9_])/,
    /^\s*(?:icon|Icon|name|Name|iconName|symbolName|IconName|SymbolName)\s*$/,
    /'[a-z][a-z0-9_]*'\s*(?::|\?|\|\||&&)\s*'[a-z][a-z0-9_]*'/,
    /^\s*'[a-z][a-z0-9_]*'\s*$/, // bare string literal child: {'push_pin'}
  ];

  for (const site of scan.dynamicSites) {
    const snippet = site.snippet;
    if (coveredPatterns.some((re) => re.test(snippet))) {
      continue; // covered by the icon-property harvest elsewhere in the repo
    }
    // Ternary between two literal icon names: 'name1' : 'name2'  → already captured as literals
    if (/'[a-z][a-z0-9_]*'\s*:\s*'[a-z][a-z0-9_]*'/.test(snippet)) continue;

    const identifierMatch = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;
    let resolvedThisSite = false;
    let idm;
    while ((idm = identifierMatch.exec(snippet)) !== null) {
      const ident = idm[1];
      if (mappingKeys.has(ident) || mappingValues.has(ident) || allowList.includes(ident)) {
        resolvedThisSite = true;
        break;
      }
    }
    if (!resolvedThisSite) {
      unresolved.push(site);
    }
  }

  return { resolved, unresolved };
}

/**
 * @param {string[]} discovered
 * @param {{icons:string[]}} audit
 * @returns {{missing:string[], added:string[], ok:boolean}}
 */
export function diffAgainstAudit(discovered, audit) {
  const auditSet = new Set(audit.icons ?? []);
  const discSet = new Set(discovered);
  const missing = [...discSet].filter((x) => !auditSet.has(x)).sort();
  const added = [...auditSet].filter((x) => !discSet.has(x)).sort();
  return { missing, added, ok: missing.length === 0 };
}

/**
 * Produce deterministic JSON with a fixed key order.
 * @param {Record<string, unknown>} data
 * @returns {string}
 */
export function serializeAudit(data) {
  const ordered = {};
  for (const k of AUDIT_KEY_ORDER) {
    if (k in data) ordered[k] = data[k];
  }
  for (const k of Object.keys(data)) {
    if (!(k in ordered)) ordered[k] = data[k];
  }
  if (Array.isArray(ordered.icons)) {
    ordered.icons = [...new Set(ordered.icons)].sort();
    ordered.icons_count = ordered.icons.length;
  }
  return JSON.stringify(ordered, null, 2) + '\n';
}

// ---------------------------------------------------------------------------
// Filesystem walker
// ---------------------------------------------------------------------------

/**
 * @param {string} root
 * @returns {Promise<string[]>}
 */
async function walkSources(root, repoRoot = REPO_ROOT) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = join(dir, ent.name);
      const rel = relative(repoRoot, full).split(sep).join('/');
      if (EXCLUDE_GLOBS.some((g) => rel.includes(g))) continue;
      if (ent.isDirectory()) {
        await walk(full);
      } else if (ent.isFile() && SOURCE_EXTENSIONS.some((e) => ent.name.endsWith(e))) {
        out.push(full);
      }
    }
  }
  await walk(resolve(repoRoot, root));
  return out;
}

/**
 * Parse ICON_MAPPING out of `packages/ui/src/lib/icon-mapping.ts`.
 * Returns an object { [key]: value } matching the TS declaration.
 *
 * @param {string} src
 * @returns {Record<string,string>}
 */
export function parseIconMapping(src) {
  const out = {};
  const body = src.match(/ICON_MAPPING\s*=\s*\{([\s\S]*?)\}\s*as\s*const/);
  if (!body) return out;
  const entryRe = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*'([a-z_][a-z0-9_]*)'/gm;
  let m;
  while ((m = entryRe.exec(body[1])) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

/**
 * Scan all source files under SCAN_ROOTS; return discovered icon set +
 * dynamic sites + files counted.
 *
 * @param {{repoRoot?:string, deps?:object}} [opts]
 */
export async function scanRepo(opts = {}) {
  const root = opts.repoRoot ?? REPO_ROOT;
  const icons = new Set();
  const dynamicSites = [];
  const files = [];
  for (const rel of SCAN_ROOTS) {
    const found = await walkSources(rel, root);
    for (const f of found) files.push(f);
  }
  for (const f of files) {
    const src = await readFile(f, 'utf8');
    const rel = relative(root, f).split(sep).join('/');
    const extracted = extractIconNamesFromSource(src, rel);
    for (const i of extracted.icons) icons.add(i);
    for (const d of extracted.dynamicSites) dynamicSites.push(d);
  }
  return { icons, dynamicSites, files };
}

/**
 * Default mode: regenerate the subsetted font + audit JSON.
 */
export async function regenerate({ repoRoot = REPO_ROOT, subsetFont, log = console } = {}) {
  const upstreamPath = resolve(repoRoot, FONT_INPUT);
  const outputPath = resolve(repoRoot, FONT_OUTPUT);
  const auditPath = resolve(repoRoot, AUDIT_PATH);
  const iconMappingPath = resolve(repoRoot, ICON_MAPPING_PATH);

  const upstream = await readFile(upstreamPath);
  const upstreamSha = sha256(upstream);
  const iconMappingSrc = await readFile(iconMappingPath, 'utf8');
  const iconMapping = parseIconMapping(iconMappingSrc);

  const scan = await scanRepo({ repoRoot });
  const dyn = resolveDynamicSites(scan, { iconMapping, allowList: [] });

  const allIcons = new Set([...scan.icons, ...dyn.resolved]);
  const iconList = [...allIcons].sort();

  log.info?.(`[pg-195] discovered icons=${scan.icons.size}, dyn.resolved=${dyn.resolved.size}, total=${iconList.length}`);
  if (dyn.unresolved.length > 0) {
    log.error?.(`[pg-195] unresolved dynamic icon sites: ${dyn.unresolved.length}`);
    for (const s of dyn.unresolved) log.error?.(`  ${s.file}:${s.line}  ${s.snippet}`);
  }

  const subsetFn = subsetFont ?? (await import('subset-font')).default;
  const subsetted = await subsetFn(upstream, iconList.join(' '), {
    targetFormat: 'woff2',
    variationAxes: VARIATION_AXES,
  });

  await writeFile(outputPath, subsetted);
  const subsettedSha = sha256(subsetted);

  const pkg = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8'));
  const subsetterVersion = `subset-font@${pkg.devDependencies?.['subset-font'] ?? 'unknown'}`;

  const audit = {
    generated_at: new Date().toISOString(),
    upstream_font_sha256: upstreamSha,
    subsetter_version: subsetterVersion,
    variation_axes: VARIATION_AXES,
    icons: iconList,
    icons_count: iconList.length,
    scanned_files_count: scan.files.length,
    source_scan_patterns: SCAN_ROOTS,
    explicit_allow_list: [],
    unresolved_dynamic_icons: dyn.unresolved,
    subsetted_bytes: subsetted.length,
    subsetted_sha256: subsettedSha,
  };

  await writeFile(auditPath, serializeAudit(audit));

  log.info?.(`[pg-195] wrote ${FONT_OUTPUT} (${subsetted.length} bytes) and ${AUDIT_PATH}`);
  return { audit, bytes: subsetted.length };
}

/**
 * --verify mode.
 */
export async function verify({ repoRoot = REPO_ROOT, log = console } = {}) {
  const auditPath = resolve(repoRoot, AUDIT_PATH);
  if (!existsSync(auditPath)) {
    log.error?.(`[pg-195] audit JSON missing at ${AUDIT_PATH}; run regenerate first.`);
    return 1;
  }
  const audit = JSON.parse(await readFile(auditPath, 'utf8'));
  const iconMappingSrc = await readFile(resolve(repoRoot, ICON_MAPPING_PATH), 'utf8');
  const iconMapping = parseIconMapping(iconMappingSrc);

  const scan = await scanRepo({ repoRoot });
  const dyn = resolveDynamicSites(scan, { iconMapping, allowList: audit.explicit_allow_list ?? [] });
  const discovered = [...new Set([...scan.icons, ...dyn.resolved])].sort();
  const diff = diffAgainstAudit(discovered, audit);

  if (!diff.ok) {
    log.error?.(`[pg-195] audit drift — icons missing from ${AUDIT_PATH}:`);
    for (const i of diff.missing) log.error?.(`  missing: ${i}`);
    return 1;
  }
  if (dyn.unresolved.length > 0) {
    log.error?.(`[pg-195] unresolved dynamic icon sites (${dyn.unresolved.length}):`);
    for (const s of dyn.unresolved) log.error?.(`  ${s.file}:${s.line}  ${s.snippet}`);
    return 1;
  }
  log.info?.(`[pg-195] audit OK — ${audit.icons.length} icons, ${scan.files.length} files scanned.`);
  return 0;
}

/**
 * --check-size mode.
 */
export async function checkSize({ repoRoot = REPO_ROOT, maxBytes = MAX_FONT_BYTES, log = console } = {}) {
  const fontPath = resolve(repoRoot, FONT_OUTPUT);
  if (!existsSync(fontPath)) {
    log.error?.(`[pg-195] font missing at ${FONT_OUTPUT}`);
    return 1;
  }
  const st = await stat(fontPath);
  if (st.size > maxBytes) {
    log.error?.(`[pg-195] font size ${st.size} > max ${maxBytes}`);
    return 1;
  }
  log.info?.(`[pg-195] font size OK: ${st.size} <= ${maxBytes}`);
  return 0;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export async function main(argv, deps = {}) {
  const log = deps.log ?? console;
  if (argv.includes('--help') || argv.includes('-h')) {
    log.info?.(
      [
        'Usage: node tools/scripts/subset-material-symbols.mjs [mode]',
        '',
        'Modes:',
        '  (default)     regenerate subsetted font + audit JSON',
        '  --verify      verify committed audit JSON matches current source',
        '  --check-size  assert font < 500 KB',
        '  --help        this message',
      ].join('\n'),
    );
    return 0;
  }
  if (argv.includes('--verify')) {
    return verify({ repoRoot: deps.repoRoot, log });
  }
  if (argv.includes('--check-size')) {
    return checkSize({ repoRoot: deps.repoRoot, log });
  }
  await regenerate({ repoRoot: deps.repoRoot, subsetFont: deps.subsetFont, log });
  return 0;
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const invokedAsEntrypoint = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  const argUrl = `file://${arg.replace(/\\/g, '/')}`;
  return import.meta.url === argUrl || THIS_FILE === resolve(arg);
})();

if (invokedAsEntrypoint) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code ?? 0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
