import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LeadAvatar } from '../LeadAvatar';
import type { Lead } from '@/lib/leads/lead-types';

const lead = (overrides: Partial<Lead>): Lead => ({
  id: 'l',
  email: 'x@example.invalid',
  firstName: null,
  lastName: null,
  company: null,
  title: null,
  status: 'NEW',
  score: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('LeadAvatar', () => {
  it('shows a person lead its initials', () => {
    render(<LeadAvatar lead={lead({ firstName: 'Alice', lastName: 'Anderson' })} />);
    const avatar = screen.getByLabelText('Avatar for Alice Anderson');
    expect(avatar.textContent).toBe('AA');
  });

  it("shows a company-only lead the company's initials", () => {
    render(<LeadAvatar lead={lead({ company: 'Blue Fern Studio' })} />);
    expect(screen.getByLabelText('Avatar for Blue Fern Studio').textContent).not.toBe('?');
  });

  it('gives the same person the same colour every time', () => {
    const { container, rerender } = render(
      <LeadAvatar lead={lead({ firstName: 'Ann', lastName: 'Lee' })} />
    );
    const first = container.firstElementChild?.className;
    rerender(<LeadAvatar lead={lead({ firstName: 'Ann', lastName: 'Lee', company: 'Other' })} />);
    expect(container.firstElementChild?.className).toBe(first);
  });
});
