// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getByIdMock = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    contact: {
      getById: { useQuery: (...args: unknown[]) => getByIdMock(...args) },
    },
  },
}));

import { NewTicketContactForm, contactPrefill } from '../NewTicketContactForm';

const props = {
  onSubmit: vi.fn(() => Promise.resolve()),
  onCancel: vi.fn(),
  isSubmitting: false,
};

describe('contactPrefill', () => {
  it('joins the name parts and trims', () => {
    expect(
      contactPrefill({ firstName: ' Ada ', lastName: 'Lovelace', email: ' a@x.example.invalid ' })
    ).toEqual({
      contactName: 'Ada Lovelace',
      contactEmail: 'a@x.example.invalid',
    });
  });

  it('copes with missing parts', () => {
    expect(contactPrefill({ firstName: null, lastName: 'Lovelace', email: null })).toEqual({
      contactName: 'Lovelace',
      contactEmail: '',
    });
  });
});

describe('NewTicketContactForm', () => {
  beforeEach(() => getByIdMock.mockReset());

  it('opens an empty form and skips the lookup without a contactId', () => {
    getByIdMock.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    render(<NewTicketContactForm contactId={null} {...props} />);

    expect(getByIdMock).toHaveBeenCalledWith(
      { id: '' },
      expect.objectContaining({ enabled: false })
    );
    expect(screen.queryByTestId('ticket-contact-missing')).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue('Ada Lovelace')).not.toBeInTheDocument();
  });

  it('waits for the contact before showing the form', () => {
    getByIdMock.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<NewTicketContactForm contactId="c-1" {...props} />);

    expect(screen.getByTestId('ticket-contact-loading')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create|submit/i })).not.toBeInTheDocument();
  });

  it("pre-fills the contact's name and email", () => {
    getByIdMock.mockReturnValue({
      data: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@crm.example.invalid' },
      isLoading: false,
      isError: false,
    });
    render(<NewTicketContactForm contactId="c-1" {...props} />);

    expect(getByIdMock).toHaveBeenCalledWith(
      { id: 'c-1' },
      expect.objectContaining({ enabled: true, retry: false })
    );
    expect(screen.getByDisplayValue('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByDisplayValue('ada@crm.example.invalid')).toBeInTheDocument();
  });

  it('says so and opens an empty form when the contact is not found or in another tenant', () => {
    getByIdMock.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<NewTicketContactForm contactId="other-tenant" {...props} />);

    expect(screen.getByTestId('ticket-contact-missing')).toHaveTextContent(
      "couldn't find that contact"
    );
    expect(screen.queryByDisplayValue('Ada Lovelace')).not.toBeInTheDocument();
  });
});
