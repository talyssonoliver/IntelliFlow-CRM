import { describe, expect, it } from 'vitest';
import { isNonCodeTask, requiredValidations } from '../validation-profile';

describe('requiredValidations', () => {
  it('keeps the four validations for any task that tracks source code', () => {
    expect(
      requiredValidations(
        'ARTIFACT:infra/terraform/main.tf;ARTIFACT:apps/api/src/modules/x/x.router.ts'
      ).count
    ).toBe(4);
    expect(requiredValidations('ARTIFACT:packages/db/prisma/schema.prisma').count).toBe(4);
  });

  it('asks a Terraform-only task for its own two checks instead', () => {
    const r = requiredValidations(
      'ARTIFACT:infra/terraform/modules/railway/main.tf;ARTIFACT:infra/terraform/modules/vercel/main.tf'
    );
    expect(r.count).toBe(2);
    expect(r.label).toContain('terraform validate');
  });

  it('treats docs and workflow YAML as non-code', () => {
    expect(
      isNonCodeTask(
        'ARTIFACT:.github/workflows/build-images.yml;ARTIFACT:docs/operations/runbooks/railway-deploy.md'
      )
    ).toBe(true);
  });

  it('never relaxes a task with no tracked artifacts', () => {
    expect(requiredValidations('').count).toBe(4);
    expect(requiredValidations('-').count).toBe(4);
  });
});
