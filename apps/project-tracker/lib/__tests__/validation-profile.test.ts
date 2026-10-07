import { describe, expect, it } from 'vitest';
import { evaluateValidations, isNonCodeTask } from '../validation-profile';

const ok = (name: string, command = '') => ({ name, command, exit_code: 0, passed: true });
const FOUR = [ok('TypeScript'), ok('Tests'), ok('Lint'), ok('Build')];
const TF =
  'ARTIFACT:infra/terraform/modules/railway/main.tf;ARTIFACT:infra/terraform/modules/vercel/main.tf';

describe('isNonCodeTask', () => {
  it('treats Terraform, workflow YAML and docs as non-code', () => {
    expect(isNonCodeTask(TF)).toBe(true);
    expect(
      isNonCodeTask('ARTIFACT:.github/workflows/build-images.yml;ARTIFACT:docs/operations/x.md')
    ).toBe(true);
  });

  it('classes a code glob as code (review repro: apps/api/src/** needed only 2)', () => {
    expect(isNonCodeTask('ARTIFACT:apps/api/src/**')).toBe(false);
    expect(isNonCodeTask('ARTIFACT:packages/domain')).toBe(false);
    expect(isNonCodeTask('ARTIFACT:apps/web/public/logo.svg')).toBe(false);
  });

  it('never relaxes a task whose only reference is its own attestation (review repro)', () => {
    expect(
      isNonCodeTask('EVIDENCE:.specify/sprints/sprint-19/attestations/X/attestation.json')
    ).toBe(false);
  });

  it('never relaxes a task with no tracked paths', () => {
    expect(isNonCodeTask('')).toBe(false);
    expect(isNonCodeTask('-')).toBe(false);
  });
});

describe('evaluateValidations', () => {
  it('passes a code task with the four named, passing validations', () => {
    expect(evaluateValidations(FOUR, 'ARTIFACT:apps/api/src/router.ts').ok).toBe(true);
  });

  it('matches variant names and commands (Web App Typecheck, pnpm lint)', () => {
    const r = evaluateValidations(
      [
        ok('Web App Typecheck'),
        ok('Unit Tests (x)'),
        ok('', 'pnpm --filter web lint'),
        ok('API Package Build'),
      ],
      'ARTIFACT:apps/web/src/page.tsx'
    );
    expect(r.ok).toBe(true);
  });

  it('does not count four entries of the same kind as four validations', () => {
    const r = evaluateValidations(
      [ok('Tests a'), ok('Tests b'), ok('Tests c'), ok('Tests d')],
      'ARTIFACT:apps/api/src/x.ts'
    );
    expect(r.ok).toBe(false);
    expect(r.issue).toContain('TypeScript, Lint, Build');
  });

  it('does not count a failed run (review repro)', () => {
    const r = evaluateValidations(
      [...FOUR.slice(0, 3), { name: 'Build', command: 'pnpm build', exit_code: 1, passed: false }],
      'ARTIFACT:apps/api/src/x.ts'
    );
    expect(r.issue).toContain('Build');
  });

  it('asks a non-code task for two passing checks of its own kind', () => {
    expect(evaluateValidations([ok('terraform validate'), ok('terraform fmt')], TF).ok).toBe(true);
  });

  it('rejects two unrelated records on a non-code task (review repro)', () => {
    const r = evaluateValidations([ok('File Creation'), ok('Component Creation')], TF);
    expect(r.ok).toBe(false);
  });

  it('rejects two records of the same kind on a non-code task', () => {
    expect(evaluateValidations([ok('terraform validate'), ok('terraform_validate')], TF).ok).toBe(
      false
    );
  });
});
