/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaseTypesLoading } from '../CaseTypesLoading';

describe('CaseTypesLoading', () => {
  it('announces loading and renders the list and default-type placeholders', () => {
    const { container } = render(<CaseTypesLoading />);
    expect(screen.getByLabelText('Loading case types').getAttribute('aria-busy')).toBe('true');
    // Header (3) + list card (1 + 4 rows) + default card (1 + 3 rows)
    expect(container.querySelectorAll('[class*="animate-pulse"]').length).toBeGreaterThanOrEqual(
      12
    );
  });
});
