import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealWinLossCard, type DealWinLossReasonRow } from '../DealWinLossCard';

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

const reasons: DealWinLossReasonRow[] = [
  { id: 'w1', category: 'WON', label: 'Price', key: 'price', sortOrder: 0, isActive: true },
  { id: 'l1', category: 'LOST', label: 'Budget', key: 'budget', sortOrder: 0, isActive: true },
];

describe('DealWinLossCard', () => {
  it('renders WON and LOST groups', () => {
    render(
      <DealWinLossCard
        reasons={reasons}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn(async () => ({ softDeleted: false }))}
      />
    );
    expect(screen.getByText(/won reasons/i)).toBeDefined();
    expect(screen.getByText(/lost reasons/i)).toBeDefined();
    expect(screen.getByText('Price')).toBeDefined();
    expect(screen.getByText('Budget')).toBeDefined();
  });

  it('opens the Add Won Reason dialog', () => {
    render(
      <DealWinLossCard
        reasons={reasons}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn(async () => ({ softDeleted: false }))}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add won reason/i }));
    expect(screen.getByText(/add reason/i)).toBeDefined();
  });
});
