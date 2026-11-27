// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SystemUpdatesGroup } from '../SystemUpdatesGroup';

const entries = (
  <>
    <div data-activity-id="sys-1">COA stage moved</div>
    <div data-activity-id="sys-2">Lead scored</div>
  </>
);

describe('SystemUpdatesGroup', () => {
  it('starts folded and opens on click', () => {
    render(<SystemUpdatesGroup count={2}>{entries}</SystemUpdatesGroup>);
    const toggle = screen.getByRole('button', { name: /System updates \(2\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('COA stage moved')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('COA stage moved')).toBeInTheDocument();
  });

  it('opens by itself when a link points at one of its entries', () => {
    render(
      <SystemUpdatesGroup count={2} deepLinkedId="sys-2">
        {entries}
      </SystemUpdatesGroup>
    );
    expect(screen.getByRole('button', { name: /System updates \(2\)/ })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText('Lead scored')).toBeInTheDocument();
  });

  it('renders nothing when there are no system updates', () => {
    const { container } = render(<SystemUpdatesGroup count={0}>{entries}</SystemUpdatesGroup>);
    expect(container).toBeEmptyDOMElement();
  });
});
