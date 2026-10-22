/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../ModelConfigContent', () => ({
  default: () => <div data-testid="model-config-content">content</div>,
}));

import ModelConfigPage from '../page';
import { ModelConfigLoading } from '../ModelConfigLoading';

describe('ModelConfigPage (PG-199)', () => {
  it('renders the real settings content, not the old "coming soon" stub', () => {
    render(<ModelConfigPage />);
    expect(screen.getByTestId('model-config-content')).toBeInTheDocument();
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it('has a loading skeleton that mirrors the six-card bento', () => {
    const { container } = render(<ModelConfigLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading model configuration…');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
    expect(container.querySelectorAll('.lg\\:col-span-6')).toHaveLength(6);
  });
});
