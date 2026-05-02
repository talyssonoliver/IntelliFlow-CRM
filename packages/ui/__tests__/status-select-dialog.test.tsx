// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { StatusSelectDialog, type StatusOption } from '../src/components/status-select-dialog';

const options: StatusOption[] = [
  { value: 'NEW', label: 'New', color: 'slate' },
  { value: 'CONTACTED', label: 'Contacted', color: 'blue' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'green' },
];

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  title: 'Update Status',
  description: 'Select a new status',
  options,
  onConfirm: vi.fn().mockResolvedValue(undefined),
};

describe('StatusSelectDialog', () => {
  it('renders when open', () => {
    render(<StatusSelectDialog {...defaultProps} />);
    expect(screen.getAllByText('Update Status').length).toBeGreaterThan(0);
    expect(screen.getByText('Select a new status')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<StatusSelectDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Update Status')).not.toBeInTheDocument();
  });

  it('renders all status options', () => {
    render(<StatusSelectDialog {...defaultProps} />);
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Contacted')).toBeInTheDocument();
    expect(screen.getByText('Qualified')).toBeInTheDocument();
  });

  it('selects a status when option clicked', async () => {
    const user = userEvent.setup();
    render(<StatusSelectDialog {...defaultProps} />);
    await user.click(screen.getByText('New'));
    expect(screen.getByText('check_circle')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked with selection', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<StatusSelectDialog {...defaultProps} onConfirm={onConfirm} selectedStatus="NEW" />);
    await user.click(screen.getByRole('button', { name: /Update Status|apply|confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('NEW');
  });

  it('calls onOpenChange when cancel clicked', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(<StatusSelectDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('renders itemCount when provided', () => {
    render(<StatusSelectDialog {...defaultProps} itemCount={5} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText(/items/i)).toBeInTheDocument();
  });

  it('renders singular item when itemCount is 1', () => {
    render(<StatusSelectDialog {...defaultProps} itemCount={1} />);
    expect(screen.getByText(/item/i)).toBeInTheDocument();
  });

  it('renders with option description', () => {
    const optionsWithDesc: StatusOption[] = [
      { value: 'NEW', label: 'New', description: 'Fresh lead', color: 'slate' },
    ];
    render(<StatusSelectDialog {...defaultProps} options={optionsWithDesc} />);
    expect(screen.getByText('Fresh lead')).toBeInTheDocument();
  });

  it('renders with option icon', () => {
    const optionsWithIcon: StatusOption[] = [
      { value: 'NEW', label: 'New', icon: 'fiber_new', color: 'slate' },
    ];
    render(<StatusSelectDialog {...defaultProps} options={optionsWithIcon} />);
    expect(screen.getByText('fiber_new')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<StatusSelectDialog {...defaultProps} isLoading selectedStatus="NEW" />);
    // When loading, button shows "Updating..." and is disabled
    expect(screen.getByText(/Updating/i)).toBeInTheDocument();
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    expect(cancelBtn).toBeDisabled();
  });

  it('renders with all color variants', () => {
    const colorOptions: StatusOption[] = [
      { value: 'a', label: 'Amber', color: 'amber' },
      { value: 'b', label: 'Red', color: 'red' },
      { value: 'c', label: 'Purple', color: 'purple' },
      { value: 'd', label: 'Orange', color: 'orange' },
    ];
    render(<StatusSelectDialog {...defaultProps} options={colorOptions} />);
    expect(screen.getByText('Amber')).toBeInTheDocument();
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByText('Purple')).toBeInTheDocument();
    expect(screen.getByText('Orange')).toBeInTheDocument();
  });

  it('pre-selects initial status', () => {
    render(<StatusSelectDialog {...defaultProps} selectedStatus="CONTACTED" />);
    expect(screen.getByText('check_circle')).toBeInTheDocument();
  });
});
