// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TeamChatWidget } from '../TeamChatWidget';

describe('TeamChatWidget', () => {
  it('renders Coming Soon state', () => {
    // TeamChatWidget was refactored to a placeholder 'Coming Soon' shell
    // (no chat messages or input field).
    render(<TeamChatWidget />);
    expect(screen.getByText('Team Chat')).toBeInTheDocument();
    expect(screen.getByText('Coming Soon')).toBeInTheDocument();
  });
});
