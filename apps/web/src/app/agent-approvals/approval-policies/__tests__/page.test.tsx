/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../ApprovalPoliciesContent', () => ({
  default: () => <div data-testid="approval-policies-content">content</div>,
}));

import ApprovalPoliciesPage from '../page';
import { ApprovalPoliciesLoading } from '../ApprovalPoliciesLoading';

describe('ApprovalPoliciesPage (PG-198)', () => {
  it('renders the real settings content, not the old "coming soon" stub', () => {
    render(<ApprovalPoliciesPage />);
    expect(screen.getByTestId('approval-policies-content')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('has a loading skeleton that mirrors the 12-column bento', () => {
    const { container } = render(<ApprovalPoliciesLoading />);
    expect(screen.getByLabelText('Loading approval policies')).toHaveAttribute('aria-busy', 'true');
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
    expect(container.querySelectorAll('.lg\\:col-span-6')).toHaveLength(2);
    expect(container.querySelectorAll('.lg\\:col-span-12')).toHaveLength(1);
  });
});
