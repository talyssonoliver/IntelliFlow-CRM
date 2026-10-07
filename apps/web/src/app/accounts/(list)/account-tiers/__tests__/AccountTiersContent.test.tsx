import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';

const toast = vi.fn();
vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: (...args: unknown[]) => toast(...args) };
});
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

type View = {
  tiers: Array<{
    key: string;
    label: string;
    minRevenue: number;
    colorToken: string;
    benefits: string[];
    sortOrder: number;
  }>;
  defaultTierKey: string | null;
  notifyOwnerOnUpgrade: boolean;
  notifyOwnerOnDowngrade: boolean;
  updatedAt: string | null;
  isDefault: boolean;
  canManage: boolean;
};

const DEFAULT_VIEW: View = {
  tiers: [
    {
      key: 'ENTERPRISE',
      label: 'Enterprise',
      minRevenue: 10_000_000,
      colorToken: 'purple',
      benefits: [],
      sortOrder: 0,
    },
    {
      key: 'MID_MARKET',
      label: 'Mid-Market',
      minRevenue: 1_000_000,
      colorToken: 'blue',
      benefits: [],
      sortOrder: 1,
    },
    {
      key: 'SMB',
      label: 'SMB',
      minRevenue: 100_000,
      colorToken: 'green',
      benefits: [],
      sortOrder: 2,
    },
    {
      key: 'STARTUP',
      label: 'Startup',
      minRevenue: 0,
      colorToken: 'yellow',
      benefits: [],
      sortOrder: 3,
    },
  ],
  defaultTierKey: null,
  notifyOwnerOnUpgrade: false,
  notifyOwnerOnDowngrade: false,
  updatedAt: '2026-10-07T08:00:00.000Z',
  isDefault: false,
  canManage: true,
};

const state = {
  query: { data: DEFAULT_VIEW as View | undefined, error: null as null | { message: string } },
};
const refetch = vi.fn();
const setData = vi.fn();
const updateMutate = vi.fn();
const resetMutate = vi.fn();
let updateOpts: { onSuccess: (d: View) => void; onError: (e: unknown) => void };
let resetOpts: { onSuccess: (d: View) => void; onError: (e: unknown) => void };

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ accountTiers: { get: { setData: (...a: unknown[]) => setData(...a) } } }),
    accountTiers: {
      get: { useQuery: () => ({ data: state.query.data, error: state.query.error, refetch }) },
      update: {
        useMutation: (opts: typeof updateOpts) => {
          updateOpts = opts;
          return { mutate: updateMutate, isPending: false };
        },
      },
      resetToDefaults: {
        useMutation: (opts: typeof resetOpts) => {
          resetOpts = opts;
          return { mutate: resetMutate, isPending: false };
        },
      },
    },
  },
}));

import AccountTiersContent, { RESET_CONFIRM_TEXT } from '../AccountTiersContent';

const saveButton = () => screen.getByRole('button', { name: /save changes/i });

describe('AccountTiersContent (PG-196)', () => {
  beforeEach(() => {
    state.query = { data: { ...DEFAULT_VIEW }, error: null };
    toast.mockReset();
    refetch.mockReset();
    setData.mockReset();
    updateMutate.mockReset();
    resetMutate.mockReset();
  });

  it('renders the four default tiers, default tier and rules in the bento layout', () => {
    render(<AccountTiersContent />);
    expect(screen.getByRole('heading', { name: 'Account Tiers' })).toBeInTheDocument();
    for (const title of ['Tier Definitions', 'Default Tier', 'Up/Down Rules', 'Benefits Matrix']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    }
    const list = screen.getByRole('list', { name: 'Account tiers' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByLabelText('Name of tier 1')).toHaveValue('Enterprise');
    expect(screen.getByText('Unknown (no tier)')).toBeInTheDocument();
    expect(screen.getByLabelText('Notify owner when an account moves up a tier')).not.toBeChecked();
    expect(
      screen.getByText(
        'Accounts move between tiers automatically when their annual revenue crosses a threshold.'
      )
    ).toBeInTheDocument();
  });

  it('shows the passive empty state for benefits and keeps the CTA in the header', () => {
    render(<AccountTiersContent />);
    expect(screen.getByRole('button', { name: 'Add Benefit' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('enables Save only once something changed, and saves the full payload', () => {
    render(<AccountTiersContent />);
    expect(saveButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name of tier 1'), { target: { value: 'Strategic' } });
    expect(saveButton()).toBeEnabled();
    fireEvent.click(saveButton());
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedUpdatedAt: '2026-10-07T08:00:00.000Z',
        defaultTierKey: null,
        tiers: expect.arrayContaining([
          expect.objectContaining({
            key: 'ENTERPRISE',
            label: 'Strategic',
            minRevenue: 10_000_000,
          }),
        ]),
      })
    );
  });

  it('blocks Save and shows the error while the tiers are invalid', () => {
    render(<AccountTiersContent />);
    fireEvent.change(screen.getByLabelText('Name of tier 2'), { target: { value: 'enterprise' } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Tier names must be unique: rows 1 and 2 are both "enterprise"'
    );
    expect(saveButton()).toBeDisabled();
  });

  it('shows set-level errors above the grid', () => {
    render(<AccountTiersContent />);
    fireEvent.change(screen.getByLabelText('Minimum annual revenue for Startup'), {
      target: { value: '10' },
    });
    expect(
      screen
        .getAllByRole('alert')
        .some((el) =>
          el.textContent?.includes('One tier must start at 0 so every account has a tier')
        )
    ).toBe(true);
  });

  it('adds and removes tiers and announces it', () => {
    render(<AccountTiersContent />);
    fireEvent.click(screen.getByRole('button', { name: 'New Tier' }));
    expect(screen.getByLabelText('Name of tier 5')).toHaveValue('Tier 5');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tier 5' }));
    expect(screen.queryByLabelText('Name of tier 5')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent('Tier removed');
  });

  it('disables New Tier at ten tiers', () => {
    state.query.data = {
      ...DEFAULT_VIEW,
      tiers: Array.from({ length: 10 }, (_, i) => ({
        key: `T${i}`,
        label: `Tier ${i}`,
        minRevenue: i * 10,
        colorToken: 'slate',
        benefits: [],
        sortOrder: i,
      })),
    };
    render(<AccountTiersContent />);
    expect(screen.getByRole('button', { name: 'New Tier' })).toBeDisabled();
  });

  it('removing the default tier clears the default', () => {
    state.query.data = { ...DEFAULT_VIEW, defaultTierKey: 'SMB' };
    render(<AccountTiersContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove SMB' }));
    fireEvent.click(saveButton());
    expect(updateMutate).toHaveBeenCalledWith(expect.objectContaining({ defaultTierKey: null }));
  });

  it('builds the benefits matrix and saves benefits per tier', () => {
    render(<AccountTiersContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Benefit' }));
    fireEvent.change(screen.getByLabelText('Benefit 1 name'), {
      target: { value: 'Dedicated CSM' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dedicated CSM for Enterprise' }));
    fireEvent.click(saveButton());
    const payload = updateMutate.mock.calls[0][0];
    expect(payload.tiers[0].benefits).toEqual(['Dedicated CSM']);
    expect(payload.tiers[1].benefits).toEqual([]);
  });

  it('removes a benefit from every tier', () => {
    state.query.data = {
      ...DEFAULT_VIEW,
      tiers: DEFAULT_VIEW.tiers.map((t, i) => (i === 0 ? { ...t, benefits: ['CSM'] } : t)),
    };
    render(<AccountTiersContent />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'CSM for SMB' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'CSM for SMB' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove benefit CSM' }));
    fireEvent.click(saveButton());
    expect(
      updateMutate.mock.calls[0][0].tiers.every(
        (t: { benefits: string[] }) => t.benefits.length === 0
      )
    ).toBe(true);
  });

  it('saves the notification rules', () => {
    render(<AccountTiersContent />);
    fireEvent.click(screen.getByLabelText('Notify owner when an account moves down a tier'));
    fireEvent.click(saveButton());
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ notifyOwnerOnDowngrade: true, notifyOwnerOnUpgrade: false })
    );
  });

  it('confirms Reset to Defaults with the documented text and resets once', async () => {
    render(<AccountTiersContent />);
    fireEvent.click(screen.getByRole('button', { name: /reset to defaults/i }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(dialog).toHaveTextContent(RESET_CONFIRM_TEXT);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));
    expect(resetMutate).toHaveBeenCalledTimes(1);
  });

  it('adopts the saved configuration and disables Save again', async () => {
    render(<AccountTiersContent />);
    fireEvent.change(screen.getByLabelText('Name of tier 1'), { target: { value: 'Strategic' } });
    const saved = {
      ...DEFAULT_VIEW,
      tiers: DEFAULT_VIEW.tiers.map((t, i) => (i === 0 ? { ...t, label: 'Strategic' } : t)),
      updatedAt: '2026-10-07T09:00:00.000Z',
    };
    updateOpts.onSuccess(saved);
    await waitFor(() => expect(saveButton()).toBeDisabled());
    expect(setData).toHaveBeenCalledWith(undefined, saved);
    expect(toast).toHaveBeenCalledWith({ title: 'Account tiers saved' });
  });

  it('reloads with a toast when someone else saved first', () => {
    render(<AccountTiersContent />);
    updateOpts.onError({ data: { code: 'CONFLICT' }, message: 'stale' });
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Tiers changed elsewhere' })
    );
    expect(refetch).toHaveBeenCalled();
  });

  it('reports other save and reset errors', () => {
    render(<AccountTiersContent />);
    updateOpts.onError({ data: { code: 'BAD_REQUEST' }, message: 'nope' });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not save tiers' }));
    resetOpts.onError({ message: 'down' });
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Could not reset tiers' }));
    resetOpts.onSuccess(DEFAULT_VIEW);
    expect(toast).toHaveBeenCalledWith({ title: 'Account tiers reset to defaults' });
  });

  it('is read-only for non-admins: disabled inputs, no Save or Reset', () => {
    state.query.data = { ...DEFAULT_VIEW, canManage: false };
    render(<AccountTiersContent />);
    expect(screen.getByText('Only workspace admins can change account tiers.')).toBeInTheDocument();
    expect(screen.getByLabelText('Name of tier 1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset to defaults/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New Tier' })).not.toBeInTheDocument();
  });

  it('shows the skeleton while loading', () => {
    state.query.data = undefined;
    render(<AccountTiersContent />);
    expect(screen.getByLabelText('Loading account tiers')).toBeInTheDocument();
  });

  it('shows the error with a retry', () => {
    state.query = { data: undefined, error: { message: 'boom' } };
    render(<AccountTiersContent />);
    expect(screen.getByText('Failed to load account tiers: boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });
});
