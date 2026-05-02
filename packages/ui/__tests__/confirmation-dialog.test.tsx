// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ConfirmationDialog } from '../src/components/confirmation-dialog';

describe('ConfirmationDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    title: 'Confirm Action',
    description: 'Are you sure you want to proceed?',
    onConfirm: vi.fn(),
  };

  it('renders when open', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
  });

  it('renders default confirm and cancel labels', () => {
    render(<ConfirmationDialog {...defaultProps} />);
    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('renders custom confirm and cancel labels', () => {
    render(<ConfirmationDialog {...defaultProps} confirmLabel="Delete" cancelLabel="Dismiss" />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
    expect(screen.getByText('Dismiss')).toBeInTheDocument();
  });

  it('renders with icon', () => {
    render(<ConfirmationDialog {...defaultProps} icon="delete" />);
    expect(screen.getByText('delete')).toBeInTheDocument();
  });

  it('renders destructive variant', () => {
    render(<ConfirmationDialog {...defaultProps} variant="destructive" icon="warning" />);
    expect(screen.getByText('warning')).toBeInTheDocument();
  });

  it('renders loading state', () => {
    render(<ConfirmationDialog {...defaultProps} isLoading />);
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('calls onConfirm when confirm button clicked', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ConfirmationDialog {...defaultProps} onConfirm={onConfirm} onOpenChange={onOpenChange} />
    );
    await user.click(screen.getByText('Confirm'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('does not render when closed', () => {
    render(<ConfirmationDialog {...defaultProps} open={false} />);
    expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
  });

  it('disables buttons when loading', () => {
    render(<ConfirmationDialog {...defaultProps} isLoading />);
    const cancelButton = screen.getByText('Cancel');
    expect(cancelButton).toBeDisabled();
  });
});
