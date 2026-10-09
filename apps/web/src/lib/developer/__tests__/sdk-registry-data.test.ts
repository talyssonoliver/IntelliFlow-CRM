import { describe, it, expect } from 'vitest';
import sdkRegistryJson from '@/data/sdk-registry.json';
import { SDK_REGISTRY, parseSdkRegistry } from '../sdk-downloads';

/** The SDK list lives in data/sdk-registry.json; this pins the load-time check. */
describe('sdk-registry.json', () => {
  const valid = {
    id: 'ts',
    name: 'TypeScript SDK',
    language: 'typescript',
    version: '0.1.0',
    packageName: '@intelliflow/api-client',
    description: 'D',
    status: 'beta',
    installCommands: { npm: 'npm i x', pnpm: 'pnpm add x', yarn: 'yarn add x' },
  };

  it('loads every shipped SDK', () => {
    expect(SDK_REGISTRY).toHaveLength((sdkRegistryJson as unknown[]).length);
    expect(parseSdkRegistry([valid])).toHaveLength(1);
  });

  it.each([
    ['an unknown status', { ...valid, status: 'ga' }],
    ['a missing install command', { ...valid, installCommands: { npm: 'x', pnpm: 'y' } }],
    ['a missing field', { ...valid, version: undefined }],
  ])('rejects %s', (_label, entry) => {
    expect(() => parseSdkRegistry([entry])).toThrow(
      'data/sdk-registry.json: entry 0 does not match its type'
    );
  });
});
