/**
 * The signed-in home moved out of `(public)/`, so it carries its own layout and
 * error boundary. These keep both behaving as they did under the public layout.
 */
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PublicError from '@/app/(public)/error';
import { PublicLayoutShell } from '@/app/(public)/_components/PublicLayoutShell';
import SignedInHomeError from '../error';
import SignedInHomeLayout from '../layout';

const getAccessToken = vi.hoisted(() => vi.fn());

vi.mock('@/lib/trpc-server', () => ({ getAccessToken }));
vi.mock('@/components/aurora-site/fonts', () => ({ manrope: { variable: 'manrope' } }));
vi.mock('@/components/aurora-site/AuroraSiteFooter', () => ({ AuroraSiteFooter: () => null }));
vi.mock('@/app/(public)/_components/PublicLayoutShell', () => ({ PublicLayoutShell: () => null }));

async function shellProps() {
  const tree = (await SignedInHomeLayout({ children: 'home' })) as React.ReactElement<{
    children: React.ReactElement<{ isAuthenticated: boolean; footer?: React.ReactNode }>;
  }>;
  const shell = tree.props.children;
  expect(shell.type).toBe(PublicLayoutShell);
  return shell.props;
}

describe('signed-in home route files', () => {
  beforeEach(() => getAccessToken.mockReset());

  it('drops the public footer when the request carries a token', async () => {
    getAccessToken.mockResolvedValue('t');

    const props = await shellProps();

    expect(props.isAuthenticated).toBe(true);
    expect(props.footer).toBeUndefined();
  });

  it('keeps the public footer without a token', async () => {
    getAccessToken.mockResolvedValue(null);

    const props = await shellProps();

    expect(props.isAuthenticated).toBe(false);
    expect(props.footer).toBeDefined();
  });

  it('uses the public error boundary', () => {
    expect(SignedInHomeError).toBe(PublicError);
  });
});
