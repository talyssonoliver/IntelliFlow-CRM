/**
 * @vitest-environment jsdom
 *
 * PG-199 BYOK - "Your own AI key" section: every state, the masked display (the key is never
 * in the page), save / test / remove / fallback, and the one-line buttons. Radix Select is the
 * native stand-in. The fake key is built at runtime from repeated characters.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const FAKE_KEY = 'q'.repeat(12) + 'w'.repeat(12) + 'abcd';

const h = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    error: null as null | { message: string; data?: { code: string } },
  },
  refetch: vi.fn(),
  invalidate: vi.fn(),
  toast: vi.fn(),
  set: { mutateAsync: vi.fn(), isPending: false, reset: vi.fn() },
  test: { mutateAsync: vi.fn(), isPending: false, reset: vi.fn() },
  options: { mutateAsync: vi.fn(), isPending: false },
  remove: { mutateAsync: vi.fn(), isPending: false },
}));

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
  toast: h.toast,
}));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ aiProviderKey: { get: { invalidate: h.invalidate } } }),
    aiProviderKey: {
      get: { useQuery: () => ({ ...h.query, refetch: h.refetch }) },
      set: { useMutation: () => h.set },
      test: { useMutation: () => h.test },
      setOptions: { useMutation: () => h.options },
      remove: { useMutation: () => h.remove },
    },
  },
}));

import { OwnKeySection } from '../OwnKeySection';

const STORED = {
  provider: 'openai',
  last4: 'abcd',
  status: 'ACTIVE',
  statusDetail: null,
  allowFallback: false,
  createdAt: '2026-11-20T10:00:00.000Z',
  lastUsedAt: null,
};

function load(data: unknown) {
  h.query = { data, isLoading: false, error: null };
}

const keyInput = () => screen.getByLabelText('API key') as HTMLInputElement;
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.clearAllMocks();
  h.set = {
    mutateAsync: vi.fn().mockResolvedValue({ key: STORED }),
    isPending: false,
    reset: vi.fn(),
  };
  h.test = {
    mutateAsync: vi
      .fn()
      .mockResolvedValue({ ok: true, message: 'The provider accepted this key.', key: null }),
    isPending: false,
    reset: vi.fn(),
  };
  h.options = { mutateAsync: vi.fn().mockResolvedValue({ key: STORED }), isPending: false };
  h.remove = { mutateAsync: vi.fn().mockResolvedValue({ removed: true }), isPending: false };
  h.invalidate.mockResolvedValue(undefined);
  load({ canManage: true, key: null });
});

describe('OwnKeySection - states', () => {
  it('shows a loading line while the settings load', () => {
    h.query = { data: undefined, isLoading: true, error: null };
    render(<OwnKeySection />);
    expect(screen.getByRole('status').textContent).toContain('Loading');
  });

  it('shows the error and a Retry that refetches', () => {
    h.query = { data: undefined, isLoading: false, error: { message: 'boom' } };
    render(<OwnKeySection />);
    expect(screen.getByRole('alert').textContent).toContain('boom');
    fireEvent.click(button('Retry'));
    expect(h.refetch).toHaveBeenCalled();
  });

  it('renders nothing on an API that has no aiProviderKey procedures (NOT_FOUND)', () => {
    h.query = {
      data: undefined,
      isLoading: false,
      error: { message: 'x', data: { code: 'NOT_FOUND' } },
    };
    const { container } = render(<OwnKeySection />);
    expect(container.innerHTML).toBe('');
  });

  it('tells a non-admin it is view-only and shows no key controls', () => {
    load({ canManage: false, key: null });
    render(<OwnKeySection />);
    expect(screen.getByRole('note', { name: 'View-only access' })).toBeTruthy();
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save key' })).toBeNull();
  });

  it('shows the empty form: provider select, password key field, fallback off, Save disabled', () => {
    render(<OwnKeySection />);
    expect(screen.getByRole('heading', { name: 'Your own AI key' })).toBeTruthy();
    expect(keyInput().type).toBe('password');
    expect(keyInput().autocomplete).toBe('off');
    const provider = screen.getByLabelText('Provider') as HTMLSelectElement;
    expect(Array.from(provider.options).map((o) => o.value)).toEqual([
      'anthropic',
      'openai',
      'google',
      'openrouter',
    ]);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((button('Save key') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Test') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('OwnKeySection - stored key', () => {
  it('shows provider, last 4, status and dates - and never the key', () => {
    load({ canManage: true, key: STORED });
    const { container } = render(<OwnKeySection />);
    const stored = screen.getByTestId('own-key-stored');
    expect(stored.textContent).toContain('OpenAI');
    expect(stored.textContent).toContain('•••• abcd');
    expect(stored.textContent).toContain('Active');
    expect(stored.textContent).toContain('Last used never');
    expect(container.innerHTML).not.toContain(FAKE_KEY);
    expect(screen.queryByLabelText('API key')).toBeNull();
    expect(button('Replace')).toBeTruthy();
    expect(button('Test')).toBeTruthy();
    expect(button('Remove')).toBeTruthy();
  });

  it.each([
    ['INVALID', 'Rejected by provider'],
    ['RATE_LIMITED', 'Rate limited'],
    ['QUOTA_EXCEEDED', 'No quota left'],
  ])('shows the %s status with its reason', (status, label) => {
    load({ canManage: true, key: { ...STORED, status, statusDetail: 'Some reason.' } });
    render(<OwnKeySection />);
    expect(screen.getByTestId('own-key-stored').textContent).toContain(label);
    expect(screen.getByText('Some reason.')).toBeTruthy();
  });

  it('toggles the fallback switch through setOptions', async () => {
    load({ canManage: true, key: STORED });
    render(<OwnKeySection />);
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() =>
      expect(h.options.mutateAsync).toHaveBeenCalledWith({ allowFallback: true })
    );
    expect(h.invalidate).toHaveBeenCalled();
  });

  it('Test with nothing typed re-checks the stored key and refreshes', async () => {
    load({ canManage: true, key: STORED });
    h.test.mutateAsync.mockResolvedValue({
      ok: false,
      message: 'The provider did not accept this key.',
      key: STORED,
    });
    render(<OwnKeySection />);
    fireEvent.click(button('Test'));
    await waitFor(() => expect(h.test.mutateAsync).toHaveBeenCalledWith(null));
    expect(
      (await screen.findByText('The provider did not accept this key.')).textContent
    ).toBeTruthy();
    expect(h.invalidate).toHaveBeenCalled();
  });

  it('Replace opens the form; Cancel closes it and clears what was typed', () => {
    load({ canManage: true, key: STORED });
    render(<OwnKeySection />);
    fireEvent.click(button('Replace'));
    fireEvent.change(keyInput(), { target: { value: FAKE_KEY } });
    fireEvent.click(button('Cancel'));
    expect(screen.queryByLabelText('API key')).toBeNull();
    fireEvent.click(button('Replace'));
    expect(keyInput().value).toBe('');
  });

  it('removes only after the confirmation', async () => {
    load({ canManage: true, key: STORED });
    render(<OwnKeySection />);
    fireEvent.click(button('Remove'));
    expect(h.remove.mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove key' }));
    await waitFor(() => expect(h.remove.mutateAsync).toHaveBeenCalled());
    expect(await screen.findByText(/Your AI calls use the platform again/)).toBeTruthy();
  });
});

describe('OwnKeySection - save and test a typed key', () => {
  it('saves the trimmed key with the chosen provider and fallback, then clears the field', async () => {
    render(<OwnKeySection />);
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'google' } });
    fireEvent.change(keyInput(), { target: { value: `  ${FAKE_KEY}  ` } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(button('Save key'));
    await waitFor(() =>
      expect(h.set.mutateAsync).toHaveBeenCalledWith({
        provider: 'google',
        apiKey: FAKE_KEY,
        allowFallback: true,
      })
    );
    await waitFor(() => expect(keyInput().value).toBe(''));
    expect(await screen.findByText(/Key saved/)).toBeTruthy();
    expect(h.invalidate).toHaveBeenCalled();
  });

  it('shows the server error and keeps what was typed so it can be corrected', async () => {
    h.set.mutateAsync.mockRejectedValue(new Error('The provider did not accept this key.'));
    render(<OwnKeySection />);
    fireEvent.change(keyInput(), { target: { value: FAKE_KEY } });
    fireEvent.click(button('Save key'));
    expect(
      (await screen.findByText('The provider did not accept this key.')).textContent
    ).toBeTruthy();
    expect(keyInput().value).toBe(FAKE_KEY);
  });

  it('tests the typed key without saving it', async () => {
    render(<OwnKeySection />);
    fireEvent.change(keyInput(), { target: { value: FAKE_KEY } });
    fireEvent.click(button('Test'));
    await waitFor(() =>
      expect(h.test.mutateAsync).toHaveBeenCalledWith({ provider: 'anthropic', apiKey: FAKE_KEY })
    );
    expect(h.set.mutateAsync).not.toHaveBeenCalled();
    expect(await screen.findByText('The provider accepted this key.')).toBeTruthy();
  });

  it('disables every action while a write is running', () => {
    h.set = { mutateAsync: vi.fn(), isPending: true, reset: vi.fn() };
    render(<OwnKeySection />);
    expect((screen.getByLabelText('API key') as HTMLInputElement).disabled).toBe(true);
    expect((button('Saving...') as HTMLButtonElement).disabled).toBe(true);
    expect((button('Test') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('OwnKeySection - key hygiene', () => {
  it('a replacement does not send the fallback choice (the stored one is kept)', async () => {
    load({ canManage: true, key: { ...STORED, allowFallback: true } });
    render(<OwnKeySection />);
    fireEvent.click(button('Replace'));
    fireEvent.change(keyInput(), { target: { value: FAKE_KEY } });
    fireEvent.click(button('Save key'));
    await waitFor(() => expect(h.set.mutateAsync).toHaveBeenCalled());
    // Replace is for the provider already in use (the stored key is OpenAI), not the form default.
    expect(h.set.mutateAsync.mock.calls[0]![0]).toEqual({
      provider: 'openai',
      apiKey: FAKE_KEY,
    });
  });

  it('clears the typed key when the provider changes', () => {
    render(<OwnKeySection />);
    fireEvent.change(keyInput(), { target: { value: FAKE_KEY } });
    fireEvent.change(screen.getByLabelText('Provider'), { target: { value: 'openai' } });
    expect(keyInput().value).toBe('');
  });

  it('drops the mutation variables (which hold the typed key) after save and after test', async () => {
    render(<OwnKeySection />);
    fireEvent.change(keyInput(), { target: { value: FAKE_KEY } });
    fireEvent.click(button('Test'));
    await waitFor(() => expect(h.test.reset).toHaveBeenCalled());
    fireEvent.click(button('Save key'));
    await waitFor(() => expect(h.set.reset).toHaveBeenCalled());
  });
});

describe('OwnKeySection - refetch errors', () => {
  it('a failed background refetch keeps the stored key and its controls, with a small notice', () => {
    h.query = {
      data: { canManage: true, key: STORED },
      isLoading: false,
      error: { message: 'network' },
    };
    render(<OwnKeySection />);
    expect(screen.getByTestId('own-key-stored').textContent).toContain('•••• abcd');
    expect(button('Remove')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('Could not refresh');
  });
});

describe('OwnKeySection - one-line buttons from 320px', () => {
  it('every button is nowrap, 44px high, in a wrapping row', () => {
    load({ canManage: true, key: STORED });
    render(<OwnKeySection />);
    for (const name of ['Replace', 'Test', 'Remove']) {
      const cls = button(name).className;
      expect(cls).toContain('whitespace-nowrap');
      expect(cls).toContain('h-11');
    }
    expect(button('Test').parentElement?.className).toContain('flex-wrap');
  });
});
