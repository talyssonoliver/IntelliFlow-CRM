/**
 * Shared AST selectors for the no-eager-requiredProdEnv rule (defect D4).
 *
 * requiredProdEnv() must NEVER be called at module-init scope (top-level
 * VariableDeclaration, exported const initializer, or class PropertyDefinition
 * initializer). A single missing env var at that scope crashes the entire
 * process at import/boot time before any request is handled. Always call
 * requiredProdEnv() inside a function/factory so the throw is deferred until
 * the code path that actually needs the value is executed.
 *
 * Both eslint.config.mjs (root) and apps/web/eslint.config.mjs import this
 * array so the literal selectors + messages are defined exactly once (SonarCloud
 * duplication gate).
 */
export const noEagerRequiredProdEnvSelectors = [
  {
    // Case 1: module-level `const X = requiredProdEnv(...)` (not inside any
    // function). `Program > VariableDeclaration` selects only declarations
    // that are direct children of the module Program node.
    selector:
      'Program > VariableDeclaration > VariableDeclarator > CallExpression[callee.name="requiredProdEnv"]',
    message:
      'requiredProdEnv must be called inside a function/factory, never at ' +
      'module-init scope — a missing env var would crash the whole process at ' +
      'boot (defect D4). Wrap in a lazy memoized accessor instead.',
  },
  {
    // Case 2: `export const X = requiredProdEnv(...)` at module level.
    selector:
      'ExportNamedDeclaration > VariableDeclaration > VariableDeclarator > CallExpression[callee.name="requiredProdEnv"]',
    message:
      'requiredProdEnv must be called inside a function/factory, never at ' +
      'module-init scope — a missing env var would crash the whole process at ' +
      'boot (defect D4). Wrap in a lazy memoized accessor instead.',
  },
  {
    // Case 3: class field / static initializer `foo = requiredProdEnv(...)`.
    selector: 'PropertyDefinition > CallExpression[callee.name="requiredProdEnv"]',
    message:
      'requiredProdEnv must be called inside a function/factory, never at ' +
      'module-init scope — a missing env var would crash the whole process at ' +
      'boot (defect D4). Move the call into a method/accessor instead.',
  },
];

/**
 * Shared AST selectors for the timezone-safety rule.
 *
 * Exported separately so apps/web/eslint.config.mjs can spread them alongside
 * noEagerRequiredProdEnvSelectors in its D4 rule block (which must include both
 * sets because the D4 block targets the same files glob as the timezone-safety
 * block, so it overrides the earlier block's no-restricted-syntax value in ESLint
 * flat config).
 *
 * Severity is 'warn' in the timezone-safety standalone block; when combined with
 * the D4 'error' block the per-selector objects below carry their own implicit
 * severity from the outer 'error' — include these only as fallback for the web
 * config where both rule blocks share the same files glob.
 */
export const timezoneUnsafeSelectors = [
  {
    selector: "CallExpression[callee.property.name='toLocaleDateString'][arguments.length=0]",
    message:
      'Bare toLocaleDateString() uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatDate().',
  },
  {
    selector: "CallExpression[callee.property.name='toLocaleTimeString'][arguments.length=0]",
    message:
      'Bare toLocaleTimeString() uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatTime().',
  },
  {
    selector: "CallExpression[callee.property.name='toLocaleString'][arguments.length=0]",
    message:
      'Bare toLocaleString() on Date uses browser/server timezone. Pass locale and { timeZone } option, or use timezone-utils formatDateTime().',
  },
];
