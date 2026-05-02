// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Toaster } from '../src/components/toaster';
import { toast } from '../src/hooks/use-toast';

describe('Toaster', () => {
  it('renders without crashing', () => {
    // Toaster renders a ToastProvider with a viewport — just ensure it mounts
    const { container } = render(<Toaster />);
    expect(container).toBeInTheDocument();
  });

  it('renders toast viewport', () => {
    render(<Toaster />);
    // ToastViewport is rendered as an ordered list
    const viewport = document.querySelector('ol');
    expect(viewport).toBeDefined();
  });

  it('renders active toast title when a toast is shown', async () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'Hello Toast', description: 'A test description' });
    });
    // The toast title should appear in the viewport
    expect(screen.getByText('Hello Toast')).toBeInTheDocument();
    expect(screen.getByText('A test description')).toBeInTheDocument();
  });

  it('renders toast without description', async () => {
    render(<Toaster />);
    act(() => {
      toast({ title: 'No Description Toast' });
    });
    expect(screen.getByText('No Description Toast')).toBeInTheDocument();
  });
});
