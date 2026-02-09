import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge, REVIEW_STATUS_CONFIG } from '../src/components/status-badge';

describe('StatusBadge with type="review"', () => {
  it('renders "Pending" with muted variant for PENDING', () => {
    render(<StatusBadge status="PENDING" type="review" />);
    expect(screen.getByText('Pending')).toBeDefined();
  });

  it('renders "In Review" with info variant for IN_REVIEW', () => {
    render(<StatusBadge status="IN_REVIEW" type="review" />);
    expect(screen.getByText('In Review')).toBeDefined();
  });

  it('renders "Approved" with success variant for APPROVED', () => {
    render(<StatusBadge status="APPROVED" type="review" />);
    expect(screen.getByText('Approved')).toBeDefined();
  });

  it('renders "Rejected" with destructive variant for REJECTED', () => {
    render(<StatusBadge status="REJECTED" type="review" />);
    expect(screen.getByText('Rejected')).toBeDefined();
  });

  it('renders "Escalated" with warning variant for ESCALATED', () => {
    render(<StatusBadge status="ESCALATED" type="review" />);
    expect(screen.getByText('Escalated')).toBeDefined();
  });

  it('renders "Expired" with muted variant for EXPIRED', () => {
    render(<StatusBadge status="EXPIRED" type="review" />);
    expect(screen.getByText('Expired')).toBeDefined();
  });

  it('renders correct icons when showIcon=true', () => {
    const { container } = render(
      <StatusBadge status="APPROVED" type="review" showIcon />,
    );
    const iconSpan = container.querySelector('.material-symbols-outlined');
    expect(iconSpan?.textContent).toBe('check_circle');
  });

  it('exports REVIEW_STATUS_CONFIG with all 6 statuses', () => {
    expect(Object.keys(REVIEW_STATUS_CONFIG)).toHaveLength(6);
    expect(REVIEW_STATUS_CONFIG).toHaveProperty('PENDING');
    expect(REVIEW_STATUS_CONFIG).toHaveProperty('IN_REVIEW');
    expect(REVIEW_STATUS_CONFIG).toHaveProperty('APPROVED');
    expect(REVIEW_STATUS_CONFIG).toHaveProperty('REJECTED');
    expect(REVIEW_STATUS_CONFIG).toHaveProperty('ESCALATED');
    expect(REVIEW_STATUS_CONFIG).toHaveProperty('EXPIRED');
  });

  it('falls back to status string for unknown review status', () => {
    render(<StatusBadge status="UNKNOWN_STATUS" type="review" />);
    expect(screen.getByText('UNKNOWN STATUS')).toBeDefined();
  });
});
