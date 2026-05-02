// @vitest-environment jsdom
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from '../src/components/sheet';

describe('Sheet', () => {
  it('renders trigger and opens sheet', () => {
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet Description</SheetDescription>
          </SheetHeader>
          <SheetFooter>
            <button type="button">Close</button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  it('renders SheetHeader', () => {
    render(<SheetHeader data-testid="header">Header Content</SheetHeader>);
    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByText('Header Content')).toBeInTheDocument();
  });

  it('renders SheetFooter', () => {
    render(<SheetFooter data-testid="footer">Footer Content</SheetFooter>);
    expect(screen.getByTestId('footer')).toBeInTheDocument();
  });

  it('renders SheetTitle', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>My Title</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText('My Title')).toBeInTheDocument();
  });

  it('renders SheetDescription', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
          <SheetDescription>My Description</SheetDescription>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText('My Description')).toBeInTheDocument();
  });

  it('renders left-side sheet', () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetTitle>Left Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText('Left Sheet')).toBeInTheDocument();
  });

  it('renders top-side sheet', () => {
    render(
      <Sheet open>
        <SheetContent side="top">
          <SheetTitle>Top Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText('Top Sheet')).toBeInTheDocument();
  });

  it('renders bottom-side sheet', () => {
    render(
      <Sheet open>
        <SheetContent side="bottom">
          <SheetTitle>Bottom Sheet</SheetTitle>
        </SheetContent>
      </Sheet>
    );
    expect(screen.getByText('Bottom Sheet')).toBeInTheDocument();
  });
});
