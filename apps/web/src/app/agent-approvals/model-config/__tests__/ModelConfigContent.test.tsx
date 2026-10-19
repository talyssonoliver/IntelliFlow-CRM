/**
 * @vitest-environment jsdom
 *
 * PG-199 — Model Configuration page (AC-001, AC-004..AC-006, AC-008, AC-010..AC-012,
 * AC-016, AC-023, NF-001). PageHeader is the real component; Radix Select is the
 * native stand-in.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { modelConfigDto } from './model-config-fixtures';

const h = vi.hoisted(() => ({
  auth: { isLoading: false, isAuthenticated: true },
  query: {
    data: undefined as unknown,
    isLoading: false,
    error: null as null | { message: string; data?: { code: string } },
  },
  queryOptions: undefined as unknown,
  refetch: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  update: { mutateAsync: vi.fn(), isPending: false },
  reset: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
  toast: h.toast,
}));
vi.mock('@/lib/auth/AuthContext', () => ({ useRequireAuth: () => h.auth }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ modelConfig: { get: { invalidate: h.invalidate } } }),
    modelConfig: {
      get: {
        useQuery: (_input: unknown, options: unknown) => {
          h.queryOptions = options;
          return { ...h.query, refetch: h.refetch };
        },
      },
      update: { useMutation: () => h.update },
      resetToDefaults: { useMutation: () => h.reset },
    },
  },
}));

import ModelConfigContent from '../ModelConfigContent';

const T0 = '2026-10-01T09:00:00.000Z';
const T1 = '2026-10-02T09:00:00.000Z';

function load(dto = modelConfigDto()) {
  h.query = { data: dto, isLoading: false, error: null };
}

function trpcError(code: string, message = code) {
  return Object.assign(new Error(message), { data: { code } });
}

const region = (name: string) => screen.getByRole('region', { name });
const saveButton = () => screen.getByRole('button', { name: 'Save changes' });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { isLoading: false, isAuthenticated: true };
  h.update = {
    mutateAsync: vi.fn().mockResolvedValue({ updated: [], updatedAt: {} }),
    isPending: false,
  };
  h.reset = { mutateAsync: vi.fn().mockResolvedValue({ reset: 1 }), isPending: false };
  h.refetch = vi.fn().mockResolvedValue({});
  load();
});

describe('ModelConfigContent — layout', () => {
  it('renders the header, breadcrumbs, the AI Settings link and six purpose cards', () => {
    render(<ModelConfigContent />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Model Configuration' })
    ).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i });
    for (const crumb of ['Dashboard', 'AI & Agents', 'AI Settings']) {
      expect(nav).toHaveTextContent(crumb);
    }
    expect(screen.getByRole('link', { name: /chain versions/i })).toHaveAttribute(
      'href',
      '/agent-approvals/ai-settings'
    );
    for (const name of ['Scoring', 'Qualification', 'Email', 'Reasoning', 'Structured', 'Rag']) {
      expect(region(name)).toBeInTheDocument();
    }
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it('labels the UTC month and refetches on focus', () => {
    render(<ModelConfigContent />);
    expect(screen.getByText(/October 2026 \(UTC\)/)).toBeInTheDocument();
    expect(h.queryOptions).toMatchObject({ enabled: true, refetchOnWindowFocus: true });
  });

  it('discloses how settings apply', () => {
    render(<ModelConfigContent />);
    const notes = screen.getByRole('region', { name: 'How these settings apply' });
    expect(notes).toHaveTextContent(/within about 2 minutes/i);
    expect(notes).toHaveTextContent(/ceilings are soft/i);
    expect(notes).toHaveTextContent(/embedding spend is estimated/i);
    expect(notes).toHaveTextContent(/LiteLLM gateway/i);
    expect(notes).toHaveTextContent(/not on OpenRouter/i);
    expect(notes).toHaveTextContent(/fallbacks.*once a model is pinned/i);
  });

  it('locks the rag card except its ceiling', () => {
    render(<ModelConfigContent />);
    const rag = region('Rag');
    expect(within(rag).getByText(/platform-managed embedding model/i)).toBeInTheDocument();
    expect(within(rag).queryByLabelText('Rag model')).toBeNull();
    expect(within(rag).getByLabelText('Monthly ceiling (USD)')).toBeInTheDocument();
  });

  it('shows the email block from the server', () => {
    load(
      modelConfigDto({ email: { blocked: true, monthlyCostCeilingCents: 100, spentCents: 120 } })
    );
    render(<ModelConfigContent />);
    expect(
      within(region('Email')).getByText('Monthly AI ceiling reached for email')
    ).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ModelConfigContent />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});

describe('ModelConfigContent — loading and errors', () => {
  it('shows the skeleton while loading', () => {
    h.query = { data: undefined, isLoading: true, error: null };
    render(<ModelConfigContent />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading model configuration…');
  });

  it('waits for auth before querying', () => {
    h.auth = { isLoading: true, isAuthenticated: false };
    render(<ModelConfigContent />);
    expect(h.queryOptions).toMatchObject({ enabled: false });
  });

  it('degrades calmly when the API does not have model config yet', () => {
    h.query = { data: undefined, isLoading: false, error: trpcError('NOT_FOUND') };
    render(<ModelConfigContent />);
    expect(screen.getByRole('status')).toHaveTextContent(/not available on this server yet/i);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(h.update.mutateAsync).not.toHaveBeenCalled();
    expect(h.reset.mutateAsync).not.toHaveBeenCalled();
  });

  it('shows other failures as an alert with Retry', () => {
    h.query = {
      data: undefined,
      isLoading: false,
      error: trpcError('INTERNAL_SERVER_ERROR', 'boom'),
    };
    render(<ModelConfigContent />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load model configuration: boom');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(h.refetch).toHaveBeenCalled();
  });
});

describe('ModelConfigContent — save', () => {
  it('enables Save only once something changed', () => {
    render(<ModelConfigContent />);
    expect(saveButton()).toBeDisabled();
    fireEvent.change(within(region('Email')).getByLabelText('Max tokens'), {
      target: { value: '900' },
    });
    expect(saveButton()).toBeEnabled();
  });

  it('sends only the changed purpose, its token, no tier and no acknowledgement', async () => {
    load(modelConfigDto({ email: { updatedAt: T0 } }));
    render(<ModelConfigContent />);
    fireEvent.change(within(region('Email')).getByLabelText('Max tokens'), {
      target: { value: '900' },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(h.update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = h.update.mutateAsync.mock.calls[0][0];
    expect(payload).toEqual({
      purposes: [
        {
          purpose: 'email',
          modelId: null,
          fallbackModelIds: [],
          temperature: null,
          maxTokens: 900,
          monthlyCostCeilingCents: null,
        },
      ],
      expected: { email: T0 },
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(h.invalidate).toHaveBeenCalled());
    await waitFor(() =>
      expect(document.querySelector('output[aria-live="polite"]')).toHaveTextContent(
        'Model settings saved.'
      )
    );
  });

  it('blocks Save on a client validation error and points at the field', async () => {
    render(<ModelConfigContent />);
    const input = within(region('Email')).getByLabelText('Monthly ceiling (USD)');
    fireEvent.change(input, { target: { value: '1.234' } });
    fireEvent.click(saveButton());
    expect(h.update.mutateAsync).not.toHaveBeenCalled();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Use dollars with at most two decimals, e.g. 25 or 12.50.')
    ).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(input));
  });

  it('asks once for every downgrade, naming models and prices, then acknowledges', async () => {
    load(
      modelConfigDto({
        scoring: { modelId: 'gpt-4o-mini', updatedAt: T0 },
        reasoning: { modelId: 'claude-sonnet-4-5', updatedAt: T0 },
      })
    );
    render(<ModelConfigContent />);
    fireEvent.change(within(region('Scoring')).getByLabelText('Scoring model'), {
      target: { value: 'llama-3.1-8b-instant' },
    });
    fireEvent.change(within(region('Reasoning')).getByLabelText('Reasoning model'), {
      target: { value: 'claude-haiku-4-5' },
    });
    fireEvent.click(saveButton());

    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(
      'gpt-4o-mini ($0.75 / 1M tokens) → llama-3.1-8b-instant ($0.13 / 1M tokens)'
    );
    expect(dialog).toHaveTextContent(
      'claude-sonnet-4-5 ($18.00 / 1M tokens) → claude-haiku-4-5 ($4.80 / 1M tokens)'
    );
    expect(h.update.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Save with cheaper models' }));
    await waitFor(() => expect(h.update.mutateAsync).toHaveBeenCalledTimes(1));
    const payload = h.update.mutateAsync.mock.calls[0][0];
    expect(payload.acknowledgeDowngrade).toBe(true);
    expect(payload.purposes.map((p: { purpose: string }) => p.purpose)).toEqual([
      'scoring',
      'reasoning',
    ]);
  });

  it('does not save when the downgrade is cancelled', async () => {
    load(modelConfigDto({ scoring: { modelId: 'gpt-4o-mini', updatedAt: T0 } }));
    render(<ModelConfigContent />);
    fireEvent.change(within(region('Scoring')).getByLabelText('Scoring model'), {
      target: { value: 'llama-3.1-8b-instant' },
    });
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(h.update.mutateAsync).not.toHaveBeenCalled();
  });

  it('saves an upgrade without a confirm', async () => {
    load(modelConfigDto({ scoring: { modelId: 'gpt-4o-mini', updatedAt: T0 } }));
    render(<ModelConfigContent />);
    fireEvent.change(within(region('Scoring')).getByLabelText('Scoring model'), {
      target: { value: 'mistral-small' },
    });
    fireEvent.click(saveButton());
    await waitFor(() => expect(h.update.mutateAsync).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(h.update.mutateAsync.mock.calls[0][0]).not.toHaveProperty('acknowledgeDowngrade');
  });

  it('keeps the draft on CONFLICT and offers Reload latest', async () => {
    load(modelConfigDto({ email: { updatedAt: T0 } }));
    h.update.mutateAsync.mockRejectedValueOnce(
      trpcError('CONFLICT', 'The email settings changed since this page loaded.')
    );
    const view = render(<ModelConfigContent />);
    const input = within(region('Email')).getByLabelText('Max tokens');
    fireEvent.change(input, { target: { value: '900' } });
    fireEvent.click(saveButton());

    const reload = await screen.findByRole('button', { name: 'Reload latest' });
    expect(screen.getByRole('alert')).toHaveTextContent(/changed since this page loaded/i);
    expect((input as HTMLInputElement).value).toBe('900');
    expect(saveButton()).toBeDisabled();

    load(modelConfigDto({ email: { updatedAt: T1, maxTokens: 400 } }));
    fireEvent.click(reload);
    await waitFor(() => expect(h.refetch).toHaveBeenCalled());
    view.rerender(<ModelConfigContent />);
    await waitFor(() =>
      expect((within(region('Email')).getByLabelText('Max tokens') as HTMLInputElement).value).toBe(
        '400'
      )
    );
    expect(screen.queryByRole('button', { name: 'Reload latest' })).toBeNull();
  });

  it('maps server field errors to the matching field', async () => {
    h.update.mutateAsync.mockRejectedValueOnce(
      trpcError(
        'BAD_REQUEST',
        JSON.stringify([{ path: ['purposes', 0, 'maxTokens'], message: 'Too big for this model' }])
      )
    );
    render(<ModelConfigContent />);
    const input = within(region('Email')).getByLabelText('Max tokens');
    fireEvent.change(input, { target: { value: '900' } });
    fireEvent.click(saveButton());
    await screen.findByText('Too big for this model');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('confirms with the server text when it finds a downgrade the page did not', async () => {
    h.update.mutateAsync
      .mockRejectedValueOnce(
        trpcError('PRECONDITION_FAILED', 'DOWNGRADE_UNCONFIRMED: email primary default → x')
      )
      .mockResolvedValueOnce({ updated: ['email'], updatedAt: {} });
    render(<ModelConfigContent />);
    fireEvent.change(within(region('Email')).getByLabelText('Max tokens'), {
      target: { value: '900' },
    });
    fireEvent.click(saveButton());
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('email primary default → x');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save with cheaper models' }));
    await waitFor(() => expect(h.update.mutateAsync).toHaveBeenCalledTimes(2));
    expect(h.update.mutateAsync.mock.calls[1][0].acknowledgeDowngrade).toBe(true);
  });

  it('reports other save failures without losing the draft', async () => {
    h.update.mutateAsync.mockRejectedValueOnce(trpcError('INTERNAL_SERVER_ERROR', 'db down'));
    render(<ModelConfigContent />);
    const input = within(region('Email')).getByLabelText('Max tokens');
    fireEvent.change(input, { target: { value: '900' } });
    fireEvent.click(saveButton());
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }))
    );
    expect((input as HTMLInputElement).value).toBe('900');
  });
});

describe('ModelConfigContent — reset and permissions', () => {
  it('retries the reset (not a save) when the server finds a downgrade the page did not', async () => {
    load(modelConfigDto({ qualification: { updatedAt: T0 } }));
    h.reset.mutateAsync
      .mockRejectedValueOnce(
        trpcError(
          'PRECONDITION_FAILED',
          'DOWNGRADE_UNCONFIRMED: qualification primary gpt-4o → default'
        )
      )
      .mockResolvedValueOnce({ reset: 1 });
    render(<ModelConfigContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset' })
    );
    const again = await screen.findByRole('alertdialog');
    expect(again).toHaveTextContent('qualification primary gpt-4o → default');
    fireEvent.click(within(again).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(h.reset.mutateAsync).toHaveBeenCalledTimes(2));
    expect(h.reset.mutateAsync.mock.calls[1][0].acknowledgeDowngrade).toBe(true);
    expect(h.update.mutateAsync).not.toHaveBeenCalled();
  });

  it('confirms reset, listing what is reset, what is kept and any cheaper model', async () => {
    load(modelConfigDto({ reasoning: { modelId: 'claude-sonnet-4-5', updatedAt: T0 } }));
    render(<ModelConfigContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to Defaults' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent(/models, fallbacks, temperature, max tokens and ceilings/i);
    expect(dialog).toHaveTextContent(/rate-limit overrides are kept/i);
    expect(dialog).toHaveTextContent(/claude-sonnet-4-5/);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(h.reset.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.reset.mutateAsync.mock.calls[0][0]).toEqual({
      expected: {
        scoring: null,
        qualification: null,
        email: null,
        reasoning: T0,
        structured: null,
        rag: null,
      },
      acknowledgeDowngrade: true,
    });
  });

  it('is view-only for readers', () => {
    load(modelConfigDto({}, { canManage: false }));
    render(<ModelConfigContent />);
    expect(screen.getByRole('note', { name: 'View-only access' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reset to Defaults' })).toBeNull();
    expect(within(region('Email')).getByLabelText('Max tokens')).toBeDisabled();
  });
});
