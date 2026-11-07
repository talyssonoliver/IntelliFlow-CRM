/**
 * test-quality — a local ESLint plugin for the test policy in #1216 (item 5).
 *
 * A test is worth keeping only if it fails when the behaviour it names breaks. These
 * rules flag the shapes that can't: a test with no assertion, an assertion that may
 * never run, a duplicate title, an early return, a file that never imports the product,
 * an assertion on a literal, and a test whose only check is `toBeDefined`.
 *
 * They are wired as warnings first (eslint.config.mjs, apps/web/eslint.config.mjs) so
 * the counts can be measured before any becomes an error. `pnpm run test-quality:report`
 * writes the counts per rule.
 */

const TEST_NAMES = new Set(['it', 'test']);
const SUITE_NAMES = new Set(['describe', 'suite']);
const ASSERTION_PREFIX = /^(expect|assert|should)/i;
const LONE_MATCHERS = new Set(['toBeDefined']);
const NEGATED_LONE_MATCHERS = new Set(['toBeUndefined']);
const CONDITIONAL_PARENTS = new Set([
  'IfStatement',
  'ConditionalExpression',
  'LogicalExpression',
  'CatchClause',
  'SwitchCase',
]);
const PRODUCT_SOURCE = /^(\.{1,2}\/|@\/|@intelliflow\/)/;
const NOT_PRODUCT_SOURCE = /^@intelliflow\/test-fixtures(\/|$)/;

/** The identifier a call chain starts from: `it`, `it.each(...)`, `test.skip`, `expect(x).not`. */
function rootName(node) {
  let current = node;
  for (;;) {
    if (!current) return null;
    if (current.type === 'Identifier') return current.name;
    if (current.type === 'CallExpression') current = current.callee;
    else if (current.type === 'MemberExpression') current = current.object;
    else return null;
  }
}

function isCallNamed(node, names) {
  return node.type === 'CallExpression' && names.has(rootName(node.callee));
}

/** `it(...)`, `test.only(...)`, `it.each(table)(...)`; not `it.todo`. */
function isTestCall(node) {
  if (!isCallNamed(node, TEST_NAMES)) return false;
  const callee = node.callee;
  return !(callee.type === 'MemberExpression' && callee.property.name === 'todo');
}

/** The test's body function: its last function argument. */
function testFunction(node) {
  for (let i = node.arguments.length - 1; i >= 0; i--) {
    const arg = node.arguments[i];
    if (arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') return arg;
  }
  return null;
}

/** A literal title, or null when it is computed. */
function staticTitle(node) {
  const first = node.arguments[0];
  if (!first) return null;
  if (first.type === 'Literal' && typeof first.value === 'string') return first.value;
  if (first.type === 'TemplateLiteral' && first.expressions.length === 0) {
    return first.quasis[0].value.cooked;
  }
  return null;
}

function isAssertionCall(node) {
  if (node.type !== 'CallExpression') return false;
  const name = rootName(node.callee);
  return name !== null && ASSERTION_PREFIX.test(name);
}

/** The test function a node sits in, if any, by walking its ancestors. */
function enclosingTestFunction(ancestors) {
  for (let i = ancestors.length - 1; i > 0; i--) {
    const parent = ancestors[i - 1];
    if (
      parent.type === 'CallExpression' &&
      isTestCall(parent) &&
      testFunction(parent) === ancestors[i]
    ) {
      return { index: i, fn: ancestors[i] };
    }
  }
  return null;
}

/** For `expect(x).not.toBeDefined()`: the matcher and whether it is negated. */
function matcherOf(node) {
  if (node.callee.type !== 'MemberExpression' || node.callee.property.type !== 'Identifier') {
    return null;
  }
  let negated = false;
  let object = node.callee.object;
  while (object.type === 'MemberExpression') {
    if (object.property.name === 'not') negated = true;
    object = object.object;
  }
  if (object.type !== 'CallExpression' || rootName(object.callee) !== 'expect') return null;
  return { name: node.callee.property.name, negated };
}

const meta = (description) => ({
  type: 'suggestion',
  docs: { description },
  schema: [],
  messages: { bad: description },
});

/** Every test makes at least one assertion. */
const expectExpect = {
  meta: meta('A test must assert something: call expect (or an assert/expect helper).'),
  create(context) {
    const frames = [];
    return {
      CallExpression(node) {
        if (isTestCall(node) && testFunction(node)) frames.push({ node, asserted: false });
        else if (frames.length > 0 && isAssertionCall(node)) frames.at(-1).asserted = true;
      },
      'CallExpression:exit'(node) {
        if (frames.length === 0 || frames.at(-1).node !== node) return;
        const frame = frames.pop();
        if (!frame.asserted) context.report({ node, messageId: 'bad' });
      },
    };
  },
};

/** No expect inside an if, a ternary, a && / ||, a switch case or a catch: it may never run. */
const noConditionalExpect = {
  meta: meta('An expect inside a condition or a catch may never run: assert unconditionally.'),
  create(context) {
    return {
      CallExpression(node) {
        if (rootName(node.callee) !== 'expect' || node.callee.type !== 'Identifier') return;
        const ancestors = context.sourceCode.getAncestors(node);
        const test = enclosingTestFunction(ancestors);
        if (!test) return;
        const between = ancestors.slice(test.index + 1);
        if (between.some((a) => CONDITIONAL_PARENTS.has(a.type))) {
          context.report({ node, messageId: 'bad' });
        }
      },
    };
  },
};

/** Two tests (or two suites) in the same block don't share a title. */
const noIdenticalTitle = {
  meta: meta('Two tests or suites in the same block have the same title.'),
  create(context) {
    const scopes = [{ tests: new Set(), suites: new Set() }];
    const check = (node, kind) => {
      const title = staticTitle(node);
      if (title === null) return;
      const seen = scopes.at(-1)[kind];
      if (seen.has(title)) context.report({ node: node.arguments[0], messageId: 'bad' });
      seen.add(title);
    };
    return {
      CallExpression(node) {
        if (isCallNamed(node, SUITE_NAMES) && node.callee.type !== 'CallExpression') {
          check(node, 'suites');
          scopes.push({ tests: new Set(), suites: new Set() });
        } else if (isTestCall(node) && node.callee.type !== 'CallExpression') {
          check(node, 'tests');
        }
      },
      'CallExpression:exit'(node) {
        if (isCallNamed(node, SUITE_NAMES) && node.callee.type !== 'CallExpression') scopes.pop();
      },
    };
  },
};

/** No return that leaves a test before its last statement: the assertions after it never run. */
const noEarlyReturnInTest = {
  meta: meta('A return in the middle of a test skips the assertions after it.'),
  create(context) {
    return {
      ReturnStatement(node) {
        const ancestors = context.sourceCode.getAncestors(node);
        const test = enclosingTestFunction(ancestors);
        if (!test) return;
        const between = ancestors.slice(test.index + 1);
        // A return inside a nested function belongs to that function, not the test.
        if (
          between.some(
            (a) => a.type.endsWith('FunctionExpression') || a.type === 'FunctionDeclaration'
          )
        ) {
          return;
        }
        const body = test.fn.body;
        const isLast = body.type === 'BlockStatement' && body.body.at(-1) === node;
        if (!isLast) context.report({ node, messageId: 'bad' });
      },
    };
  },
};

/** The file imports the product: a relative path, `@/…` or `@intelliflow/…`. */
const requireProductImport = {
  meta: meta('This test file imports nothing from the product, so it can only test itself.'),
  create(context) {
    let found = false;
    const consider = (source) => {
      if (
        typeof source === 'string' &&
        PRODUCT_SOURCE.test(source) &&
        !NOT_PRODUCT_SOURCE.test(source)
      ) {
        found = true;
      }
    };
    return {
      ImportDeclaration(node) {
        if (node.importKind !== 'type') consider(node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') consider(node.source.value);
      },
      'Program:exit'(node) {
        if (!found) context.report({ node, messageId: 'bad', loc: { line: 1, column: 0 } });
      },
    };
  },
};

/** expect(<literal>) asserts a constant, never the product. */
const noLiteralExpect = {
  meta: meta('expect() of a literal checks a constant, not the code.'),
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'expect') return;
        const arg = node.arguments[0];
        const literal =
          arg &&
          (arg.type === 'Literal' ||
            (arg.type === 'TemplateLiteral' && arg.expressions.length === 0));
        if (literal) context.report({ node, messageId: 'bad' });
      },
    };
  },
};

/** A test whose only checks are `toBeDefined` (or `not.toBeUndefined`) proves almost nothing. */
const noLoneToBeDefined = {
  meta: meta('This test only checks that something is defined: assert the value it should have.'),
  create(context) {
    const frames = [];
    return {
      CallExpression(node) {
        if (isTestCall(node) && testFunction(node)) {
          frames.push({ node, lone: 0, other: 0 });
          return;
        }
        if (frames.length === 0) return;
        const matcher = matcherOf(node);
        if (!matcher) return;
        const lone = matcher.negated
          ? NEGATED_LONE_MATCHERS.has(matcher.name)
          : LONE_MATCHERS.has(matcher.name);
        if (lone) frames.at(-1).lone++;
        else frames.at(-1).other++;
      },
      'CallExpression:exit'(node) {
        if (frames.length === 0 || frames.at(-1).node !== node) return;
        const frame = frames.pop();
        if (frame.lone > 0 && frame.other === 0) context.report({ node, messageId: 'bad' });
      },
    };
  },
};

export const testQualityRules = {
  'expect-expect': expectExpect,
  'no-conditional-expect': noConditionalExpect,
  'no-identical-title': noIdenticalTitle,
  'no-early-return-in-test': noEarlyReturnInTest,
  'require-product-import': requireProductImport,
  'no-literal-expect': noLiteralExpect,
  'no-lone-to-be-defined': noLoneToBeDefined,
};

const plugin = { meta: { name: 'test-quality' }, rules: testQualityRules };

/**
 * The rules at the level they start at: warnings, so the counts are measured first.
 * TEST_QUALITY_LINT=off turns them off for the pre-commit pass, which fails on any warning
 * (--max-warnings=0): a warning must not block a commit while the policy is in its warn phase.
 */
export const testQualityLevel = process.env.TEST_QUALITY_LINT === 'off' ? 'off' : 'warn';
export const testQualityWarnings = Object.fromEntries(
  Object.keys(testQualityRules).map((name) => [`test-quality/${name}`, testQualityLevel])
);

export default plugin;
