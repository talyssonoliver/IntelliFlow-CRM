import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import DealsLayout from '../layout';

function NeedsProvider() {
  const ctx = useUnsavedChanges();
  return <p>{typeof ctx === 'object' ? 'has provider' : 'none'}</p>;
}

describe('DealsLayout', () => {
  it('wraps deal pages in the unsaved-changes provider the new-deal page needs', () => {
    render(
      <DealsLayout>
        <NeedsProvider />
      </DealsLayout>
    );
    expect(screen.getByText('has provider')).toBeTruthy();
  });
});
