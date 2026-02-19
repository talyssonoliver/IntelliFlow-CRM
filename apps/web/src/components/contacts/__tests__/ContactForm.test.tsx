// @vitest-environment jsdom
/**
 * ContactForm Component Tests (PG-133)
 *
 * Tests the ContactForm component for:
 * - Multi-step form navigation
 * - Field validation (required fields, email, phone)
 * - Create vs Edit modes
 * - Form submission
 * - Error states and error summary
 * - Step indicator and progress
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactForm } from '../ContactForm';
import { createMockFormData, createMockHandlers, resetAllMocks } from './contact-test-utils';

// Mock Card component
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

describe('ContactForm', () => {
  let handlers: ReturnType<typeof createMockHandlers>;

  beforeEach(() => {
    handlers = createMockHandlers();
    resetAllMocks(handlers);
  });

  describe('Rendering', () => {
    it('renders in create mode with empty fields', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      expect(screen.getByLabelText(/First Name/i)).toHaveValue('');
      expect(screen.getByLabelText(/Last Name/i)).toHaveValue('');
      expect(screen.getByLabelText(/Email Address/i)).toHaveValue('');
    });

    it('renders in edit mode with pre-filled data', () => {
      const contact = createMockFormData();
      render(
        <ContactForm
          mode="edit"
          contact={contact}
          onSubmit={handlers.onSubmit}
          onCancel={handlers.onCancel}
        />
      );

      expect(screen.getByLabelText(/First Name/i)).toHaveValue('Jane');
      expect(screen.getByLabelText(/Last Name/i)).toHaveValue('Smith');
      expect(screen.getByLabelText(/Email Address/i)).toHaveValue('jane.smith@example.com');
    });

    it('renders step indicator', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      expect(screen.getByText('Personal Details')).toBeInTheDocument();
      expect(screen.getByText('Company & Role')).toBeInTheDocument();
      expect(screen.getByText('Additional Info')).toBeInTheDocument();
    });

    it('shows step 1 content by default', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      expect(screen.getByText('Contact Information')).toBeInTheDocument();
      expect(screen.getByLabelText(/First Name/i)).toBeInTheDocument();
      expect(screen.queryByLabelText(/Company Name/i)).not.toBeInTheDocument();
    });
  });

  describe('Step Navigation', () => {
    it('navigates to step 2 on Next click', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      // Fill required fields
      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'john@example.com');

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
        expect(screen.getByLabelText(/Company Name/i)).toBeInTheDocument();
      });
    });

    it('navigates back to step 1 on Previous click', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      // Fill and go to step 2
      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'john@example.com');
      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });

      await user.click(screen.getByText('Previous'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Contact Information/i })).toBeInTheDocument();
      });
    });

    it('allows clicking on completed steps', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      // Complete step 1
      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'john@example.com');
      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });

      const step1Button = screen.getByRole('button', { name: /Personal Details/i });
      await user.click(step1Button);

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Contact Information/i })).toBeInTheDocument();
      });
    });

    it('does not allow clicking on upcoming steps', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      const step3Button = screen.getByRole('button', { name: /Additional Info/i });
      expect(step3Button).toBeDisabled();
    });

    it('shows Cancel on step 1', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('shows Previous on step 2', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'john@example.com');
      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText('Previous')).toBeInTheDocument();
      });
    });
  });

  describe('Field Validation', () => {
    it('shows error for empty first name', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText(/Please fix the following errors/i)).toBeInTheDocument();
        const alerts = screen.getAllByRole('alert');
        const errorSummary = alerts[0]; // First alert is the summary
        expect(errorSummary).toHaveTextContent('First name is required');
      });
    });

    it('shows error for empty last name', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText(/Please fix the following errors/i)).toBeInTheDocument();
        const alerts = screen.getAllByRole('alert');
        const errorSummary = alerts[0]; // First alert is the summary
        expect(errorSummary).toHaveTextContent('Last name is required');
      });
    });

    it('shows error for empty email', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText(/Please fix the following errors/i)).toBeInTheDocument();
        const alerts = screen.getAllByRole('alert');
        const errorSummary = alerts[0]; // First alert is the summary
        expect(errorSummary).toHaveTextContent('Email is required');
      });
    });

    it('shows error for invalid email format', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'invalid-email');

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText(/Please fix the following errors/i)).toBeInTheDocument();
        const alerts = screen.getAllByRole('alert');
        const errorSummary = alerts[0]; // First alert is the summary
        expect(errorSummary).toHaveTextContent('Please enter a valid email address');
      });
    });

    it('shows error for invalid phone format', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'john@example.com');
      await user.type(screen.getByLabelText(/Phone Number/i), 'abcd');

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText(/Please fix the following errors/i)).toBeInTheDocument();
        const alerts = screen.getAllByRole('alert');
        const errorSummary = alerts[0]; // First alert is the summary
        expect(errorSummary).toHaveTextContent('Please enter a valid phone number');
      });
    });

    it('clears error when field is corrected', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      // Trigger validation error
      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText(/Please fix the following errors/i)).toBeInTheDocument();
      });

      // Fix the error
      await user.type(screen.getByLabelText(/First Name/i), 'John');

      // Error should clear when field is corrected
      await waitFor(() => {
        const _errorSummary = screen.queryByText(/Please fix the following errors/i);
        // Error summary may still exist if other fields have errors, but firstName error should be gone
        const firstNameInput = screen.getByLabelText(/First Name/i);
        expect(firstNameInput).toHaveAttribute('aria-invalid', 'false');
      });
    });
  });

  describe('Error Summary', () => {
    it('shows error summary when validation fails', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText('Please fix the following errors:')).toBeInTheDocument();
      });
    });

    it('focuses error summary on validation failure', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const errorSummary = alerts[0]; // First alert is the summary
        expect(document.activeElement).toBe(errorSummary);
      });
    });

    it('lists all validation errors in summary', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        const errorSummary = alerts[0]; // First alert is the summary
        const errorList = errorSummary.querySelector('ul');
        expect(errorList?.children.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Status Radio Buttons', () => {
    it('renders status options on step 3', async () => {
      const user = userEvent.setup();
      const contact = createMockFormData();

      render(
        <ContactForm
          mode="edit"
          contact={contact}
          onSubmit={handlers.onSubmit}
          onCancel={handlers.onCancel}
        />
      );

      // Navigate to step 3
      await user.click(screen.getByText('Next Step'));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
        expect(screen.getByText('Inactive')).toBeInTheDocument();
        expect(screen.getByText('Prospect')).toBeInTheDocument();
        expect(screen.getByText('Customer')).toBeInTheDocument();
        expect(screen.getByText('Former Customer')).toBeInTheDocument();
      });
    });

    it('selects default status (ACTIVE)', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      // Fill step 1 and navigate to step 3
      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'john@example.com');
      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        const activeRadio = screen.getByRole('radio', {
          name: /Active Currently engaged contact/i,
        });
        expect(activeRadio).toBeChecked();
      });
    });

    it('allows changing status', async () => {
      const user = userEvent.setup();
      const contact = createMockFormData();

      render(
        <ContactForm
          mode="edit"
          contact={contact}
          onSubmit={handlers.onSubmit}
          onCancel={handlers.onCancel}
        />
      );

      // Navigate to step 3
      await user.click(screen.getByText('Next Step'));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Additional Information/i })
        ).toBeInTheDocument();
      });

      const prospectRadio = screen.getByRole('radio', { name: /Prospect Potential customer/i });
      await user.click(prospectRadio);

      expect(prospectRadio).toBeChecked();
    });
  });

  describe('Form Submission', () => {
    it('calls onSubmit with form data on final step', async () => {
      const user = userEvent.setup();
      handlers.onSubmit.mockResolvedValue(undefined);

      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      // Step 1
      await user.type(screen.getByLabelText(/First Name/i), 'John');
      await user.type(screen.getByLabelText(/Last Name/i), 'Doe');
      await user.type(screen.getByLabelText(/Email Address/i), 'john@example.com');
      await user.click(screen.getByText('Next Step'));

      // Step 2
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });
      await user.click(screen.getByText('Next Step'));

      // Step 3
      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Additional Information/i })
        ).toBeInTheDocument();
      });
      await user.click(screen.getByText('Create Contact'));

      await waitFor(() => {
        expect(handlers.onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          })
        );
      });
    });

    it('shows "Save Changes" in edit mode', async () => {
      const user = userEvent.setup();
      const contact = createMockFormData();

      render(
        <ContactForm
          mode="edit"
          contact={contact}
          onSubmit={handlers.onSubmit}
          onCancel={handlers.onCancel}
        />
      );

      // Navigate to step 3
      await user.click(screen.getByText('Next Step'));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText('Save Changes')).toBeInTheDocument();
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();
      const contact = createMockFormData();

      render(
        <ContactForm
          mode="edit"
          contact={contact}
          onSubmit={handlers.onSubmit}
          onCancel={handlers.onCancel}
          isSubmitting={true}
        />
      );

      // Navigate to step 3
      await user.click(screen.getByText('Next Step'));
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Company & Role/i })).toBeInTheDocument();
      });

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByText('Creating...')).toBeInTheDocument();
        const submitButton = screen.getByText('Creating...').closest('button');
        expect(submitButton).toBeDisabled();
      });
    });

    it('calls onCancel when Cancel clicked', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Cancel'));
      expect(handlers.onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('Accessibility', () => {
    it('has progress indicator with aria attributes', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      const progress = screen.getByRole('progressbar');
      expect(progress).toHaveAttribute('aria-valuenow', '1');
      expect(progress).toHaveAttribute('aria-valuemin', '1');
      expect(progress).toHaveAttribute('aria-valuemax', '3');
    });

    it('marks current step with aria-current', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      const step1Button = screen.getByRole('button', { name: /Personal Details/i });
      expect(step1Button).toHaveAttribute('aria-current', 'step');
    });

    it('marks required fields with aria-required', () => {
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      expect(screen.getByLabelText(/First Name/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/Last Name/i)).toHaveAttribute('aria-required', 'true');
      expect(screen.getByLabelText(/Email Address/i)).toHaveAttribute('aria-required', 'true');
    });

    it('marks invalid fields with aria-invalid', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        expect(screen.getByLabelText(/First Name/i)).toHaveAttribute('aria-invalid', 'true');
      });
    });

    it('links error messages with aria-describedby', async () => {
      const user = userEvent.setup();
      render(
        <ContactForm mode="create" onSubmit={handlers.onSubmit} onCancel={handlers.onCancel} />
      );

      await user.click(screen.getByText('Next Step'));

      await waitFor(() => {
        const firstNameInput = screen.getByLabelText(/First Name/i);
        expect(firstNameInput).toHaveAttribute('aria-describedby', 'firstName-error');
      });
    });
  });
});
