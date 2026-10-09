/**
 * Which recorded validations a Completed task's attestation must hold.
 *
 * Code tasks need the four the repo makes non-negotiable: TypeScript, Tests,
 * Lint, Build, each recorded as a passing run. A task whose deliverables are
 * only Terraform, workflow YAML or docs has no TypeScript to check or build,
 * so it needs two passing checks of its own kind instead. Owner ruling 2026-10-07.
 * "Its own kind" follows the deliverables: a task that delivers Terraform needs
 * two distinct terraform checks (validate, fmt, plan), because lint + tests
 * prove nothing about a .tf file. Other non-code deliverables (workflow YAML,
 * docs, data) take any two distinct non-code kinds.
 *
 * Checks are counted by kind, never by number of entries, and only when they
 * passed: two unrelated or failed records clear nothing.
 */

const SOURCE_EXTENSION = /\.(ts|tsx|js|jsx|mjs|cjs|py|prisma|sql)$/i;
// Code lives here whatever the path ends with, including globs such as apps/api/src/**.
const CODE_ROOTS = /^(apps|packages|src|tests|tools|scripts)\//;
// References to the task's own evidence files say nothing about what kind of work it was.
const EVIDENCE_ROOT = /^\.specify\//;
const TERRAFORM_PATH = /\.(tf|tfvars|hcl)$|(^|\/)terraform\//i;

/** Forward slashes and no leading ./, the form every path test here expects. */
function normalise(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '');
}

/** The paths in an "Artifacts To Track" cell, prefixes such as ARTIFACT: removed. */
function trackedPaths(artifactsStr: string): string[] {
  return (artifactsStr || '')
    .split(/[;,\n]+/)
    .map((item) =>
      item
        .trim()
        .replace(/^[A-Z][A-Z_]*:/, '')
        .trim()
    )
    .filter((p) => p.includes('/') || p.includes('.'))
    .map(normalise);
}

/** The tracked paths that are the work itself, not the task's own evidence files. */
function deliverablesOf(artifactsStr: string): string[] {
  return trackedPaths(artifactsStr).filter((p) => !EVIDENCE_ROOT.test(p));
}

export function isCodePath(p: string): boolean {
  const path = normalise(p);
  return CODE_ROOTS.test(path) || SOURCE_EXTENSION.test(path);
}

/** Non-code only when the task tracks real deliverables and none of them is code. */
export function isNonCodeTask(artifactsStr: string): boolean {
  const deliverables = deliverablesOf(artifactsStr);
  return deliverables.length > 0 && !deliverables.some(isCodePath);
}

export interface ValidationRecord {
  name?: string;
  command?: string;
  passed?: boolean;
  exit_code?: number;
  result?: string;
}

function didPass(v: ValidationRecord): boolean {
  if (v.passed === false) return false;
  if (typeof v.exit_code === 'number' && v.exit_code !== 0) return false;
  return v.passed === true || v.exit_code === 0 || /^pass/i.test(v.result ?? '');
}

const CODE_KINDS: Array<[string, RegExp]> = [
  ['TypeScript', /type ?script|typecheck|\btsc\b/i],
  ['Lint', /lint/i],
  ['Build', /\bbuild\b/i],
  ['Tests', /\btests?\b|vitest|jest|pytest/i],
];

const TERRAFORM_KINDS: Array<[string, RegExp]> = [
  ['terraform validate', /terraform[ _-]?validate/i],
  ['terraform fmt', /terraform[ _-]?fmt|fmt -check/i],
  ['terraform plan', /terraform[ _-]?plan/i],
];

const NON_CODE_KINDS: Array<[string, RegExp]> = [
  ...TERRAFORM_KINDS,
  ['format', /prettier|format/i],
  ['lint', /lint/i],
  ['tests', /\btests?\b|vitest|jest|pytest/i],
  ['schema', /schema/i],
];

/** The kind of one record: from its name when the name says, else from its command. */
function kindOf(v: ValidationRecord, kinds: Array<[string, RegExp]>): string | null {
  for (const text of [v.name ?? '', v.command ?? '']) {
    const hit = kinds.find(([, re]) => re.test(text));
    if (hit) return hit[0];
  }
  return null;
}

export function evaluateValidations(
  records: ValidationRecord[],
  artifactsStr: string
): { ok: boolean; issue: string | null } {
  const passing = records.filter(didPass);
  if (isNonCodeTask(artifactsStr)) {
    const terraform = deliverablesOf(artifactsStr).some((p) => TERRAFORM_PATH.test(p));
    const kinds = new Set(
      passing
        .map((v) => kindOf(v, terraform ? TERRAFORM_KINDS : NON_CODE_KINDS))
        .filter((k): k is string => k !== null)
    );
    if (kinds.size >= 2) return { ok: true, issue: null };
    return {
      ok: false,
      issue: terraform
        ? `Only ${kinds.size}/2 passing terraform checks (Terraform deliverable: validate, fmt, plan)`
        : `Only ${kinds.size}/2 passing checks of its own kind (non-code task: e.g. prettier + schema)`,
    };
  }
  const kinds = new Set(passing.map((v) => kindOf(v, CODE_KINDS)));
  const missing = CODE_KINDS.map(([k]) => k).filter((k) => !kinds.has(k));
  return missing.length === 0
    ? { ok: true, issue: null }
    : {
        ok: false,
        issue: `Missing passing validations: ${missing.join(', ')} (need TypeScript, Tests, Lint, Build)`,
      };
}
