/**
 * @vitest-environment jsdom
 *
 * RefreshButton ignores clicks while a refresh is running or when disabled. This used to be
 * tested as a copied one-liner in StatusTrackerLogic.test.ts (#1216).
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RefreshButton } from '../../components/tracking/shared';

describe('RefreshButton', () => {
  it('runs one refresh at a time', async () => {
    let finish!: () => void;
    const onRefresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    render(<RefreshButton onRefresh={onRefresh} />);
    const button = screen.getByRole('button');

    fireEvent.click(button);
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    fireEvent.click(button);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('does nothing while disabled', () => {
    const onRefresh = vi.fn(async () => {});
    render(<RefreshButton onRefresh={onRefresh} disabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
