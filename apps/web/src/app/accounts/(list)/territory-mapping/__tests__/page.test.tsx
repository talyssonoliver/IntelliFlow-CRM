/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../TerritoryMappingContent', () => ({
  default: () => <div data-testid="territory-mapping-content" />,
}));

import TerritoryMappingPage from '../page';
import { TerritoryMappingLoading } from '../TerritoryMappingLoading';

describe('/accounts/territory-mapping page', () => {
  it('renders the territory mapping content, not the old stub', () => {
    const { container } = render(<TerritoryMappingPage />);
    expect(screen.getByTestId('territory-mapping-content')).toBeDefined();
    expect(container.textContent).not.toMatch(/coming soon/i);
  });

  it('has a skeleton that mirrors the bento grid', () => {
    const { container } = render(<TerritoryMappingLoading />);
    expect(screen.getByLabelText('Loading territory mapping')).toBeDefined();
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
  });
});
