import { describe, it, expect } from 'vitest';
import { generateApiKey, maskApiKey } from '../api-key-generator';

describe('generateApiKey', () => {
  it('returns object with all required fields', () => {
    const result = generateApiKey({ name: 'Test Key', environment: 'production', scopes: ['read'] });
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('key');
    expect(result).toHaveProperty('maskedKey');
    expect(result).toHaveProperty('createdAt');
    expect(result).toHaveProperty('lastUsed');
    expect(result).toHaveProperty('scopes');
  });

  it('production key starts with ifc_live_ prefix', () => {
    const result = generateApiKey({ name: 'Prod Key', environment: 'production', scopes: ['read'] });
    expect(result.key).toMatch(/^ifc_live_/);
  });

  it('sandbox key starts with ifc_test_ prefix', () => {
    const result = generateApiKey({ name: 'Sandbox Key', environment: 'sandbox', scopes: ['read'] });
    expect(result.key).toMatch(/^ifc_test_/);
  });

  it('key is exactly 49 characters', () => {
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes: ['read'] });
    expect(result.key).toHaveLength(49);
  });

  it('key hex portion only contains [0-9a-f]', () => {
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes: ['read'] });
    const hex = result.key.replace(/^ifc_(?:live|test)_/, '');
    expect(hex).toMatch(/^[0-9a-f]{40}$/);
  });

  it('two generated keys are unique', () => {
    const key1 = generateApiKey({ name: 'Key 1', environment: 'production', scopes: ['read'] });
    const key2 = generateApiKey({ name: 'Key 2', environment: 'production', scopes: ['read'] });
    expect(key1.key).not.toBe(key2.key);
  });

  it('maskedKey shows prefix + bullets + last 4 chars', () => {
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes: ['read'] });
    expect(result.maskedKey).toMatch(/^ifc_live_•+[0-9a-f]{4}$/);
  });

  it('maskedKey never equals full key', () => {
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes: ['read'] });
    expect(result.maskedKey).not.toBe(result.key);
  });

  it('id is a valid UUID format', () => {
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes: ['read'] });
    expect(result.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('createdAt is a valid ISO 8601 timestamp', () => {
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes: ['read'] });
    expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
  });

  it('scopes matches input scopes', () => {
    const scopes: ('read' | 'write' | 'admin')[] = ['read', 'admin'];
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes });
    expect(result.scopes).toEqual(scopes);
  });

  it('name matches input name', () => {
    const result = generateApiKey({ name: 'My Custom Key', environment: 'production', scopes: ['read'] });
    expect(result.name).toBe('My Custom Key');
  });
});

describe('maskApiKey', () => {
  it('correctly masks a given key string', () => {
    const masked = maskApiKey('ifc_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
    expect(masked).toMatch(/^ifc_live_•+a1b2$/);
    expect(masked).not.toContain('a1b2c3d4e5f6');
  });

  it('handles short key gracefully', () => {
    const masked = maskApiKey('abcd');
    expect(masked).toBe('abcd');
  });

  it('handles empty string', () => {
    const masked = maskApiKey('');
    expect(masked).toBe('');
  });

  it('masks key without ifc_ prefix', () => {
    const masked = maskApiKey('some_random_api_key_12345678');
    expect(masked).toMatch(/^•+5678$/);
  });

  it('handles ifc_ prefix with short rest (<= 4 chars)', () => {
    const masked = maskApiKey('ifc_live_ab12');
    expect(masked).toBe('ifc_live_ab12');
  });

  it('lastUsed is null for new key', () => {
    const result = generateApiKey({ name: 'Test', environment: 'production', scopes: ['read'] });
    expect(result.lastUsed).toBeNull();
  });
});
