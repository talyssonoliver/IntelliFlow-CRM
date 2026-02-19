import { vi } from 'vitest';
import type {
  DocumentRecord,
  DocumentVersion,
  AccessControlEntry,
  DocumentFilters,
  DocumentStatus,
  AccessLevel,
} from '../types';

// =============================================================================
// Mock Factories
// =============================================================================

let docCounter = 0;
let versionCounter = 0;
let aclCounter = 0;

export function createDocumentFactory(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  docCounter++;
  return {
    id: `doc-${docCounter}`,
    metadata: {
      title: `Document ${docCounter}`,
      description: `Description for document ${docCounter}`,
      documentType: 'CONTRACT',
    },
    status: 'DRAFT' as DocumentStatus,
    classification: 'INTERNAL',
    version: { major: 1, minor: 0, patch: 0 },
    mimeType: 'application/pdf',
    sizeBytes: 1048576,
    createdAt: '2026-01-15T10:30:00Z',
    createdBy: 'user-1',
    tags: ['Legal'],
    ...overrides,
  };
}

export function createVersionFactory(overrides: Partial<DocumentVersion> = {}): DocumentVersion {
  versionCounter++;
  return {
    id: `ver-${versionCounter}`,
    versionNumber: `1.${versionCounter}.0`,
    changeType: 'minor',
    createdAt: `2026-01-${String(versionCounter).padStart(2, '0')}T10:00:00Z`,
    createdBy: `User ${versionCounter}`,
    sizeBytes: 1048576 + versionCounter * 1024,
    changelog: `Changes in version 1.${versionCounter}.0`,
    ...overrides,
  };
}

export function createACLEntryFactory(overrides: Partial<AccessControlEntry> = {}): AccessControlEntry {
  aclCounter++;
  return {
    userId: `user-${aclCounter}`,
    userName: `User ${aclCounter}`,
    email: `user${aclCounter}@example.com`,
    accessLevel: 'VIEW' as AccessLevel,
    grantedAt: '2026-01-15T10:30:00Z',
    grantedBy: 'admin-1',
    ...overrides,
  };
}

export function resetFactories() {
  docCounter = 0;
  versionCounter = 0;
  aclCounter = 0;
}

// =============================================================================
// tRPC Mock Helpers
// =============================================================================

export function createMockQueryResult<T>(data: T, options: { isLoading?: boolean; error?: Error | null } = {}) {
  return {
    data,
    isLoading: options.isLoading ?? false,
    error: options.error ?? null,
    isError: !!options.error,
    isFetching: false,
    isSuccess: !options.error && !options.isLoading,
    refetch: vi.fn(),
  };
}

export function createMockMutationResult(options: { isLoading?: boolean } = {}) {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isLoading: options.isLoading ?? false,
    isPending: options.isLoading ?? false,
    isError: false,
    error: null,
    reset: vi.fn(),
  };
}

// =============================================================================
// Common Mock Setup
// =============================================================================

export const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

export const mockAuth = {
  user: { id: 'user-1', email: 'test@example.com', name: 'Test User', role: 'admin' },
  isLoading: false,
  isAuthenticated: true,
};

export function createDefaultFilters(): DocumentFilters {
  return {};
}
