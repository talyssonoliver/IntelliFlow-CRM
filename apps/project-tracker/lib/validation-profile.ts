/**
 * How many recorded validations a Completed task's attestation needs.
 *
 * Code tasks need the four the repo makes non-negotiable: TypeScript, Tests,
 * Lint, Build. A task that tracks no source code at all (Terraform modules,
 * workflow YAML, planning docs) has no TypeScript to check or build, so it
 * needs its own checks instead, at least two of them (for Terraform:
 * `terraform validate` and `terraform fmt -check`). Owner ruling 2026-10-07.
 */

export const CODE_VALIDATIONS_REQUIRED = 4;
export const NON_CODE_VALIDATIONS_REQUIRED = 2;

const SOURCE_CODE = /\.(ts|tsx|js|jsx|mjs|cjs|py|prisma|sql)$/i;

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
    .filter((p) => p.includes('/') || p.includes('.'));
}

export function isNonCodeTask(artifactsStr: string): boolean {
  const paths = trackedPaths(artifactsStr);
  return paths.length > 0 && !paths.some((p) => SOURCE_CODE.test(p));
}

export function requiredValidations(artifactsStr: string): {
  count: number;
  label: string;
} {
  return isNonCodeTask(artifactsStr)
    ? {
        count: NON_CODE_VALIDATIONS_REQUIRED,
        label: 'non-code task: its own checks, e.g. terraform validate + fmt',
      }
    : { count: CODE_VALIDATIONS_REQUIRED, label: 'need TypeScript, Tests, Lint, Build' };
}
