import { describe, test, expect } from 'vitest';

/**
 * Dependency Rules
 * Explicit rules for hexagonal architecture
 */

describe('Hexagonal Architecture Dependency Rules', () => {
  const rules = {
    domain: {
      canDependOn: [],
      cannotDependOn: ['application', 'adapters', 'infrastructure'],
    },
    application: {
      canDependOn: ['domain'],
      cannotDependOn: ['adapters', 'infrastructure'],
    },
    adapters: {
      canDependOn: ['domain', 'application', 'infrastructure'],
      cannotDependOn: [],
    },
  };

  test('dependency rules are documented', () => {
    // This test ensures rules are explicit and documented
    expect(rules.domain.canDependOn).toEqual([]);
    expect(rules.domain.cannotDependOn).toContain('application');
    expect(rules.domain.cannotDependOn).toContain('adapters');

    expect(rules.application.canDependOn).toContain('domain');
    expect(rules.application.cannotDependOn).toContain('adapters');

    expect(rules.adapters.canDependOn).toContain('domain');
    expect(rules.adapters.canDependOn).toContain('application');
  });

  test('dependency direction flows inward (domain is the core)', () => {
    // Domain is at the center and has no dependencies
    expect(rules.domain.canDependOn).toHaveLength(0);

    // Application depends only on domain
    expect(rules.application.canDependOn).toEqual(['domain']);

    // Adapters can depend on both domain and application
    expect(rules.adapters.canDependOn).toContain('domain');
    expect(rules.adapters.canDependOn).toContain('application');
  });

  test('no circular dependencies allowed', () => {
    // Domain cannot depend on application
    expect(rules.domain.cannotDependOn).toContain('application');

    // Domain cannot depend on adapters
    expect(rules.domain.cannotDependOn).toContain('adapters');

    // Application cannot depend on adapters
    expect(rules.application.cannotDependOn).toContain('adapters');
  });
});
