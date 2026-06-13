import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

import { ContactAddDealButton } from './ContactAddDealButton';

afterEach(() => {
  cleanup();
  mockPush.mockClear();
});

describe('ContactAddDealButton (IFC-257)', () => {
  it('renders an "Add Deal" button', () => {
    render(<ContactAddDealButton contactId="contact-1" />);
    expect(screen.getByRole('button', { name: /Add Deal/i })).toBeInTheDocument();
  });

  it('navigates to /deals/new with the contact context on click', () => {
    render(<ContactAddDealButton contactId="contact-1" />);
    fireEvent.click(screen.getByRole('button', { name: /Add Deal/i }));
    expect(mockPush).toHaveBeenCalledWith('/deals/new?contactId=contact-1');
  });

  it('encodes the contact id', () => {
    render(<ContactAddDealButton contactId="a b/c" />);
    fireEvent.click(screen.getByRole('button', { name: /Add Deal/i }));
    expect(mockPush).toHaveBeenCalledWith('/deals/new?contactId=a%20b%2Fc');
  });
});
