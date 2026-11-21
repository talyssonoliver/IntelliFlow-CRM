// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WidgetHeader } from '../WidgetHeader';

describe('WidgetHeader (owner 21/11: one header for every dashboard card)', () => {
  it('renders the title as a heading that never breaks across lines', () => {
    render(<WidgetHeader title="Upcoming Tasks" />);
    const h = screen.getByRole('heading', { name: 'Upcoming Tasks' });
    expect(h).toHaveClass('whitespace-nowrap', 'text-lg', 'font-semibold');
  });

  it('moves the actions under the title as one group when the column is narrow', () => {
    render(<WidgetHeader title="Recent Activity" actions={<a href="/activity">View All</a>} />);
    expect(screen.getByTestId('widget-header')).toHaveClass('flex-wrap', 'justify-between');
    const group = screen.getByRole('link', { name: 'View All' }).parentElement!;
    expect(group).toHaveClass('ml-auto', 'shrink-0', 'whitespace-nowrap');
  });

  it('keeps a widget’s own title style, icon and spacing', () => {
    render(
      <WidgetHeader
        title="Pending Tasks"
        icon="check_circle"
        titleClassName="font-bold text-foreground"
        className="mb-4"
      />
    );
    const h = screen.getByRole('heading', { name: /Pending Tasks/ });
    expect(h).toHaveClass('font-bold');
    expect(h.querySelector('.material-symbols-outlined')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('widget-header')).toHaveClass('mb-4');
  });

  it('draws no actions group when there are none, false or 0', () => {
    for (const actions of [undefined, false, 0]) {
      const { unmount } = render(<WidgetHeader title="Deals Won" actions={actions} />);
      const header = screen.getByTestId('widget-header');
      expect(header.children).toHaveLength(1);
      expect(header).not.toHaveTextContent('0');
      unmount();
    }
  });
});
