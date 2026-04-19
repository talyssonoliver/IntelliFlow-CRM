import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RetentionPolicySection, type RetentionPolicyValue } from '../RetentionPolicySection';

const VALUE: RetentionPolicyValue = {
  retentionDays: 365,
  archiveInsteadOfDelete: true,
  preserveVersions: 5,
  isActive: false,
};

describe('RetentionPolicySection', () => {
  it('renders retention days input', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Retention period/i)).toBeInTheDocument();
  });

  it('renders archive switch', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Archive instead of delete/i)).toBeInTheDocument();
  });

  it('renders preserve versions input', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Versions to preserve/i)).toBeInTheDocument();
  });

  it('renders isActive switch', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Enable retention policy/i)).toBeInTheDocument();
  });

  it('disables detail inputs when policy is inactive', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Retention period/i)).toBeDisabled();
    expect(screen.getByLabelText(/Archive instead of delete/i)).toBeDisabled();
    expect(screen.getByLabelText(/Versions to preserve/i)).toBeDisabled();
  });

  it('enables detail inputs when isActive=true', () => {
    render(<RetentionPolicySection value={{ ...VALUE, isActive: true }} onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Retention period/i)).not.toBeDisabled();
  });

  it('retentionDays input has min=1 and max=3650 constraints', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    const input = screen.getByLabelText(/Retention period/i);
    expect(input).toHaveAttribute('min', '1');
    expect(input).toHaveAttribute('max', '3650');
  });

  it('preserveVersions input has min=0 and max=100 constraints', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    const input = screen.getByLabelText(/Versions to preserve/i);
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '100');
  });

  it('calls onChange when retentionDays changes', () => {
    const onChange = vi.fn();
    render(<RetentionPolicySection value={{ ...VALUE, isActive: true }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/Retention period/i), { target: { value: '180' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ retentionDays: 180 }));
  });

  it('renders section header with Retention Policy title', () => {
    render(<RetentionPolicySection value={VALUE} onChange={vi.fn()} />);
    expect(screen.getByText('Retention Policy')).toBeInTheDocument();
  });
});
