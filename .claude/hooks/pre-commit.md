# Pre-Commit Hook

Validates code quality before allowing commits.

## Trigger
Runs automatically before `git commit`

## Checks Performed

1. **TypeScript Compilation**
   ```bash
   pnpm run typecheck
   ```
   - Ensures no type errors
   - Validates strict mode compliance

2. **Linting**
   ```bash
   pnpm run lint
   ```
   - ESLint rules validation
   - Security rule checks

3. **Formatting**
   ```bash
   pnpm run format --check
   ```
   - Prettier formatting validation

4. **Affected Tests**
   ```bash
   turbo run test --filter=[HEAD^1]
   ```
   - Runs tests for changed packages only

5. **Secrets Scan**
   ```bash
   git secrets --scan
   ```
   - Prevents committing secrets

## Configuration

Located in `.husky/pre-commit`:

```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run staged files through lint-staged
pnpm exec lint-staged

# Type check
pnpm run typecheck

# Scan for secrets
git secrets --scan
```

## Bypass (Emergency Only)
```bash
git commit --no-verify -m "emergency: <reason>"
```

Note: Bypassing requires approval and must be documented.
