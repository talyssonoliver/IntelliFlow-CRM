// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ScrollArea, ScrollBar } from '../src/components/scroll-area';

describe('ScrollArea', () => {
  it('renders children inside viewport', () => {
    const { container } = render(
      <ScrollArea className="custom-scroll">
        <div>Scrollable content</div>
      </ScrollArea>
    );

    expect(screen.getByText('Scrollable content')).toBeInTheDocument();
    expect(container.querySelector('.custom-scroll')).toHaveClass('relative', 'overflow-hidden');
  });

  it('applies horizontal styles when orientation is horizontal', () => {
    render(<ScrollBar data-testid="horizontal-bar" orientation="horizontal" />);

    expect(screen.getByTestId('horizontal-bar')).toHaveClass('flex-col');
    expect(screen.getByTestId('horizontal-bar')).toHaveClass('h-2.5');
  });
});
