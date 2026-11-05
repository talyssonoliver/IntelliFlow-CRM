// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Breadcrumbs } from '../page-header';

describe('Breadcrumbs', () => {
  it('wraps whole items on a narrow screen', () => {
    render(<Breadcrumbs items={[{ label: 'Help', href: '/help' }, { label: 'A long article' }]} />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toHaveClass('flex-wrap');
  });
});
