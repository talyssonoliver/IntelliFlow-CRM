/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getAccessTokenMock = vi.fn();
const createCallerFromTokenMock = vi.fn();
const fetchHelpArticlesFirstPageMock = vi.fn();

vi.mock('@/lib/trpc-server', () => ({
  getAccessToken: () => getAccessTokenMock(),
  createCallerFromToken: (token: string | null) => createCallerFromTokenMock(token),
}));

vi.mock('@/lib/cached-queries/help-article-queries', () => ({
  fetchHelpArticlesFirstPage: (token: string | null) => fetchHelpArticlesFirstPageMock(token),
}));

vi.mock('@/lib/shared/serialize-for-client', () => ({
  serializeForClient: <T,>(value: T) => value,
}));

// Named function components so React elements carry predictable `type.name`.
vi.mock('@/components/support/article-admin-list', () => ({
  ArticleAdminList: function ArticleAdminList() {
    return null;
  },
  ForbiddenSurface: function ForbiddenSurface() {
    return null;
  },
}));

function makeCaller(role: string) {
  return {
    user: {
      getProfile: vi.fn().mockResolvedValue({
        role,
        email: 'x@test.com',
        name: 'x',
        timezone: 'UTC',
        locale: 'en-GB',
      }),
    },
  };
}

beforeEach(() => {
  getAccessTokenMock.mockReset();
  createCallerFromTokenMock.mockReset();
  fetchHelpArticlesFirstPageMock.mockReset();
});

describe('HelpArticleAdminListPage', () => {
  it('exports a default server component and Metadata with the admin title', async () => {
    const mod = await import('../page');
    expect(typeof mod.default).toBe('function');
    expect(mod.metadata).toBeDefined();
    expect(mod.metadata.title).toBe('Help Articles — Admin');
  });

  it('renders ArticleAdminList for ADMIN role with initialData from the prefetch', async () => {
    getAccessTokenMock.mockResolvedValue('tok-admin');
    createCallerFromTokenMock.mockResolvedValue(makeCaller('ADMIN'));
    const prefetched = { items: [{ id: 'a1' }], total: 1, page: 1, limit: 20, hasMore: false };
    fetchHelpArticlesFirstPageMock.mockResolvedValue(prefetched);

    const mod = await import('../page');
    const result = (await mod.default()) as {
      type: { name: string };
      props: { initialData: unknown; role: string };
    };

    expect(result.type.name).toBe('ArticleAdminList');
    expect(result.props.role).toBe('ADMIN');
    expect(result.props.initialData).toEqual(prefetched);
    expect(fetchHelpArticlesFirstPageMock).toHaveBeenCalledWith('tok-admin');
  });

  it('renders ArticleAdminList for MANAGER role', async () => {
    getAccessTokenMock.mockResolvedValue('tok-mgr');
    createCallerFromTokenMock.mockResolvedValue(makeCaller('MANAGER'));
    fetchHelpArticlesFirstPageMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      hasMore: false,
    });
    const mod = await import('../page');
    const result = (await mod.default()) as {
      type: { name: string };
      props: { role: string };
    };
    expect(result.type.name).toBe('ArticleAdminList');
    expect(result.props.role).toBe('MANAGER');
  });

  it('renders ForbiddenSurface for non-privileged USER role without issuing an articles tRPC call', async () => {
    getAccessTokenMock.mockResolvedValue('tok-user');
    createCallerFromTokenMock.mockResolvedValue(makeCaller('USER'));

    const mod = await import('../page');
    const result = (await mod.default()) as { type: { name: string } };

    expect(result.type.name).toBe('ForbiddenSurface');
    expect(fetchHelpArticlesFirstPageMock).not.toHaveBeenCalled();
  });

  it('renders ForbiddenSurface for anonymous (no access token)', async () => {
    getAccessTokenMock.mockResolvedValue(null);

    const mod = await import('../page');
    const result = (await mod.default()) as { type: { name: string } };

    expect(result.type.name).toBe('ForbiddenSurface');
    expect(createCallerFromTokenMock).not.toHaveBeenCalled();
    expect(fetchHelpArticlesFirstPageMock).not.toHaveBeenCalled();
  });

  it('renders ForbiddenSurface when user.getProfile fails (expired token, deleted user, etc.)', async () => {
    getAccessTokenMock.mockResolvedValue('tok-bad');
    createCallerFromTokenMock.mockResolvedValue({
      user: {
        getProfile: vi.fn().mockRejectedValue(new Error('UNAUTHORIZED')),
      },
    });

    const mod = await import('../page');
    const result = (await mod.default()) as { type: { name: string } };

    expect(result.type.name).toBe('ForbiddenSurface');
    expect(fetchHelpArticlesFirstPageMock).not.toHaveBeenCalled();
  });

  it('swallows prefetch errors and still renders ArticleAdminList with null initialData', async () => {
    getAccessTokenMock.mockResolvedValue('tok-admin');
    createCallerFromTokenMock.mockResolvedValue(makeCaller('ADMIN'));
    fetchHelpArticlesFirstPageMock.mockRejectedValue(new Error('network down'));

    const mod = await import('../page');
    const result = (await mod.default()) as {
      type: { name: string };
      props: { initialData: unknown; role: string };
    };

    expect(result.type.name).toBe('ArticleAdminList');
    expect(result.props.role).toBe('ADMIN');
    expect(result.props.initialData).toBeNull();
  });
});
