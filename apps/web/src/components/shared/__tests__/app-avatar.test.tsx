// @vitest-environment jsdom
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppAvatar } from '../app-avatar';

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: Array<string | undefined | null | false>) => args.filter(Boolean).join(' '),
}));

describe('AppAvatar', () => {
  it('renders initials when no source is provided', () => {
    render(<AppAvatar name="Sarah Jenkins" />);

    expect(screen.getByText('SJ')).toBeInTheDocument();
  });

  it('uses non-image source value as fallback label', () => {
    render(<AppAvatar name="Sarah Jenkins" src="S" />);

    expect(screen.getByText('S')).toBeInTheDocument();
  });

  it('proxies known external avatar hosts before rendering image source', () => {
    const raw =
      'https://lh3.googleusercontent.com/a/ACg8ocI1tAWmpksfd_bBrwfQ3yUxXxjaOpMU2BTlBd32zDO0WQIG9IDGWA=s96-c';
    const encoded = encodeURIComponent(raw);

    render(<AppAvatar name="Sarah Jenkins" src={raw} />);

    expect(screen.getByRole('img', { name: 'Sarah Jenkins' })).toHaveAttribute(
      'src',
      `/api/avatar-proxy?src=${encoded}`
    );
  });

  it('prefers explicit fallbackText over derived initials', () => {
    render(<AppAvatar name="Sarah Jenkins" fallbackText="Agent" />);

    expect(screen.getByText('Agent')).toBeInTheDocument();
  });
});
