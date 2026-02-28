import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CreateNewAppPage, { metadata } from '../page';

// Mock AppCreator to isolate server component testing
vi.mock('@/components/developer/app-creator', () => ({
  AppCreator: () => <div data-testid="app-creator">AppCreator</div>,
}));

describe('CreateNewAppPage', () => {
  it('renders without crashing (NP-001)', () => {
    render(<CreateNewAppPage />);
    expect(screen.getByTestId('app-creator')).toBeInTheDocument();
  });

  it('renders AppCreator component (NP-002)', () => {
    render(<CreateNewAppPage />);
    expect(screen.getByText('AppCreator')).toBeInTheDocument();
  });

  it('page has correct container class max-w-2xl (NP-003)', () => {
    const { container } = render(<CreateNewAppPage />);
    expect(container.querySelector('.max-w-2xl')).toBeInTheDocument();
  });

  it('metadata.title contains "Create New App" (NP-004)', () => {
    expect(metadata.title).toContain('Create New App');
  });

  it('metadata.description is a non-empty string (NP-005)', () => {
    expect(typeof metadata.description).toBe('string');
    expect((metadata.description as string).length).toBeGreaterThan(0);
  });

  it('metadata.title contains "Developer Apps" (NP-006)', () => {
    expect(metadata.title).toContain('Developer Apps');
  });

  it('metadata.title contains "IntelliFlow CRM" (NP-007)', () => {
    expect(metadata.title).toContain('IntelliFlow CRM');
  });

  it('exports metadata object', () => {
    expect(metadata).toBeDefined();
    expect(metadata).toHaveProperty('title');
    expect(metadata).toHaveProperty('description');
  });

  it('page renders flex-col layout container', () => {
    const { container } = render(<CreateNewAppPage />);
    expect(container.querySelector('.flex.flex-col')).toBeInTheDocument();
  });

  it('renders AppCreator inside max-w-2xl container', () => {
    const { container } = render(<CreateNewAppPage />);
    const narrow = container.querySelector('.max-w-2xl');
    expect(narrow).toBeInTheDocument();
    expect(narrow!.querySelector('[data-testid="app-creator"]')).toBeInTheDocument();
  });
});
