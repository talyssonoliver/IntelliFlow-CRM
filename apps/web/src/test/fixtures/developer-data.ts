/**
 * Developer app and API key fixture data for PG-039 Dev Apps.
 * Follows factory pattern from docs-data.ts.
 */

import type { ApiKey, ApiKeyScope } from '@/lib/developer/api-key-generator';
import type { DeveloperApp } from '@/lib/developer/demo-data';

export type { DeveloperApp } from '@/lib/developer/demo-data';

export function createMockApiKey(overrides?: Partial<ApiKey>): ApiKey {
  return {
    id: 'key-test-001',
    name: 'Test API Key',
    key: 'ifc_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
    maskedKey: 'ifc_live_••••••••••••••••••••••••••••••••••••a1b2',
    createdAt: '2026-01-15T10:00:00Z',
    lastUsed: null,
    scopes: ['read', 'write'],
    ...overrides,
  };
}

export function createMockDeveloperApp(overrides?: Partial<DeveloperApp>): DeveloperApp {
  return {
    id: 'app-test-001',
    name: 'Test App',
    description: 'A test developer application',
    clientId: 'cli_test_abc123',
    status: 'active',
    environment: 'production',
    createdAt: '2026-01-01T00:00:00Z',
    apiKeys: [],
    scopes: ['read'],
    ...overrides,
  };
}

export const mockApiKeys: ApiKey[] = [
  createMockApiKey({
    id: 'key-mock-001',
    name: 'Production Key',
    key: 'ifc_live_1234567890abcdef1234567890abcdef12345678',
    maskedKey: 'ifc_live_••••••••••••••••••••••••••••••••••••5678',
  }),
  createMockApiKey({
    id: 'key-mock-002',
    name: 'Sandbox Key',
    key: 'ifc_test_abcdef1234567890abcdef1234567890abcdef12',
    maskedKey: 'ifc_test_••••••••••••••••••••••••••••••••••••ef12',
  }),
];

export interface MockAppFormData {
  name: string;
  description: string;
  environment: 'production' | 'sandbox';
  scopes: ApiKeyScope[];
  webhookUrl: string;
}

export function createMockNewAppFormData(overrides?: Partial<MockAppFormData>): MockAppFormData {
  return {
    name: 'Test New App',
    description: 'A test application created via the form',
    environment: 'production',
    scopes: ['read'],
    webhookUrl: '',
    ...overrides,
  };
}

export interface MockAppEditFormData {
  name: string;
  description: string;
  scopes: ApiKeyScope[];
  webhookUrl: string;
}

export function createMockEditFormData(
  overrides?: Partial<MockAppEditFormData>
): MockAppEditFormData {
  return {
    name: 'Test App',
    description: 'A test developer application',
    scopes: ['read'],
    webhookUrl: '',
    ...overrides,
  };
}

export const mockDemoApps: DeveloperApp[] = [
  createMockDeveloperApp({
    id: 'app-001',
    name: 'IntelliFlow Dashboard',
    description: 'Main production dashboard application for CRM analytics and reporting',
    clientId: 'cli_prod_a1b2c3d4e5f6',
    status: 'active',
    environment: 'production',
    apiKeys: [mockApiKeys[0], mockApiKeys[1]],
    webhookUrl: 'https://dashboard.intelliflow.dev/webhooks',
    scopes: ['read', 'write'],
  }),
  createMockDeveloperApp({
    id: 'app-002',
    name: 'CRM Sandbox App',
    description: 'Testing environment for integration development and API experimentation',
    clientId: 'cli_test_x7y8z9w0v1u2',
    status: 'pending',
    environment: 'sandbox',
    apiKeys: [],
    scopes: ['read', 'write', 'admin'],
  }),
  createMockDeveloperApp({
    id: 'app-003',
    name: 'Legacy Connector',
    description: 'Deprecated integration bridge for legacy ERP system migration',
    clientId: 'cli_prod_m3n4o5p6q7r8',
    status: 'inactive',
    environment: 'production',
    apiKeys: [mockApiKeys[0]],
    webhookUrl: 'https://legacy.example.com/hook',
    scopes: ['read'],
  }),
];
