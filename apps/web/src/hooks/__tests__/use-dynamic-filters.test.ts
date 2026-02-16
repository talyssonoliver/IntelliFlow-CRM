/**
 * Tests for use-dynamic-filters.ts
 *
 * Tests the exported utility functions (isValidUUID) and the internal
 * transformOptions / capitalizeWords functions via the hook output behavior.
 * The hooks themselves are heavily tRPC-dependent so we mock the API layer.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock React hooks
// ---------------------------------------------------------------------------
const mockUseMemo = vi.fn((fn: () => unknown) => fn());
const mockUseCallback = vi.fn((fn: unknown) => fn);

vi.mock('react', () => ({
  useMemo: (fn: () => unknown) => mockUseMemo(fn),
  useCallback: (fn: unknown) => mockUseCallback(fn),
}));

// ---------------------------------------------------------------------------
// Mock API (tRPC)
// ---------------------------------------------------------------------------
const mockUseQuery = vi.fn().mockReturnValue({
  data: undefined,
  isLoading: false,
  error: null,
});

vi.mock('@/lib/api', () => ({
  api: {
    contact: { filterOptions: { useQuery: (...args: unknown[]) => mockUseQuery(...args) } },
    lead: { filterOptions: { useQuery: (...args: unknown[]) => mockUseQuery(...args) } },
    ticket: { filterOptions: { useQuery: (...args: unknown[]) => mockUseQuery(...args) } },
  },
}));

// ---------------------------------------------------------------------------
// Mock shared FilterOption type
// ---------------------------------------------------------------------------
vi.mock('@/components/shared', () => ({
  FilterOption: {},
}));

// ---------------------------------------------------------------------------
// Mock filter-utils
// ---------------------------------------------------------------------------
vi.mock('@/lib/shared/filter-utils', () => ({
  formatLabel: (value: string) =>
    value
      .toLowerCase()
      .split('_')
      .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
}));

// Now import the module under test
import {
  isValidUUID,
  useContactFilterOptions,
  useLeadFilterOptions,
  useTicketFilterOptions,
  useFilterValidation,
} from '../use-dynamic-filters';

// ============================================================================
// isValidUUID
// ============================================================================
describe('isValidUUID', () => {
  it('returns true for a valid UUID v4', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('returns true for lowercase UUIDs', () => {
    expect(isValidUUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('returns true for uppercase UUIDs', () => {
    expect(isValidUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });

  it('returns true for mixed case UUIDs', () => {
    expect(isValidUUID('A1b2C3d4-E5f6-7890-AbCd-Ef1234567890')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(isValidUUID('')).toBe(false);
  });

  it('returns false for non-UUID string', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
  });

  it('returns false for string with wrong segment lengths', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-44665544000')).toBe(false); // last segment too short
  });

  it('returns false for string with wrong number of segments', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false);
  });

  it('returns false for UUID with spaces', () => {
    expect(isValidUUID(' 550e8400-e29b-41d4-a716-446655440000 ')).toBe(false);
  });

  it('returns false for UUID with braces', () => {
    expect(isValidUUID('{550e8400-e29b-41d4-a716-446655440000}')).toBe(false);
  });

  it('returns false for UUID with invalid hex chars', () => {
    expect(isValidUUID('550g8400-e29b-41d4-a716-446655440000')).toBe(false);
  });
});

// ============================================================================
// useContactFilterOptions
// ============================================================================
describe('useContactFilterOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it('returns empty arrays when no data', () => {
    const result = useContactFilterOptions();
    expect(result.statusOptions).toEqual([]);
    expect(result.departmentOptions).toEqual([]);
    expect(result.accountOptions).toEqual([]);
    expect(result.isLoading).toBe(false);
    expect(result.error).toBeNull();
  });

  it('passes filter state to query', () => {
    useContactFilterOptions({
      search: 'test',
      status: ['ACTIVE'],
      accountId: 'acc-1',
      department: 'Sales',
    });

    expect(mockUseQuery).toHaveBeenCalledWith(
      {
        search: 'test',
        status: ['ACTIVE'],
        accountId: 'acc-1',
        department: 'Sales',
      },
      expect.any(Object)
    );
  });

  it('passes undefined for empty search', () => {
    useContactFilterOptions({ search: '' });
    const [input] = mockUseQuery.mock.calls[0];
    expect(input.search).toBeUndefined();
  });

  it('passes undefined for empty status array', () => {
    useContactFilterOptions({ status: [] });
    const [input] = mockUseQuery.mock.calls[0];
    expect(input.status).toBeUndefined();
  });

  it('passes undefined for empty accountId', () => {
    useContactFilterOptions({ accountId: '' });
    const [input] = mockUseQuery.mock.calls[0];
    expect(input.accountId).toBeUndefined();
  });

  it('transforms status options with counts', () => {
    mockUseQuery.mockReturnValue({
      data: {
        statuses: [
          { value: 'ACTIVE', count: 10 },
          { value: 'INACTIVE', count: 5 },
        ],
      },
      isLoading: false,
      error: null,
    });

    const result = useContactFilterOptions();
    expect(result.statusOptions).toEqual([
      { value: 'ACTIVE', label: 'Active (10)' },
      { value: 'INACTIVE', label: 'Inactive (5)' },
    ]);
  });

  it('transforms department options with counts', () => {
    mockUseQuery.mockReturnValue({
      data: {
        departments: [{ value: 'ENGINEERING', count: 3 }],
      },
      isLoading: false,
      error: null,
    });

    const result = useContactFilterOptions();
    expect(result.departmentOptions).toEqual([{ value: 'ENGINEERING', label: 'Engineering (3)' }]);
  });

  it('uses custom label when provided in option', () => {
    mockUseQuery.mockReturnValue({
      data: {
        accounts: [{ value: 'acc-1', label: 'Acme Corp', count: 7 }],
      },
      isLoading: false,
      error: null,
    });

    const result = useContactFilterOptions();
    expect(result.accountOptions).toEqual([{ value: 'acc-1', label: 'Acme Corp (7)' }]);
  });

  it('reflects loading state', () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    const result = useContactFilterOptions();
    expect(result.isLoading).toBe(true);
  });

  it('reflects error state', () => {
    const error = new Error('API error');
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error,
    });

    const result = useContactFilterOptions();
    expect(result.error).toBe(error);
  });

  it('respects custom config', () => {
    useContactFilterOptions(undefined, {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    });

    expect(mockUseQuery).toHaveBeenCalledWith(undefined, {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    });
  });

  it('calls useQuery with undefined when no filters provided', () => {
    useContactFilterOptions();
    const [input] = mockUseQuery.mock.calls[0];
    expect(input).toBeUndefined();
  });
});

// ============================================================================
// useLeadFilterOptions
// ============================================================================
describe('useLeadFilterOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it('returns empty arrays when no data', () => {
    const result = useLeadFilterOptions();
    expect(result.statusOptions).toEqual([]);
    expect(result.sourceOptions).toEqual([]);
    expect(result.ownerOptions).toEqual([]);
  });

  it('passes filter state to query', () => {
    useLeadFilterOptions({
      search: 'test',
      status: ['NEW', 'QUALIFIED'],
      source: ['WEBSITE'],
      ownerId: 'user-1',
    });

    expect(mockUseQuery).toHaveBeenCalledWith(
      {
        search: 'test',
        status: ['NEW', 'QUALIFIED'],
        source: ['WEBSITE'],
        ownerId: 'user-1',
      },
      expect.any(Object)
    );
  });

  it('passes undefined for empty arrays', () => {
    useLeadFilterOptions({ status: [], source: [] });
    const [input] = mockUseQuery.mock.calls[0];
    expect(input.status).toBeUndefined();
    expect(input.source).toBeUndefined();
  });

  it('transforms status options', () => {
    mockUseQuery.mockReturnValue({
      data: {
        statuses: [{ value: 'NEW', count: 20 }],
        sources: [],
        owners: [],
      },
      isLoading: false,
      error: null,
    });

    const result = useLeadFilterOptions();
    expect(result.statusOptions).toEqual([{ value: 'NEW', label: 'New (20)' }]);
  });

  it('transforms source options', () => {
    mockUseQuery.mockReturnValue({
      data: {
        statuses: [],
        sources: [{ value: 'COLD_CALL', count: 8 }],
        owners: [],
      },
      isLoading: false,
      error: null,
    });

    const result = useLeadFilterOptions();
    expect(result.sourceOptions).toEqual([{ value: 'COLD_CALL', label: 'Cold Call (8)' }]);
  });

  it('transforms owner options with custom label', () => {
    mockUseQuery.mockReturnValue({
      data: {
        statuses: [],
        sources: [],
        owners: [{ value: 'user-1', label: 'John Doe', count: 12 }],
      },
      isLoading: false,
      error: null,
    });

    const result = useLeadFilterOptions();
    expect(result.ownerOptions).toEqual([{ value: 'user-1', label: 'John Doe (12)' }]);
  });
});

// ============================================================================
// useTicketFilterOptions
// ============================================================================
describe('useTicketFilterOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
  });

  it('returns empty arrays when no data', () => {
    const result = useTicketFilterOptions();
    expect(result.statusOptions).toEqual([]);
    expect(result.priorityOptions).toEqual([]);
    expect(result.slaStatusOptions).toEqual([]);
  });

  it('passes filter state to query', () => {
    useTicketFilterOptions({
      search: 'bug',
      status: 'OPEN',
      priority: 'HIGH',
      slaStatus: 'AT_RISK',
      assigneeId: 'user-1',
    });

    expect(mockUseQuery).toHaveBeenCalledWith(
      {
        search: 'bug',
        status: 'OPEN',
        priority: 'HIGH',
        slaStatus: 'AT_RISK',
        assigneeId: 'user-1',
      },
      expect.any(Object)
    );
  });

  it('passes undefined for empty strings', () => {
    useTicketFilterOptions({
      search: '',
      status: '',
      priority: '',
      slaStatus: '',
      assigneeId: '',
    });
    const [input] = mockUseQuery.mock.calls[0];
    expect(input.search).toBeUndefined();
    expect(input.status).toBeUndefined();
    expect(input.priority).toBeUndefined();
    expect(input.slaStatus).toBeUndefined();
    expect(input.assigneeId).toBeUndefined();
  });

  it('transforms status options', () => {
    mockUseQuery.mockReturnValue({
      data: {
        statuses: [{ value: 'IN_PROGRESS', count: 15 }],
      },
      isLoading: false,
      error: null,
    });

    const result = useTicketFilterOptions();
    expect(result.statusOptions).toEqual([{ value: 'IN_PROGRESS', label: 'In Progress (15)' }]);
  });

  it('transforms priority options', () => {
    mockUseQuery.mockReturnValue({
      data: {
        priorities: [
          { value: 'HIGH', count: 3 },
          { value: 'LOW', count: 10 },
        ],
      },
      isLoading: false,
      error: null,
    });

    const result = useTicketFilterOptions();
    expect(result.priorityOptions).toEqual([
      { value: 'HIGH', label: 'High (3)' },
      { value: 'LOW', label: 'Low (10)' },
    ]);
  });

  it('transforms SLA status options', () => {
    mockUseQuery.mockReturnValue({
      data: {
        slaStatuses: [{ value: 'AT_RISK', count: 2 }],
      },
      isLoading: false,
      error: null,
    });

    const result = useTicketFilterOptions();
    expect(result.slaStatusOptions).toEqual([{ value: 'AT_RISK', label: 'At Risk (2)' }]);
  });
});

// ============================================================================
// useFilterValidation
// ============================================================================
describe('useFilterValidation', () => {
  it('returns a validation function', () => {
    const validator = useFilterValidation([]);
    expect(typeof validator).toBe('function');
  });

  it('returns true for empty value', () => {
    const validator = useFilterValidation([{ value: 'ACTIVE', label: 'Active' }]);
    expect(validator('')).toBe(true);
  });

  it('returns true when options are empty (still loading)', () => {
    const validator = useFilterValidation([]);
    expect(validator('ACTIVE')).toBe(true);
  });

  it('returns true when value is in options', () => {
    const validator = useFilterValidation([
      { value: 'ACTIVE', label: 'Active' },
      { value: 'INACTIVE', label: 'Inactive' },
    ]);
    expect(validator('ACTIVE')).toBe(true);
    expect(validator('INACTIVE')).toBe(true);
  });

  it('returns false when value is not in options', () => {
    const validator = useFilterValidation([{ value: 'ACTIVE', label: 'Active' }]);
    expect(validator('DELETED')).toBe(false);
  });

  it('is case-sensitive', () => {
    const validator = useFilterValidation([{ value: 'ACTIVE', label: 'Active' }]);
    expect(validator('active')).toBe(false);
  });
});
