/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// IFC-248: isolation test for the thin client-island wrapper — LeadList is
// stubbed so this exercises ONLY the wrapper's prop forwarding (the full
// LeadList behaviour is covered by lead-list.test.tsx).
const { leadListProps } = vi.hoisted(() => ({ leadListProps: vi.fn() }));

vi.mock('@/components/leads/lead-list', () => ({
  default: (props: { initialData?: unknown }) => {
    leadListProps(props);
    return <div data-testid="lead-list-stub" />;
  },
}));

import LeadsPageClient from '../LeadsPageClient';

describe('LeadsPageClient', () => {
  beforeEach(() => {
    leadListProps.mockReset();
  });

  it('renders the LeadList island', () => {
    render(<LeadsPageClient />);
    expect(screen.getByTestId('lead-list-stub')).toBeTruthy();
  });

  it('forwards initialData through to LeadList', () => {
    const initialData = { data: [], total: 0, hasMore: false };
    render(<LeadsPageClient initialData={initialData} />);
    expect(leadListProps).toHaveBeenCalledWith(expect.objectContaining({ initialData }));
  });

  it('passes undefined initialData when none is provided', () => {
    render(<LeadsPageClient />);
    expect(leadListProps).toHaveBeenCalledWith(expect.objectContaining({ initialData: undefined }));
  });
});
