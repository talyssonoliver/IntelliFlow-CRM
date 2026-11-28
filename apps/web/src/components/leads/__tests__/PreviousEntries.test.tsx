import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PreviousEntries } from '../PreviousEntries';

describe('PreviousEntries', () => {
  it('stays folded by default and shows the count', () => {
    render(
      <PreviousEntries count={2}>
        <p>older email</p>
      </PreviousEntries>
    );
    expect(screen.getByRole('button', { name: /See previous \(2\)/ })).toBeInTheDocument();
    expect(screen.queryByText('older email')).toBeNull();
  });

  // Codex review 26/11: "Open" on the Emails tab must reach an email folded under a newer one.
  it('opens when forceOpen turns true', () => {
    const { rerender } = render(
      <PreviousEntries count={1}>
        <p>older email</p>
      </PreviousEntries>
    );
    rerender(
      <PreviousEntries count={1} forceOpen>
        <p>older email</p>
      </PreviousEntries>
    );
    expect(screen.getByText('older email')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hide previous' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });
});
