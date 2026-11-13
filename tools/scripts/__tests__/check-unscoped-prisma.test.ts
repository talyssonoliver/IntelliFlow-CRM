import { describe, expect, it } from 'vitest';
import * as check from '../check-unscoped-prisma.mjs';

const { evaluate, findUses, isScannedFile, run } = check as {
  evaluate: (
    uses: Record<string, { line: number; kind: string }[]>,
    allowlist: Record<string, { max: number; reason: string }>
  ) => { failures: { file: string }[]; slack: { file: string }[] };
  findUses: (src: string) => { line: number; kind: 'service' | 'direct' }[];
  isScannedFile: (rel: string) => boolean;
  run: (argv: string[], io?: { log?: (s: string) => void; error?: (s: string) => void }) => number;
};

describe('isScannedFile', () => {
  it('scans routers and procedure files, not tests', () => {
    expect(isScannedFile('apps/api/src/modules/lead/lead.router.ts')).toBe(true);
    expect(isScannedFile('apps/api/src/modules/user/user-membership.procedures.ts')).toBe(true);
    expect(isScannedFile('apps/api/src/modules/lead/__tests__/lead.router.test.ts')).toBe(false);
    expect(isScannedFile('apps/api/src/modules/lead/lead.service.ts')).toBe(false);
  });
});

describe('findUses', () => {
  it('separates shared-service construction from direct queries', () => {
    const src = [
      'const log = getAuditLogger(ctx.prisma);',
      'const rbac = new RBACService(ctx.prisma);',
      'const rows = await ctx.prisma.lead.findMany({});',
      'const ok = await ctx.prismaWithTenant.lead.findMany({});',
    ].join('\n');
    expect(findUses(src)).toEqual([
      { line: 1, kind: 'service' },
      { line: 2, kind: 'service' },
      { line: 3, kind: 'direct' },
    ]);
  });

  it('counts building the tenant-scoped client as construction, not a query', () => {
    const src = [
      'const db = createTenantScopedPrisma(ctx.prisma, serviceTenantContext(tenantId));',
      'const n = await ctx.prisma.lead.count();',
    ].join('\n');
    expect(findUses(src)).toEqual([
      { line: 1, kind: 'service' },
      { line: 2, kind: 'direct' },
    ]);
  });

  it('ignores comments', () => {
    const src = [
      '// never use ctx.prisma here',
      '/* ctx.prisma.lead */',
      "const url = 'https://example.invalid/ctx';",
    ].join('\n');
    expect(findUses(src)).toEqual([]);
  });
});

describe('evaluate', () => {
  const uses = {
    'a.router.ts': [
      { line: 1, kind: 'direct' },
      { line: 2, kind: 'direct' },
    ],
    'b.router.ts': [{ line: 1, kind: 'service' }],
  };

  it('fails a file with direct uses that is not listed or exceeds its maximum', () => {
    expect(evaluate(uses, {}).failures.map((f) => f.file)).toEqual(['a.router.ts']);
    expect(
      evaluate(uses, { 'a.router.ts': { max: 1, reason: 'r' } }).failures.map((f) => f.file)
    ).toEqual(['a.router.ts']);
  });

  it('passes within the maximum and reports entries that allow too much', () => {
    const res = evaluate(uses, {
      'a.router.ts': { max: 3, reason: 'r' },
      'gone.router.ts': { max: 1, reason: 'r' },
    });
    expect(res.failures).toEqual([]);
    expect(res.slack.map((s) => s.file).sort()).toEqual(['a.router.ts', 'gone.router.ts']);
  });
});

describe('the repository', () => {
  it('has every unscoped ctx.prisma use in routers covered by the allowlist', () => {
    const errors: string[] = [];
    expect(run([], { log: () => undefined, error: (s) => errors.push(s) }), errors.join('\n')).toBe(
      0
    );
  });
});
