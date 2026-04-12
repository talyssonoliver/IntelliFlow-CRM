# Integration Tests

This directory contains integration tests for IntelliFlow CRM. Integration tests
verify that multiple components work together correctly across the system.

## Overview

Integration tests differ from unit tests in that they:

- Test multiple components working together
- May interact with real databases, APIs, or services
- Test the integration points between modules
- Verify end-to-end workflows within the application layer

## Test Files

- `setup.ts` - Global setup and utilities for integration tests
- `api.test.ts` - API endpoint integration tests
- `db.test.ts` - Database integration tests

## Running Integration Tests

### Run all integration tests

```bash
pnpm run test:integration
```

### Run specific integration test file

```bash
pnpm run test:integration -- api.test
```

### Run with coverage

```bash
pnpm run test:integration -- --coverage
```

### Watch mode for development

```bash
pnpm run test:integration -- --watch
```

## Environment Variables

Integration tests require specific environment variables:

### Required

- `TEST_DATABASE_URL` - Connection string for test database (separate from
  production)

### Optional

- `TEST_API_URL` - Base URL for API tests (default: `http://localhost:3001`)
- `TEST_API_AVAILABLE` - Set to `'true'` to enable API tests
- `WAIT_FOR_SERVICES` - Set to `'true'` to wait for services to be ready
- `RESET_DB_BETWEEN_TESTS` - Set to `'true'` to reset database between each test

### Example `.env.test`

```env
NODE_ENV=test
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/intelliflow_test
TEST_API_URL=http://localhost:3001
TEST_API_AVAILABLE=true
WAIT_FOR_SERVICES=true
```

## Test Configuration

Integration tests are configured in the root `vitest.config.ts` with:

- Longer timeout (30 seconds) for service interactions
- Separate workspace named `'integration'`
- Setup file: `tests/integration/setup.ts`

## Writing Integration Tests

### Example: Testing an API endpoint

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApiClient } from './setup';

describe('Lead API Integration', () => {
  let apiClient: ReturnType<typeof createTestApiClient>;

  beforeAll(() => {
    apiClient = createTestApiClient();
  });

  it('should create a new lead', async () => {
    const response = await apiClient.post('/api/leads', {
      email: 'test@example.com',
      firstName: 'Test',
      lastName: 'User',
    });

    expect(response).toHaveProperty('id');
    expect(response.email).toBe('test@example.com');
  });
});
```

### Example: Testing database operations

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '@intelliflow/db';

describe('Lead Database Integration', () => {
  it('should enforce unique email constraint', async () => {
    const leadData = {
      email: 'unique@example.com',
      firstName: 'Test',
      lastName: 'User',
    };

    await prisma.lead.create({ data: leadData });

    await expect(prisma.lead.create({ data: leadData })).rejects.toThrow();
  });
});
```

## Best Practices

### 1. Test Isolation

- Each test should be independent
- Use `beforeEach` to reset state if needed
- Clean up test data in `afterEach`

### 2. Test Database

- Always use a separate test database
- Never run integration tests against production
- Use transactions for test isolation when possible

### 3. Conditional Tests

- Skip tests gracefully when services are unavailable
- Use environment variables to enable/disable test suites

```typescript
it('should test API endpoint', async () => {
  if (!process.env.TEST_API_AVAILABLE) {
    console.log('⏭️  Skipping - API not available');
    return;
  }

  // Test implementation
});
```

### 4. Performance

- Keep integration tests reasonably fast (< 30s per test)
- Use parallel execution where safe
- Mock external services when possible

### 5. Cleanup

- Always clean up resources (connections, files, etc.)
- Use `afterAll` hooks for global cleanup
- Handle cleanup failures gracefully

## Utilities

The `setup.ts` file provides helpful utilities:

### Database Utilities

- `setupTestDatabase()` - Initialize test database
- `teardownTestDatabase()` - Clean up test database
- `resetDatabaseState()` - Reset database between tests

### API Utilities

- `createTestApiClient()` - Create configured API client
- `waitForService(url)` - Wait for service to be ready

### Example Usage

```typescript
import { waitForService, createTestApiClient } from './setup';

beforeAll(async () => {
  await waitForService('http://localhost:3001/api/health');
  apiClient = createTestApiClient();
});
```

## CI/CD Integration

Integration tests run in CI when:

- Database is available (via Docker Compose or cloud service)
- Required environment variables are set
- Services are running and healthy

### GitHub Actions Example

```yaml
- name: Start test services
  run: docker-compose -f docker-compose.test.yml up -d

- name: Wait for services
  run: |
    export WAIT_FOR_SERVICES=true
    pnpm run test:integration
```

## Troubleshooting

### Tests are being skipped

- Ensure `TEST_DATABASE_URL` is set
- Check that `TEST_API_AVAILABLE=true` if testing API
- Verify services are running

### Timeout errors

- Increase timeout in `vitest.config.ts` if needed
- Check service health endpoints
- Verify network connectivity

### Database errors

- Ensure test database exists
- Run migrations: `pnpm run db:migrate`
- Check connection string format
- Verify database permissions

### Port conflicts

- Change `TEST_API_URL` to use different port
- Stop other services using the same ports
- Use Docker Compose to isolate services

## Related Documentation

- [Unit Tests](../README.md) - Unit testing guidelines
- [E2E Tests](../e2e/README.md) - End-to-end testing with Playwright
- [Testing Strategy](../../docs/testing/strategy.md) - Overall testing approach
- [Vitest Configuration](../../vitest.config.ts) - Test runner configuration

## Coverage Goals

Integration tests should help achieve:

- Overall coverage: >90%
- API routes: >85%
- Database operations: >85%
- Integration points: >90%

Run `pnpm run test:coverage` to see current coverage metrics.
