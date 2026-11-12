import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoActionsEmptyState } from '../NoActionsEmptyState';

describe('NoActionsEmptyState', () => {
  it('offers no control when no filter is set', () => {
    render(<NoActionsEmptyState filtered={false} onClearFilters={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('clears the filter when one is set', () => {
    const onClearFilters = vi.fn();
    render(<NoActionsEmptyState filtered onClearFilters={onClearFilters} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });
});
