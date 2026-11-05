// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BreakableAddress } from '../BreakableAddress';

describe('BreakableAddress', () => {
  it('keeps the address whole, with places to wrap after the @ and before each dot', () => {
    const { container } = render(<BreakableAddress address="pat@mail.example.invalid" />);
    expect(container).toHaveTextContent('pat@mail.example.invalid');
    expect(container.querySelectorAll('wbr')).toHaveLength(3);
  });

  it('offers no break in a name with nothing to break at', () => {
    const { container } = render(<BreakableAddress address="Pat Example" />);
    expect(container).toHaveTextContent('Pat Example');
    expect(container.querySelectorAll('wbr')).toHaveLength(0);
  });
});
