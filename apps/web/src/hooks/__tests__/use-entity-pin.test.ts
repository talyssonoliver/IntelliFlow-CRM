import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInvalidate = vi.fn();
const mockMutate = vi.fn();
const mockQueryData = {
  items: [{ entityType: 'lead', entityId: 'l1', title: 'Lead 1', url: '/leads/l1' }],
};

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ home: { getPinnedItems: { invalidate: mockInvalidate } } }),
    home: {
      getPinnedItems: { useQuery: vi.fn(() => ({ data: mockQueryData, isLoading: false })) },
      pinItem: {
        useMutation: vi.fn((opts: any) => ({
          mutate: (...args: any[]) => {
            mockMutate(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        })),
      },
      unpinItem: {
        useMutation: vi.fn((opts: any) => ({
          mutate: (...args: any[]) => {
            mockMutate(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        })),
      },
    },
  },
}));

vi.mock('react', () => ({
  useCallback: vi.fn((fn: any) => fn),
  useMemo: vi.fn((fn: any) => fn()),
}));

vi.mock('@intelliflow/validators', () => ({ PinnableEntityType: {} }));

import { useEntityPin } from '../../hooks/use-entity-pin';

describe('useEntityPin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvalidate.mockClear();
    mockMutate.mockClear();
  });

  it('returns isPinned true when entity is pinned', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    expect(result.isPinned).toBe(true);
  });

  it('returns isPinned false when entity is not pinned', () => {
    const result = useEntityPin({
      entityType: 'contact' as any,
      entityId: 'c1',
      title: 'Contact 1',
      url: '/contacts/c1',
    });
    expect(result.isPinned).toBe(false);
  });

  it('returns isLoading false when not mutating', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    expect(result.isLoading).toBe(false);
  });

  it('provides togglePin function', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    expect(typeof result.togglePin).toBe('function');
  });

  it('provides pin function', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    expect(typeof result.pin).toBe('function');
  });

  it('provides unpin function', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    expect(typeof result.unpin).toBe('function');
  });

  it('pin does nothing when already pinned', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    result.pin();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('unpin calls mutation when pinned', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    result.unpin();
    expect(mockMutate).toHaveBeenCalled();
  });

  it('pin calls mutation when not pinned', () => {
    const result = useEntityPin({
      entityType: 'contact' as any,
      entityId: 'c1',
      title: 'Contact',
      url: '/c/c1',
    });
    result.pin();
    expect(mockMutate).toHaveBeenCalled();
  });

  it('unpin does nothing when not pinned', () => {
    const result = useEntityPin({
      entityType: 'contact' as any,
      entityId: 'c1',
      title: 'Contact',
      url: '/c/c1',
    });
    result.unpin();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('togglePin calls unpin when pinned', () => {
    const result = useEntityPin({
      entityType: 'lead' as any,
      entityId: 'l1',
      title: 'Lead 1',
      url: '/leads/l1',
    });
    result.togglePin();
    expect(mockMutate).toHaveBeenCalled();
  });

  it('togglePin calls pin when not pinned', () => {
    const result = useEntityPin({
      entityType: 'contact' as any,
      entityId: 'c1',
      title: 'Contact',
      url: '/c/c1',
    });
    result.togglePin();
    expect(mockMutate).toHaveBeenCalled();
  });
});
