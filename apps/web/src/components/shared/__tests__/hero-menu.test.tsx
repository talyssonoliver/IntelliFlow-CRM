import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HeroMenu } from '../hero-menu';

const items = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

describe('HeroMenu (owner 22/11: one control for every hero dropdown)', () => {
  it('as a picker, shows the chosen item and ticks it in the menu', () => {
    const onSelect = vi.fn();
    render(
      <HeroMenu label="Period" ariaLabel="Period" items={items} value="30d" onSelect={onSelect} />
    );
    const trigger = screen.getByRole('button', { name: 'Period: Last 30 days' });
    fireEvent.click(trigger);
    const option = screen.getByRole('menuitemradio', { name: /Last 30 days/ });
    expect(option).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Last 7 days/ }));
    expect(onSelect).toHaveBeenCalledWith('7d');
  });

  it('as an action menu, keeps its own label and shows the heading', () => {
    const onSelect = vi.fn();
    render(
      <HeroMenu
        label="Export"
        variant="primary"
        heading="CSV export"
        items={[{ value: 'overview', label: 'Overview Metrics', icon: 'table_chart' }]}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByText('CSV export')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Overview Metrics/ }));
    expect(onSelect).toHaveBeenCalledWith('overview');
  });
});
