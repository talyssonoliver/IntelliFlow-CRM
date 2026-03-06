import { describe, it, expect } from 'vitest';
import { SDK_REGISTRY, getInstallCommand, getSdkByLanguage } from '../sdk-downloads';

describe('sdk-downloads', () => {
  describe('SDK_REGISTRY', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(SDK_REGISTRY)).toBe(true);
      expect(SDK_REGISTRY.length).toBeGreaterThan(0);
    });

    it('each entry has required fields (id, name, version, packageName, status)', () => {
      for (const sdk of SDK_REGISTRY) {
        expect(sdk).toHaveProperty('id');
        expect(sdk).toHaveProperty('name');
        expect(sdk).toHaveProperty('version');
        expect(sdk).toHaveProperty('packageName');
        expect(sdk).toHaveProperty('status');
        expect(typeof sdk.id).toBe('string');
        expect(typeof sdk.name).toBe('string');
        expect(typeof sdk.version).toBe('string');
        expect(typeof sdk.packageName).toBe('string');
        expect(['stable', 'beta', 'coming-soon']).toContain(sdk.status);
      }
    });
  });

  describe('getInstallCommand', () => {
    it('returns correct npm command', () => {
      const result = getInstallCommand('@intelliflow/api-client', 'npm');
      expect(result).toBe('npm install @intelliflow/api-client');
    });

    it('returns correct pnpm command', () => {
      const result = getInstallCommand('@intelliflow/api-client', 'pnpm');
      expect(result).toBe('pnpm add @intelliflow/api-client');
    });

    it('returns correct yarn command', () => {
      const result = getInstallCommand('@intelliflow/api-client', 'yarn');
      expect(result).toBe('yarn add @intelliflow/api-client');
    });
  });

  describe('getSdkByLanguage', () => {
    it("returns correct entry for 'typescript'", () => {
      const sdk = getSdkByLanguage('typescript');
      expect(sdk).toBeDefined();
      expect(sdk!.language).toBe('typescript');
      expect(sdk!.packageName).toBe('@intelliflow/api-client');
    });

    it('returns undefined for unknown language', () => {
      const sdk = getSdkByLanguage('unknown');
      expect(sdk).toBeUndefined();
    });
  });
});
