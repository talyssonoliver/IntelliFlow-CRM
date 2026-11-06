/**
 * @vitest-environment happy-dom
 *
 * After a successful MFA check the component navigates to `?redirect=`. That value
 * comes from the URL, so it runs through the real same-site check here (the
 * validators are not mocked): only a page on this site is used, anything else
 * lands on the redirectUrl the caller passed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ search: '', push: vi.fn() }));

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: (string | undefined)[]) => args.filter(Boolean).join(' '),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(h.search),
}));

const mockVerify = vi.fn();
vi.mock('@/lib/trpc', () => ({
  trpc: {
    auth: {
      verifyMfa: { useMutation: () => ({ mutateAsync: mockVerify, isPending: false }) },
      resendMfaCode: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));

// The code-entry widget only needs to call back with a valid code.
vi.mock('@/components/auth/mfa-challenge', () => ({
  MfaChallenge: ({
    onVerify,
  }: Readonly<{ onVerify: (c: string, m: string) => Promise<boolean> }>) => (
    <button type="button" onClick={() => onVerify('123456', 'totp')}>
      Verify
    </button>
  ),
}));

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MfaVerification } from '../mfa-verification';

async function verifyWith(search: string, redirectUrl = '/dashboard'): Promise<void> {
  h.search = search;
  render(
    <MfaVerification challengeId="challenge-1" redirectUrl={redirectUrl} onSuccess={vi.fn()} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }));
  await waitFor(() => expect(h.push).toHaveBeenCalledTimes(1));
}

describe('MfaVerification redirect after a successful check', () => {
  beforeEach(() => {
    h.push.mockReset();
    mockVerify.mockReset();
    mockVerify.mockResolvedValue({ success: true });
  });

  it('goes to a page on this site with its query', async () => {
    await verifyWith(`redirect=${encodeURIComponent('/deals/abc123?tab=notes')}`);

    expect(h.push).toHaveBeenCalledWith('/deals/abc123?tab=notes');
  });

  it.each([
    ['a script URL', 'javascript:alert(document.domain)'],
    ['another site', 'https://evil.example.invalid/phish'],
    ['a protocol-relative URL', '//evil.example.invalid'],
    ['a backslash trick', '/\\evil.example.invalid'],
    ['a tab trick', '/\t/evil.example.invalid'],
    ['dot segments that normalise off-site', '/.//evil.example.invalid'],
  ])('lands on the default for %s', async (_label, redirect) => {
    await verifyWith(`redirect=${encodeURIComponent(redirect)}`);

    expect(h.push).toHaveBeenCalledWith('/dashboard');
  });

  it('uses the default when there is no redirect', async () => {
    await verifyWith('');

    expect(h.push).toHaveBeenCalledWith('/dashboard');
  });

  it('checks the caller-supplied default too', async () => {
    h.search = '';
    render(
      <MfaVerification
        challengeId="challenge-1"
        redirectUrl="https://evil.example.invalid"
        onSuccess={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(mockVerify).toHaveBeenCalled());
    expect(h.push).not.toHaveBeenCalled();
  });
});
