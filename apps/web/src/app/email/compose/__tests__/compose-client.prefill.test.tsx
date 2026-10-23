/**
 * PG-207 (owner ruling Q5, AC-EM-036, CA-7): a new message starts with the
 * default signature (user's, else the organisation's); replies and forwards
 * do not. Compose renders only once the signature (and, for a reply, the
 * original) has loaded, so nothing is injected after mount.
 *
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({ params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ push: vi.fn() }),
}));

const api = vi.hoisted(() => ({ getEmail: vi.fn(), resolveDefault: vi.fn() }));
vi.mock('@/lib/trpc', () => ({
  trpc: {
    email: { getEmail: { useQuery: (...a: unknown[]) => api.getEmail(...a) } },
    emailSignatures: {
      resolveDefault: { useQuery: (...a: unknown[]) => api.resolveDefault(...a) },
    },
  },
}));

const composeProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock('@/components/email/EmailCompose', () => ({
  EmailCompose: (props: Record<string, unknown>) => {
    composeProps.last = props;
    return <div data-testid="compose" />;
  },
}));

import { ComposeClient } from '../_compose-client';

const idle = { data: undefined, isLoading: false, isError: false };

function renderAt(query: string) {
  nav.params = new URLSearchParams(query);
  return render(<ComposeClient />);
}

beforeEach(() => {
  vi.clearAllMocks();
  composeProps.last = null;
  api.getEmail.mockReturnValue(idle);
  api.resolveDefault.mockReturnValue({
    data: { id: 'sig-1', html: '<p>Kind regards</p>' },
    isLoading: false,
    isError: false,
  });
});

describe('ComposeClient signature prefill', () => {
  it('passes the default signature to a new message', () => {
    renderAt('');
    expect(screen.getByTestId('compose')).toBeInTheDocument();
    expect(composeProps.last?.initialSignatureHtml).toBe('<p>Kind regards</p>');
    expect(api.resolveDefault).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ enabled: true })
    );
  });

  it('waits for the signature before rendering compose', () => {
    api.resolveDefault.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderAt('');
    expect(screen.queryByTestId('compose')).not.toBeInTheDocument();
    expect(screen.getByText('Preparing your message…')).toBeInTheDocument();
  });

  it('still opens compose without a signature when none exists or it fails to load', () => {
    api.resolveDefault.mockReturnValue({ data: null, isLoading: false, isError: false });
    const first = renderAt('');
    expect(composeProps.last?.initialSignatureHtml).toBeUndefined();
    first.unmount();
    api.resolveDefault.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderAt('');
    expect(screen.getByTestId('compose')).toBeInTheDocument();
    expect(composeProps.last?.initialSignatureHtml).toBeUndefined();
  });

  it.each(['reply', 'replyAll', 'forward'])(
    'does not prefill a %s and waits for the original',
    (mode) => {
      api.getEmail.mockReturnValue({ data: undefined, isLoading: true, isError: false });
      const loading = renderAt(`mode=${mode}&emailId=e1`);
      expect(screen.queryByTestId('compose')).not.toBeInTheDocument();
      expect(api.resolveDefault).toHaveBeenCalledWith(
        undefined,
        expect.objectContaining({ enabled: false })
      );
      loading.unmount();

      api.getEmail.mockReturnValue({
        data: { id: 'e1', subject: 'Hi', from: { address: 'b@example.invalid' }, to: [] },
        isLoading: false,
        isError: false,
      });
      renderAt(`mode=${mode}&emailId=e1`);
      expect(screen.getByTestId('compose')).toBeInTheDocument();
      expect(composeProps.last?.initialSignatureHtml).toBeUndefined();
    }
  );
});
