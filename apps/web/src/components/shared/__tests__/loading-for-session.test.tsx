/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { LoadingForSession } from '../loading-for-session';
import HomeLoading from '@/app/(public)/(home)/loading';
import RootLoading from '@/app/loading';

const tokenExpiringIn = (seconds: number) => {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + seconds;
  return [part({ alg: 'HS256' }), part({ exp }), 'not-signed'].join('.');
};
const setToken = (token: string) => {
  document.cookie = `accessToken=${token}; path=/`;
};

describe('LoadingForSession', () => {
  afterEach(() => {
    document.cookie = 'accessToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  const portal = <div data-testid="portal-shape" />;

  it('shows the neutral splash with no session', () => {
    render(<LoadingForSession>{portal}</LoadingForSession>);

    expect(screen.getByTestId('neutral-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('portal-shape')).not.toBeInTheDocument();
  });

  it('shows the Aurora logo on the splash', () => {
    render(<LoadingForSession>{portal}</LoadingForSession>);

    expect(screen.getByRole('img', { name: 'Aurora' })).toHaveAttribute(
      'src',
      '/brand/aurora/aurora-wordmark.webp'
    );
  });

  it('shows the neutral splash for an expired token', () => {
    setToken(tokenExpiringIn(-60));

    render(<LoadingForSession>{portal}</LoadingForSession>);

    expect(screen.queryByTestId('portal-shape')).not.toBeInTheDocument();
  });

  it('keeps the portal shape with a session', () => {
    setToken(tokenExpiringIn(3600));

    render(<LoadingForSession>{portal}</LoadingForSession>);

    expect(screen.getByTestId('portal-shape')).toBeInTheDocument();
    expect(screen.queryByTestId('neutral-loading')).not.toBeInTheDocument();
  });

  it('sends the neutral splash from the server, where the session is not known', () => {
    setToken(tokenExpiringIn(3600));

    const html = renderToString(<LoadingForSession>{portal}</LoadingForSession>);

    expect(html).toContain('neutral-loading');
    expect(html).toContain('aurora-wordmark');
    expect(html).not.toContain('portal-shape');
  });
});

describe.each([
  ['(home)/loading', HomeLoading],
  ['app/loading', RootLoading],
])('%s', (_name, Loading) => {
  it('shows no portal shape with no session', () => {
    const { container } = render(<Loading />);

    expect(screen.getByTestId('neutral-loading')).toBeInTheDocument();
    expect(container.querySelector('.bg-gradient-to-r')).toBeNull();
  });
});
