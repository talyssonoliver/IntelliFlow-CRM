/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { SignaturesLoading } from '../SignaturesLoading';

describe('SignaturesLoading', () => {
  it('announces loading', () => {
    const { container } = render(<SignaturesLoading />);
    expect(screen.getByText('Loading signatures')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true');
  });

  it('has no axe violations', async () => {
    const { container } = render(<SignaturesLoading />);
    expect((await axe.run(container)).violations).toEqual([]);
  });
});
