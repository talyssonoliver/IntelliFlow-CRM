/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { ContactTypesLoading } from '../ContactTypesLoading';

describe('ContactTypesLoading', () => {
  it('is a busy status mirroring the bento grid', () => {
    const { container } = render(<ContactTypesLoading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading contact types');
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(container.querySelector('.lg\\:grid-cols-12')).not.toBeNull();
    expect(container.querySelector('.lg\\:col-span-8')).not.toBeNull();
    expect(container.querySelector('.lg\\:col-span-4')).not.toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = render(<ContactTypesLoading />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
