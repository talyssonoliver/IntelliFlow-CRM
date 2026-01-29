// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OpenTicketsWidget } from '../OpenTicketsWidget';

describe('OpenTicketsWidget', () => {
  it('renders ticket metrics after load', async () => {
    render(<OpenTicketsWidget />);

    expect(screen.getByText('Open Tickets')).toBeInTheDocument();
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(await screen.findByText(/3 Urgent/)).toBeInTheDocument();
    expect(await screen.findByText(/SLA breach/)).toHaveTextContent('1 SLA breach');
  });
});
