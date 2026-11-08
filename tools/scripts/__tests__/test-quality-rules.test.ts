/**
 * The test-quality ESLint rules (#1216 item 5), each with code it must leave alone and code
 * it must flag. Parsed as TypeScript, as the repo's test files are.
 */
import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import {
  levelFor,
  maxWarningsFrom,
  testQualityLevel,
  testQualityRules,
  testQualityWarnings,
} from '../../../eslint-rules/test-quality.mjs';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
});

const bad = (code: string, errors = 1) => ({
  code,
  errors: Array.from({ length: errors }, () => ({ messageId: 'bad' })),
});

describe('test-quality rules', () => {
  it('are all wired at one level: warnings, or off for the pre-commit pass', () => {
    const names = Object.keys(testQualityRules).map((n) => `test-quality/${n}`);
    expect(Object.keys(testQualityWarnings).sort()).toEqual(names.sort());
    expect(new Set(Object.values(testQualityWarnings))).toEqual(new Set([testQualityLevel]));
    expect(testQualityLevel).toBe(levelFor(process.env, process.argv));
  });
});

describe('maxWarningsFrom', () => {
  it.each([
    [['eslint', '--max-warnings=0', '.'], 0],
    [['eslint', '--max-warnings', '0', '.'], 0],
    [['eslint', '--max-warnings=5'], 5],
    [['eslint', '.'], null],
  ])('reads %j as %s', (argv, n) => {
    expect(maxWarningsFrom(argv)).toBe(n);
  });
});

describe('levelFor', () => {
  it('warns in an ordinary lint run', () => {
    expect(levelFor({}, ['eslint', '.'])).toBe('warn');
  });

  it('is off in a run that fails on any warning, such as system-audit', () => {
    expect(levelFor({}, ['eslint', '--max-warnings=0', '.'])).toBe('off');
    expect(levelFor({}, ['eslint', '--max-warnings', '0'])).toBe('off');
  });

  it('still warns when some warnings are allowed', () => {
    expect(levelFor({}, ['eslint', '--max-warnings=10'])).toBe('warn');
  });

  it('is off when TEST_QUALITY_LINT=off', () => {
    expect(levelFor({ TEST_QUALITY_LINT: 'off' }, ['eslint', '.'])).toBe('off');
  });
});

tester.run('expect-expect', testQualityRules['expect-expect'], {
  valid: [
    `it('adds', () => { expect(add(1, 2)).toBe(3); });`,
    `test('helper asserts', async () => { await expectSaved(row); });`,
    `it.each([1, 2])('n %s', (n) => { expect(double(n)).toBe(n * 2); });`,
    `it('nested helper', () => { const check = () => expect(f()).toBe(1); check(); });`,
    `it.todo('later');`,
  ],
  invalid: [
    bad(`it('does nothing', () => { add(1, 2); });`),
    bad(`test.only('renders', async () => { render(a); });`),
    bad(`it.each([1])('n %s', (n) => { double(n); });`),
  ],
});

tester.run('no-conditional-expect', testQualityRules['no-conditional-expect'], {
  valid: [
    `it('a', () => { expect(f()).toBe(1); });`,
    `it('rejects', async () => { await expect(g()).rejects.toThrow('x'); });`,
  ],
  invalid: [
    bad(`it('a', () => { if (x) { expect(f()).toBe(1); } });`),
    bad(`it('b', () => { x ? expect(f()).toBe(1) : null; });`),
    bad(`it('c', () => { x && expect(f()).toBe(1); });`),
    bad(`it('d', async () => { try { await g(); } catch (e) { expect(e).toBeTruthy(); } });`),
  ],
});

tester.run('no-identical-title', testQualityRules['no-identical-title'], {
  valid: [
    `describe('a', () => { it('x', () => {}); it('y', () => {}); });`,
    `describe('a', () => { it('x', () => {}); }); describe('b', () => { it('x', () => {}); });`,
    `it.each([1, 2])('n %s', () => {});`,
  ],
  invalid: [
    bad(`describe('a', () => { it('x', () => {}); it('x', () => {}); });`),
    bad(`describe('s', () => {}); describe('s', () => {});`),
    bad('it(`same`, () => {}); it("same", () => {});'),
  ],
});

tester.run('no-early-return-in-test', testQualityRules['no-early-return-in-test'], {
  valid: [
    `it('a', () => { expect(f()).toBe(1); });`,
    `it('returns its promise', () => { return expect(g()).resolves.toBe(1); });`,
    `it('helper returns', () => { const pick = (x) => { if (x) return 1; return 2; }; expect(pick(1)).toBe(1); });`,
  ],
  invalid: [
    bad(`it('a', () => { if (!ready) return; expect(f()).toBe(1); });`),
    bad(`it('b', () => { return; expect(f()).toBe(1); });`),
  ],
});

tester.run('require-product-import', testQualityRules['require-product-import'], {
  valid: [
    `import { add } from '../add'; it('a', () => { expect(add(1, 1)).toBe(2); });`,
    `import { x } from '@/lib/x';`,
    `import { y } from '@intelliflow/domain';`,
    `const m = await import('./thing');`,
  ],
  invalid: [
    bad(
      `import { describe, it, expect } from 'vitest'; it('a', () => { expect(1 + 1).toBe(2); });`
    ),
    bad(`import { tenant } from '@intelliflow/test-fixtures';`),
    bad(`import type { Lead } from '../lead';`),
  ],
});

tester.run('no-literal-expect', testQualityRules['no-literal-expect'], {
  valid: [`expect(add(1, 2)).toBe(3);`, 'expect(`${a}`).toBe("x");'],
  invalid: [
    bad(`expect(true).toBe(true);`),
    bad(`expect('a').toBe('a');`),
    bad('expect(`x`).toBe("x");'),
  ],
});

tester.run('no-lone-to-be-defined', testQualityRules['no-lone-to-be-defined'], {
  valid: [
    `it('a', () => { expect(f()).toBeDefined(); expect(f().id).toBe('1'); });`,
    `it('b', () => { expect(f()).toEqual({ id: '1' }); });`,
    `it('c', () => { expect(f()).not.toBeDefined(); });`,
  ],
  invalid: [
    bad(`it('a', () => { expect(f()).toBeDefined(); });`),
    bad(`it('b', () => { expect(f()).toBeDefined(); expect(g()).not.toBeUndefined(); });`),
  ],
});
