// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ConversionRateWidget } from '../ConversionRateWidget';

describe('ConversionRateWidget', () => {
  it('renders conversion rate and progress bar', () => {
    const { container } = render(<ConversionRateWidget />);

    expect(screen.getByText('Conversion Rate')).toBeInTheDocument();
    expect(screen.getByText('3.2%')).toBeInTheDocument();
    const progress = container.querySelector('.bg-amber-500') as HTMLElement;
    expect(progress.style.width).toBe('65%');
  });
});
