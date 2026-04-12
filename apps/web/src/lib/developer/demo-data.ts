/**
 * Shared demo data for Developer Apps (PG-039, PG-041, PG-042).
 * Extracted from app-list.tsx to avoid SSR/client component import conflicts.
 * This module is a pure data module — no React hooks or 'use client'.
 */

import { maskApiKey, type ApiKey, type ApiKeyScope } from '@/lib/developer/api-key-generator';

export type { ApiKey, ApiKeyScope } from '@/lib/developer/api-key-generator';

export interface DeveloperApp {
  id: string;
  name: string;
  description: string;
  clientId: string;
  status: 'active' | 'inactive' | 'pending';
  environment: 'production' | 'sandbox';
  createdAt: string;
  apiKeys: ApiKey[];
  webhookUrl?: string;
  scopes: ApiKeyScope[];
}

export const DEMO_APPS: DeveloperApp[] = [
  {
    id: 'app-001',
    name: 'IntelliFlow Dashboard',
    description: 'Main production dashboard application for CRM analytics and reporting',
    clientId: 'cli_prod_a1b2c3d4e5f6',
    status: 'active',
    environment: 'production',
    createdAt: '2026-01-15T10:00:00Z',
    apiKeys: [
      {
        id: 'key-001',
        name: 'Dashboard API Key',
        key: 'ifc_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2', // pragma: allowlist secret
        maskedKey: maskApiKey('ifc_live_a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'), // pragma: allowlist secret
        createdAt: '2026-01-15T10:05:00Z',
        lastUsed: '2026-02-22T14:30:00Z',
        scopes: ['read', 'write'],
      },
      {
        id: 'key-002',
        name: 'Analytics Key',
        key: 'ifc_live_f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5', // pragma: allowlist secret
        maskedKey: maskApiKey('ifc_live_f6e5d4c3b2a1f6e5d4c3b2a1f6e5d4c3b2a1f6e5'), // pragma: allowlist secret
        createdAt: '2026-02-01T08:00:00Z',
        lastUsed: '2026-02-23T09:15:00Z',
        scopes: ['read'],
      },
    ],
    webhookUrl: 'https://dashboard.intelliflow.dev/webhooks',
    scopes: ['read', 'write'],
  },
  {
    id: 'app-002',
    name: 'CRM Sandbox App',
    description: 'Testing environment for integration development and API experimentation',
    clientId: 'cli_test_x7y8z9w0v1u2',
    status: 'pending',
    environment: 'sandbox',
    createdAt: '2026-02-20T16:00:00Z',
    apiKeys: [],
    scopes: ['read', 'write', 'admin'],
  },
  {
    id: 'app-003',
    name: 'Legacy Connector',
    description: 'Deprecated integration bridge for legacy ERP system migration',
    clientId: 'cli_prod_m3n4o5p6q7r8',
    status: 'inactive',
    environment: 'production',
    createdAt: '2025-11-01T12:00:00Z',
    apiKeys: [
      {
        id: 'key-003',
        name: 'Legacy Bridge Key',
        key: 'ifc_live_1234567890abcdef1234567890abcdef12345678', // pragma: allowlist secret
        maskedKey: maskApiKey('ifc_live_1234567890abcdef1234567890abcdef12345678'), // pragma: allowlist secret
        createdAt: '2025-11-01T12:05:00Z',
        lastUsed: '2026-01-10T11:00:00Z',
        scopes: ['read'],
      },
    ],
    webhookUrl: 'https://legacy.example.com/hook',
    scopes: ['read'],
  },
];

export function findAppById(id: string): DeveloperApp | undefined {
  return DEMO_APPS.find((app) => app.id === id);
}
