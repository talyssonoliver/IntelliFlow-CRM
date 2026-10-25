/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => nav.params,
  useRouter: () => ({ replace: nav.replace }),
}));

import { OAuthReturnNotice } from '../OAuthReturnNotice';

function renderWith(query: string) {
  nav.params = new URLSearchParams(query);
  return render(<OAuthReturnNotice />);
}

beforeEach(() => vi.clearAllMocks());

describe('OAuthReturnNotice', () => {
  it.each([
    ['connected=google', 'Google mailbox connected. Email you send now leaves from it.'],
    ['connected=microsoft', 'Microsoft mailbox connected. Email you send now leaves from it.'],
  ])('confirms %s as a status message and clears the query', (query, message) => {
    renderWith(query);
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(nav.replace).toHaveBeenCalledWith('/email/email-settings', { scroll: false });
  });

  it.each([
    ['error=denied', 'The sign-in was cancelled, so no mailbox was connected.'],
    ['error=expired', 'The sign-in took too long. Start again from Connect.'],
    ['error=failed', 'The mailbox could not be connected. Try again, or set it up with SMTP.'],
  ])('reports %s as an alert', (query, message) => {
    renderWith(query);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
  });

  it('renders nothing (and never echoes the query) for anything else', () => {
    const { container } = renderWith('connected=<b>evil</b>&error=%3Cscript%3E');
    expect(container).toBeEmptyDOMElement();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('renders nothing without a query', () => {
    const { container } = renderWith('');
    expect(container).toBeEmptyDOMElement();
  });

  it('can be dismissed', () => {
    renderWith('connected=google');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWith('error=denied');
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });

  it('takes focus on arrival and hands it to My mailbox when dismissed', () => {
    render(
      <h2 id="email-settings-my-mailbox-title" tabIndex={-1}>
        My mailbox
      </h2>
    );
    renderWith('connected=google');
    expect(document.activeElement).toBe(screen.getByRole('status'));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'My mailbox' }));
  });
});
