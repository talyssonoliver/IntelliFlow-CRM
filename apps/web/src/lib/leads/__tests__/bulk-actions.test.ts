import { describe, it, expect, vi } from 'vitest';
import {
  LEAD_STATUS_OPTIONS,
  SCORE_FILTER_OPTIONS,
  LEAD_SORT_OPTIONS,
  getSortParams,
  getScoreParams,
  buildLeadBulkActions,
  createBulkActionRunners,
  type BulkRunnerMutations,
  type ToastApi,
} from '../bulk-actions';
import type { Lead } from '../lead-types';

const l = (id: string, overrides: Partial<Lead> = {}): Lead => ({
  id,
  email: `${id}@ex.com`,
  firstName: 'F',
  lastName: 'L',
  company: 'Co',
  title: 'T',
  status: 'NEW',
  score: 50,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...overrides,
});

describe('getSortParams', () => {
  it('maps oldest → createdAt asc', () => {
    expect(getSortParams('oldest')).toEqual({ sortBy: 'createdAt', sortOrder: 'asc' });
  });
  it('maps score-high → score desc', () => {
    expect(getSortParams('score-high')).toEqual({ sortBy: 'score', sortOrder: 'desc' });
  });
  it('maps score-low → score asc', () => {
    expect(getSortParams('score-low')).toEqual({ sortBy: 'score', sortOrder: 'asc' });
  });
  it('maps newest / default → createdAt desc', () => {
    expect(getSortParams('newest')).toEqual({ sortBy: 'createdAt', sortOrder: 'desc' });
    expect(getSortParams('anything-else')).toEqual({
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });
});

describe('getScoreParams', () => {
  it('maps high → minScore 80', () => {
    expect(getScoreParams('high')).toEqual({ minScore: 80 });
  });
  it('maps medium → minScore 50, maxScore 79', () => {
    expect(getScoreParams('medium')).toEqual({ minScore: 50, maxScore: 79 });
  });
  it('maps low → maxScore 49', () => {
    expect(getScoreParams('low')).toEqual({ maxScore: 49 });
  });
  it('maps default → {}', () => {
    expect(getScoreParams('')).toEqual({});
    expect(getScoreParams('anything-else')).toEqual({});
  });
});

describe('LEAD_STATUS_OPTIONS', () => {
  it('has exactly 6 entries (CONVERTED intentionally omitted per AC-007)', () => {
    expect(LEAD_STATUS_OPTIONS).toHaveLength(6);
  });
  it('contains exactly the six values in order', () => {
    expect(LEAD_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'NEW',
      'CONTACTED',
      'QUALIFIED',
      'NEGOTIATING',
      'UNQUALIFIED',
      'LOST',
    ]);
  });
});

describe('SCORE_FILTER_OPTIONS', () => {
  it('has exactly 3 entries with value + label', () => {
    expect(SCORE_FILTER_OPTIONS).toHaveLength(3);
    SCORE_FILTER_OPTIONS.forEach((o) => {
      expect(o).toHaveProperty('value');
      expect(o).toHaveProperty('label');
    });
  });
});

describe('LEAD_SORT_OPTIONS', () => {
  it('has exactly 4 entries with the four documented values', () => {
    expect(LEAD_SORT_OPTIONS.map((o) => o.value)).toEqual([
      'newest',
      'oldest',
      'score-high',
      'score-low',
    ]);
  });
});

describe('buildLeadBulkActions', () => {
  const makeDeps = () => ({
    setSelected: vi.fn(),
    openDialog: vi.fn(),
  });

  it('returns four actions in the expected order with Delete marked as danger', () => {
    const deps = makeDeps();
    const actions = buildLeadBulkActions(deps);
    expect(actions).toHaveLength(4);
    expect(actions.map((a) => a.icon)).toEqual(['person_add', 'edit', 'archive', 'delete']);
    const del = actions[3];
    expect(del?.variant).toBe('danger');
  });

  it('convert onClick calls setSelected and openDialog("convert")', () => {
    const deps = makeDeps();
    const actions = buildLeadBulkActions(deps);
    const leads = [l('a'), l('b')];
    actions[0]?.onClick?.(leads);
    expect(deps.setSelected).toHaveBeenCalledWith(leads);
    expect(deps.openDialog).toHaveBeenCalledWith('convert');
  });

  it('status onClick calls setSelected and openDialog("status")', () => {
    const deps = makeDeps();
    const leads = [l('a')];
    buildLeadBulkActions(deps)[1]?.onClick?.(leads);
    expect(deps.setSelected).toHaveBeenCalledWith(leads);
    expect(deps.openDialog).toHaveBeenCalledWith('status');
  });

  it('archive onClick calls setSelected and openDialog("archive")', () => {
    const deps = makeDeps();
    const leads = [l('a')];
    buildLeadBulkActions(deps)[2]?.onClick?.(leads);
    expect(deps.setSelected).toHaveBeenCalledWith(leads);
    expect(deps.openDialog).toHaveBeenCalledWith('archive');
  });

  it('delete onClick calls setSelected and openDialog("delete")', () => {
    const deps = makeDeps();
    const leads = [l('a')];
    buildLeadBulkActions(deps)[3]?.onClick?.(leads);
    expect(deps.setSelected).toHaveBeenCalledWith(leads);
    expect(deps.openDialog).toHaveBeenCalledWith('delete');
  });
});

function makeMutations(overrides: Partial<BulkRunnerMutations> = {}): BulkRunnerMutations {
  const ok = { successful: ['1'] as string[], failed: [] as { id: string; error: string }[] };
  return {
    bulkConvert: { mutateAsync: vi.fn().mockResolvedValue(ok) },
    bulkUpdateStatus: { mutateAsync: vi.fn().mockResolvedValue(ok) },
    bulkArchive: { mutateAsync: vi.fn().mockResolvedValue(ok) },
    bulkDelete: { mutateAsync: vi.fn().mockResolvedValue(ok) },
    ...overrides,
  };
}

describe('createBulkActionRunners — runConvert', () => {
  it('success: calls success toast and onFinally; no destructive toast', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runConvert([l('1')]);
    expect(mutations.bulkConvert.mutateAsync).toHaveBeenCalledWith({
      ids: ['1'],
      createAccounts: false,
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Leads Converted' }));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('partial failure: both toasts fire and include first failure error', async () => {
    const mutations = makeMutations({
      bulkConvert: {
        mutateAsync: vi.fn().mockResolvedValue({
          successful: ['1'],
          failed: [{ id: '2', error: 'bad' }],
        }),
      },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runConvert([l('1'), l('2')]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Leads Converted' }));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some leads could not be converted',
        variant: 'destructive',
        description: expect.stringContaining('bad'),
      })
    );
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('throw: toast destructive with error message and onFinally still fires', async () => {
    const mutations = makeMutations({
      bulkConvert: { mutateAsync: vi.fn().mockRejectedValue(new Error('boom')) },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runConvert([l('1')]);
    expect(toast).toHaveBeenCalledWith({
      title: 'Conversion Failed',
      description: 'boom',
      variant: 'destructive',
    });
    expect(onFinally).toHaveBeenCalledTimes(1);
  });
});

describe('createBulkActionRunners — runUpdateStatus', () => {
  it('success: title includes target status', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runUpdateStatus([l('1')], 'QUALIFIED');
    expect(mutations.bulkUpdateStatus.mutateAsync).toHaveBeenCalledWith({
      ids: ['1'],
      status: 'QUALIFIED',
    });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Status Updated' }));
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('partial failure: destructive toast with failure count', async () => {
    const mutations = makeMutations({
      bulkUpdateStatus: {
        mutateAsync: vi.fn().mockResolvedValue({
          successful: ['1'],
          failed: [
            { id: '2', error: 'bad' },
            { id: '3', error: 'bad' },
          ],
        }),
      },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runUpdateStatus([l('1')], 'QUALIFIED');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some updates failed',
        variant: 'destructive',
      })
    );
  });

  it('throw: destructive toast with thrown message', async () => {
    const mutations = makeMutations({
      bulkUpdateStatus: { mutateAsync: vi.fn().mockRejectedValue(new Error('x')) },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runUpdateStatus([l('1')], 'QUALIFIED');
    expect(toast).toHaveBeenCalledWith({
      title: 'Status Update Failed',
      description: 'x',
      variant: 'destructive',
    });
  });
});

describe('createBulkActionRunners — runArchive', () => {
  it('success: Leads Archived toast fires', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runArchive([l('1')]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Leads Archived' }));
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('partial failure: destructive toast', async () => {
    const mutations = makeMutations({
      bulkArchive: {
        mutateAsync: vi.fn().mockResolvedValue({
          successful: ['1'],
          failed: [{ id: '2', error: 'x' }],
        }),
      },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runArchive([l('1')]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some leads could not be archived',
        variant: 'destructive',
      })
    );
  });

  it('throw: destructive toast', async () => {
    const mutations = makeMutations({
      bulkArchive: { mutateAsync: vi.fn().mockRejectedValue(new Error('arch')) },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runArchive([l('1')]);
    expect(toast).toHaveBeenCalledWith({
      title: 'Archive Failed',
      description: 'arch',
      variant: 'destructive',
    });
  });
});

describe('createBulkActionRunners — runDelete', () => {
  it('success: Leads Deleted toast fires', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runDelete([l('1')]);
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Leads Deleted' }));
    expect(onFinally).toHaveBeenCalledTimes(1);
  });

  it('partial failure: destructive toast with first error', async () => {
    const mutations = makeMutations({
      bulkDelete: {
        mutateAsync: vi.fn().mockResolvedValue({
          successful: ['1'],
          failed: [{ id: '2', error: 'locked' }],
        }),
      },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runDelete([l('1')]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some leads could not be deleted',
        description: expect.stringContaining('locked'),
        variant: 'destructive',
      })
    );
  });

  it('throw: destructive toast', async () => {
    const mutations = makeMutations({
      bulkDelete: { mutateAsync: vi.fn().mockRejectedValue(new Error('nope')) },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runDelete([l('1')]);
    expect(toast).toHaveBeenCalledWith({
      title: 'Delete Failed',
      description: 'nope',
      variant: 'destructive',
    });
  });
});

describe('createBulkActionRunners — non-Error reject + missing error fields', () => {
  it('runConvert: rejecting with a non-Error value uses the fallback message', async () => {
    const mutations = makeMutations({
      bulkConvert: { mutateAsync: vi.fn().mockRejectedValue('raw string') },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runConvert([l('1')]);
    expect(toast).toHaveBeenCalledWith({
      title: 'Conversion Failed',
      description: 'An unexpected error occurred',
      variant: 'destructive',
    });
  });

  it('runUpdateStatus: failed[0] with empty error falls back to generic count message', async () => {
    const mutations = makeMutations({
      bulkUpdateStatus: {
        mutateAsync: vi.fn().mockResolvedValue({
          successful: [],
          failed: [{ id: '2', error: '' }],
        }),
      },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runUpdateStatus([l('1')], 'QUALIFIED');
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some updates failed',
        variant: 'destructive',
        description: expect.stringContaining('could not be updated'),
      })
    );
  });

  it('runArchive: non-Error rejection uses fallback message', async () => {
    const mutations = makeMutations({
      bulkArchive: { mutateAsync: vi.fn().mockRejectedValue({ weird: true }) },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runArchive([l('1')]);
    expect(toast).toHaveBeenCalledWith({
      title: 'Archive Failed',
      description: 'An unexpected error occurred',
      variant: 'destructive',
    });
  });

  it('runDelete: failed[0] without error field falls back to "Unknown error"', async () => {
    const mutations = makeMutations({
      bulkDelete: {
        mutateAsync: vi.fn().mockResolvedValue({
          successful: [],
          failed: [{ id: '2', error: undefined as unknown as string }],
        }),
      },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runDelete([l('1')]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some leads could not be deleted',
        description: expect.stringContaining('Unknown error'),
        variant: 'destructive',
      })
    );
  });

  it('runDelete: non-Error rejection uses fallback message', async () => {
    const mutations = makeMutations({
      bulkDelete: { mutateAsync: vi.fn().mockRejectedValue(42) },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runDelete([l('1')]);
    expect(toast).toHaveBeenCalledWith({
      title: 'Delete Failed',
      description: 'An unexpected error occurred',
      variant: 'destructive',
    });
  });

  it('runUpdateStatus: non-Error rejection uses fallback message', async () => {
    const mutations = makeMutations({
      bulkUpdateStatus: { mutateAsync: vi.fn().mockRejectedValue(null) },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runUpdateStatus([l('1')], 'NEW');
    expect(toast).toHaveBeenCalledWith({
      title: 'Status Update Failed',
      description: 'An unexpected error occurred',
      variant: 'destructive',
    });
  });

  it('runConvert: failed[0].error missing uses "Unknown error"', async () => {
    const mutations = makeMutations({
      bulkConvert: {
        mutateAsync: vi.fn().mockResolvedValue({
          successful: [],
          failed: [{ id: '2', error: undefined as unknown as string }],
        }),
      },
    });
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runConvert([l('1')]);
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some leads could not be converted',
        description: expect.stringContaining('Unknown error'),
        variant: 'destructive',
      })
    );
  });
});

describe('createBulkActionRunners — empty-selection guard', () => {
  it('runConvert: empty array is a no-op', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runConvert([]);
    expect(mutations.bulkConvert.mutateAsync).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(onFinally).not.toHaveBeenCalled();
  });
  it('runUpdateStatus: empty array is a no-op', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runUpdateStatus([], 'NEW');
    expect(mutations.bulkUpdateStatus.mutateAsync).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(onFinally).not.toHaveBeenCalled();
  });
  it('runArchive: empty array is a no-op', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runArchive([]);
    expect(mutations.bulkArchive.mutateAsync).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(onFinally).not.toHaveBeenCalled();
  });
  it('runDelete: empty array is a no-op', async () => {
    const mutations = makeMutations();
    const toast = vi.fn<ToastApi>();
    const onFinally = vi.fn();
    const runners = createBulkActionRunners(mutations, toast, onFinally);
    await runners.runDelete([]);
    expect(mutations.bulkDelete.mutateAsync).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(onFinally).not.toHaveBeenCalled();
  });
});

describe('getLeadScope — sidebar view + segment wiring', () => {
  const now = new Date('2026-04-20T12:00:00Z');

  it('default (no params) → all-leads scope with no filters and no notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope(null, null, 'user-1', now);
    expect(scope.view).toBe('all');
    expect(scope.segment).toBe(null);
    expect(scope.title).toBe('Lead List');
    expect(scope.params).toEqual({});
    expect(scope.pendingNotice).toBe(null);
  });

  it('view=my with current user → ownerId filter, no notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope('my', null, 'user-42', now);
    expect(scope.view).toBe('my');
    expect(scope.title).toBe('My Leads');
    expect(scope.params.ownerId).toBe('user-42');
    expect(scope.pendingNotice).toBe(null);
  });

  it('view=my without current user → empty filter + sign-in notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope('my', null, null, now);
    expect(scope.params.ownerId).toBeUndefined();
    expect(scope.pendingNotice).toMatch(/sign in/i);
  });

  it('view=starred → isStarred filter, no pending notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope('starred', null, 'user-1', now);
    expect(scope.view).toBe('starred');
    expect(scope.title).toBe('Starred Leads');
    expect(scope.params.isStarred).toBe(true);
    expect(scope.pendingNotice).toBe(null);
  });

  it('view=recent with empty recentIds → empty ids filter (no rows), no pending notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope('recent', null, 'user-1', now, []);
    expect(scope.view).toBe('recent');
    expect(scope.title).toBe('Recently Viewed');
    expect(scope.params.ids).toEqual([]);
    expect(scope.description).toMatch(/Open any lead/i);
    expect(scope.pendingNotice).toBe(null);
  });

  it('view=recent with recentIds → ids filter + descriptive count', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope('recent', null, 'user-1', now, ['a', 'b', 'c']);
    expect(scope.params.ids).toEqual(['a', 'b', 'c']);
    expect(scope.description).toMatch(/last 3 leads/i);
    expect(scope.pendingNotice).toBe(null);
  });

  it('segment=new-week → dateFrom 7 days ago, no notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope(null, 'new-week', 'user-1', now);
    expect(scope.segment).toBe('new-week');
    expect(scope.title).toBe('New This Week');
    expect(scope.params.dateFrom).toEqual(new Date('2026-04-13T12:00:00Z'));
    expect(scope.pendingNotice).toBe(null);
  });

  it('segment=hot → minScore 80, no notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope(null, 'hot', 'user-1', now);
    expect(scope.segment).toBe('hot');
    expect(scope.title).toBe('Hot Leads');
    expect(scope.params.minScore).toBe(80);
    expect(scope.pendingNotice).toBe(null);
  });

  it('segment=followup → lastContactedBefore 7 days ago; no pending notice', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope(null, 'followup', 'user-1', now);
    expect(scope.segment).toBe('followup');
    expect(scope.title).toBe('Needs Follow-up');
    expect(scope.params.lastContactedBefore).toEqual(new Date('2026-04-13T12:00:00Z'));
    expect(scope.params.status).toBeUndefined();
    expect(scope.pendingNotice).toBe(null);
  });

  it('unknown view + unknown segment → default all scope', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope('bogus', 'also-bogus', 'user-1', now);
    expect(scope.view).toBe('all');
    expect(scope.segment).toBe(null);
    expect(scope.params).toEqual({});
  });

  it('segment beats view when both set', async () => {
    const { getLeadScope } = await import('../bulk-actions');
    const scope = getLeadScope('my', 'hot', 'user-1', now);
    expect(scope.segment).toBe('hot');
    expect(scope.title).toBe('Hot Leads');
    expect(scope.params.minScore).toBe(80);
    expect(scope.params.ownerId).toBeUndefined();
  });
});
