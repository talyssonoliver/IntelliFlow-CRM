// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../src/components/hover-card';

describe('HoverCard', () => {
  it('renders trigger', () => {
    render(
      <HoverCard>
        <HoverCardTrigger>Hover me</HoverCardTrigger>
        <HoverCardContent>Card content</HoverCardContent>
      </HoverCard>
    );
    expect(screen.getByText('Hover me')).toBeInTheDocument();
  });

  it('renders with custom className on content', () => {
    render(
      <HoverCard open>
        <HoverCardTrigger>Trigger</HoverCardTrigger>
        <HoverCardContent className="custom-class">Content</HoverCardContent>
      </HoverCard>
    );
    expect(screen.getByText('Trigger')).toBeInTheDocument();
  });
});
