---
name: webapp-testing
description: Toolkit for testing IntelliFlow CRM web applications using Playwright. Supports verifying frontend functionality, debugging UI behavior, capturing browser screenshots, running E2E tests, and viewing browser logs. Configured for the IntelliFlow monorepo structure.
license: Complete terms in LICENSE.txt
---

# IntelliFlow CRM Web Application Testing

To test IntelliFlow CRM web applications, use Playwright with the project's existing test infrastructure.

## IntelliFlow Test Infrastructure

### Project Structure

```
intelliFlow-CRM/
├── tests/
│   └── e2e/                    # Playwright E2E tests
│       ├── global-setup.ts     # Test setup
│       └── *.spec.ts           # Test files
├── playwright.config.ts        # Playwright configuration
└── apps/
    ├── web/                    # Main CRM frontend (port 3000)
    ├── api/                    # tRPC API server (port 3001)
    └── project-tracker/        # Sprint tracker (port 3002)
```

### Running Tests

**Run all E2E tests:**
```bash
pnpm run test:e2e
```

**Run specific test file:**
```bash
pnpm exec playwright test tests/e2e/login.spec.ts
```

**Run with UI mode:**
```bash
pnpm exec playwright test --ui
```

**Run in headed mode (see browser):**
```bash
pnpm exec playwright test --headed
```

## Decision Tree: Choosing Your Approach

```
Task → Which app are you testing?
    ├─ apps/web (CRM Frontend)
    │   └─ Start: pnpm --filter web dev (port 3000)
    │
    ├─ apps/project-tracker (Sprint Tracker)
    │   └─ Start: pnpm --filter project-tracker dev (port 3002)
    │
    └─ Full stack test?
        └─ Start: pnpm run dev (starts all apps)
```

## Writing Tests for IntelliFlow

### Test File Location

Place tests in `tests/e2e/` following the naming convention:
- `login.spec.ts` - Authentication tests
- `leads.spec.ts` - Lead management tests
- `dashboard.spec.ts` - Dashboard tests

### Basic Test Template

```typescript
import { test, expect } from '@playwright/test';

test.describe('Lead Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/leads');
    await page.waitForLoadState('networkidle');
  });

  test('should display leads list', async ({ page }) => {
    await page.waitForSelector('[data-testid="leads-table"]');
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);
  });

  test('should create new lead', async ({ page }) => {
    await page.click('[data-testid="create-lead-btn"]');
    await page.fill('[name="name"]', 'Test Lead');
    await page.fill('[name="email"]', 'test@example.com');
    await page.click('[type="submit"]');
    await expect(page.locator('.toast-success')).toBeVisible();
  });
});
```

### Testing with Authentication

```typescript
test.describe('Authenticated Tests', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  test('should access dashboard', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });
});
```

## Debugging Tips

### Take Screenshots

```typescript
await page.screenshot({
  path: 'artifacts/playwright-output/debug.png',
  fullPage: true
});
```

### View Console Logs

```typescript
page.on('console', (msg) => {
  console.log(`Browser console: ${msg.type()}: ${msg.text()}`);
});
```

## Common Selectors for IntelliFlow

| Element | Selector |
|---------|----------|
| Lead table | `[data-testid="leads-table"]` |
| Contact card | `[data-testid="contact-card"]` |
| Deal pipeline | `[data-testid="pipeline-board"]` |
| Navigation | `nav` or `[role="navigation"]` |
| Modal | `[role="dialog"]` |
| Toast | `.toast` or `[role="alert"]` |
| Form submit | `[type="submit"]` |

## Best Practices

1. **Use data-testid attributes** for reliable selectors
2. **Wait for network idle** before assertions on dynamic content
3. **Use page.waitForSelector()** before interacting with elements
4. **Store auth state** to avoid logging in for every test
5. **Place screenshots** in `artifacts/playwright-output/`
6. **Run in CI** with `pnpm run test:e2e` (already configured)

## Reference Files

- **examples/** - Examples showing common patterns:
  - `element_discovery.py` - Discovering buttons, links, and inputs on a page
  - `static_html_automation.py` - Using file:// URLs for local HTML
  - `console_logging.py` - Capturing console logs during automation
