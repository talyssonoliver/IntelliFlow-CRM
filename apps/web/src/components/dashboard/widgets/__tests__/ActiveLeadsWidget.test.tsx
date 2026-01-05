// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ActiveLeadsWidget } from '../ActiveLeadsWidget';

describe('ActiveLeadsWidget', () => {
  it('shows active leads total', () => {
    render(<ActiveLeadsWidget />);

    expect(screen.getByText('Active Leads')).toBeInTheDocument();
    expect(screen.getByText('1,240')).toBeInTheDocument();
  });
});
