// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TeamChatWidget } from '../TeamChatWidget';

describe('TeamChatWidget', () => {
  it('renders chat messages and input', () => {
    render(<TeamChatWidget />);

    expect(screen.getByText('Team Chat')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByText('Just closed the deal with TechCorp!')).toBeInTheDocument();
  });
});
