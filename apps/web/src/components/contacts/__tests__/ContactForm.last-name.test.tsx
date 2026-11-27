// @vitest-environment jsdom
/**
 * MVP-003: the last name is optional on the contact form, the first name is not. A contact created
 * from a lead with only a company is named after the company (empty last name), and the owner has
 * to be able to edit and save it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from '../ContactForm';
import { createMockFormData, createMockHandlers, resetAllMocks } from './contact-test-utils';

vi.mock('@/components/tasks/EntitySearchField', () => ({
  EntitySearchField: () => <div data-testid="entity-search" />,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    contactTypes: {
      listActive: {
        useQuery: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: Readonly<{ children: React.ReactNode; className?: string }>) => (
    <div className={className}>{children}</div>
  ),
}));

describe('ContactForm last name (MVP-003)', () => {
  let handlers: ReturnType<typeof createMockHandlers>;

  beforeEach(() => {
    handlers = createMockHandlers();
    resetAllMocks(handlers);
  });

  it('does not mark the last name as required, but still marks the first name', () => {
    render(<ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />);
    expect(screen.getByLabelText(/First Name/i)).toBeRequired();
    expect(screen.getByLabelText(/Last Name/i)).not.toBeRequired();
  });

  it('moves on from the first step with only a first name and an email', async () => {
    const user = userEvent.setup();
    render(<ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />);
    await user.type(screen.getByLabelText(/First Name/i), 'Studio Pilates Demo');
    await user.type(screen.getByLabelText(/Email Address/i), 'owner@pilates.example.invalid');
    await user.click(screen.getByText('Next Step'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Last name is required/i)).not.toBeInTheDocument();
  });

  it('saves a company-named contact with an empty last name from the edit form', async () => {
    const user = userEvent.setup();
    const contact = { ...createMockFormData(), firstName: 'Studio Pilates Demo', lastName: '' };
    render(
      <ContactForm
        mode="edit"
        contact={contact}
        onSubmit={handlers.onSubmit}
        onCancel={handlers.onCancel}
      />
    );
    await user.click(screen.getByRole('button', { name: /Next Step/i }));
    await user.click(screen.getByRole('button', { name: /Next Step/i }));
    await user.click(screen.getByRole('button', { name: /Save Changes/i }));
    await waitFor(() => expect(handlers.onSubmit).toHaveBeenCalled());
    expect(handlers.onSubmit.mock.calls[0][0]).toMatchObject({
      firstName: 'Studio Pilates Demo',
      lastName: '',
    });
  });

  it('still requires a first name', async () => {
    const user = userEvent.setup();
    render(<ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />);
    await user.type(screen.getByLabelText(/Email Address/i), 'owner@pilates.example.invalid');
    await user.click(screen.getByText('Next Step'));
    await waitFor(() => {
      expect(screen.getAllByRole('alert')[0]).toHaveTextContent('First name is required');
    });
    expect(handlers.onSubmit).not.toHaveBeenCalled();
  });
});
