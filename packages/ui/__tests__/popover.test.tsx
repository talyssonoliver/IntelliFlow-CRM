// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '../src/components/popover';

describe('Popover', () => {
  it('opens popover content on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Open Popover</PopoverTrigger>
        <PopoverContent>
          <p>Popover Body</p>
        </PopoverContent>
      </Popover>
    );

    await user.click(screen.getByRole('button', { name: 'Open Popover' }));
    expect(screen.getByText('Popover Body')).toBeInTheDocument();
  });

  it('allows custom alignment and class names', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Show</PopoverTrigger>
        <PopoverContent align="end" sideOffset={12} className="custom-class">
          <span>Aligned Content</span>
        </PopoverContent>
        <PopoverAnchor data-testid="anchor" />
      </Popover>
    );

    await user.click(screen.getByRole('button', { name: 'Show' }));
    const content = screen.getByText('Aligned Content').parentElement;
    expect(content).toHaveClass('w-72', 'custom-class');
  });
});
