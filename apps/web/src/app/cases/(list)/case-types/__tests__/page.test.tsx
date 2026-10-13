/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../CaseTypesContent', () => ({
  default: () => <div data-testid="case-types-content" />,
}));

import CaseTypesPage from '../page';
import { CaseTypesLoading } from '../CaseTypesLoading';

describe('/cases/case-types page', () => {
  it('renders the case types content, not the old "coming soon" stub', () => {
    const { container } = render(<CaseTypesPage />);
    expect(screen.getByTestId('case-types-content')).toBeDefined();
    expect(container.textContent).not.toMatch(/coming soon/i);
  });

  it('has a busy skeleton that mirrors the bento grid', () => {
    const { container } = render(<CaseTypesLoading />);
    expect(screen.getByRole('status').textContent).toBe('Loading case types');
    expect((container.firstChild as HTMLElement).getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
    expect(container.querySelector('.lg\\:col-span-8')).not.toBeNull();
    expect(container.querySelector('.lg\\:col-span-4')).not.toBeNull();
  });
});
