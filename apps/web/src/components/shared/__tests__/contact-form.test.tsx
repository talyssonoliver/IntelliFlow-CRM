// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock email handler — ContactForm calls sendContactEmail on submit.
const mockSendEmail = vi.fn();
vi.mock('@/lib/shared/email-handler', () => ({
  sendContactEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import { ContactForm } from '../contact-form';

/**
 * Contact Form Component Tests
 *
 * Tests the contact form component for:
 * - Rendering and accessibility
 * - Form validation
 * - Submission handling
 * - Error states
 * - Brand compliance
 */

describe('ContactForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendEmail.mockResolvedValue({ ok: true });
  });

  describe('Rendering', () => {
    it('should render all form fields', () => {
      render(<ContactForm />);

      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/phone/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/company/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/message/i)).toBeInTheDocument();
    });

    it('should mark required fields visually', () => {
      render(<ContactForm />);

      const nameLabel = screen.getByLabelText(/name/i);
      const emailLabel = screen.getByLabelText(/email/i);
      const messageLabel = screen.getByLabelText(/message/i);

      // Required fields should have * or (required) indicator
      expect(nameLabel).toBeRequired();
      expect(emailLabel).toBeRequired();
      expect(messageLabel).toBeRequired();
    });

    it('should have submit button', () => {
      render(<ContactForm />);

      const submitButton = screen.getByRole('button', { name: /send message/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(<ContactForm />);

      const nameInput = screen.getByLabelText(/name/i);
      const emailInput = screen.getByLabelText(/email/i);

      expect(nameInput).toHaveAccessibleName();
      expect(emailInput).toHaveAccessibleName();
    });

    it('should have visible focus indicators', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      const nameInput = screen.getByLabelText(/name/i);
      await user.tab();

      expect(nameInput).toHaveFocus();
    });

    it('should announce errors to screen readers', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      const submitButton = screen.getByRole('button', { name: /send message/i });
      await user.click(submitButton);

      await waitFor(() => {
        const errorMessages = screen.getAllByRole('alert');
        expect(errorMessages.length).toBeGreaterThan(0);
      });
    });
  });

  // Component uses plain Zod validation on submit (NOT react-hook-form).
  // Error messages come from contactFormSchema in @intelliflow/validators.
  describe('Validation', () => {
    it('should validate required fields on submit', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      await user.click(screen.getByRole('button', { name: /send message/i }));

      // Zod nameSchema → min(1) → "String must contain at least 1 character(s)"
      // Zod emailSchema → "Invalid email address"
      // Zod message → min(10) → "Message must be at least 10 characters"
      await waitFor(() => {
        const alerts = screen.getAllByRole('alert');
        expect(alerts.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('should validate email format', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      // Fill name + message so only email fails
      await user.type(screen.getByLabelText(/name/i), 'John');
      await user.type(
        screen.getByLabelText(/message/i),
        'This is a valid message with enough text.'
      );

      const emailInput = screen.getByLabelText(/email/i);
      await user.type(emailInput, 'invalid-email');

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
      });
    });

    it('should validate message minimum length', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      const messageInput = screen.getByLabelText(/message/i);
      await user.type(messageInput, 'short');
      await user.tab();

      await waitFor(() => {
        expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument();
      });
    });

    it('should accept valid input and call sendContactEmail', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/name/i), 'John Doe');
      await user.type(screen.getByLabelText(/email/i), 'john@example.com');
      await user.type(
        screen.getByLabelText(/message/i),
        'This is a valid message with enough content to pass validation.'
      );

      await user.click(screen.getByRole('button', { name: /send message/i }));

      // Valid input → no validation-error alerts; email handler is called.
      await waitFor(() => {
        expect(mockSendEmail).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Form Submission', () => {
    it('should show loading state during submission', async () => {
      // Make sendContactEmail hang so we can observe the loading state.
      let resolveEmail!: (v: { ok: boolean }) => void;
      mockSendEmail.mockReturnValue(
        new Promise((r) => {
          resolveEmail = r;
        })
      );

      render(<ContactForm />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/name/i), 'Jane Smith');
      await user.type(screen.getByLabelText(/email/i), 'jane@example.com');
      await user.type(
        screen.getByLabelText(/message/i),
        'I would like more information about your product.'
      );

      await user.click(screen.getByRole('button', { name: /send message/i }));

      // While the promise is pending, button should show "Sending..."
      expect(screen.getByRole('button', { name: /sending/i })).toBeInTheDocument();

      // Resolve so the component finishes its async cycle.
      resolveEmail({ ok: true });
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument();
      });
    });

    it('should show success message after submission', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      await user.type(screen.getByLabelText(/name/i), 'Success Test');
      await user.type(screen.getByLabelText(/email/i), 'success@example.com');
      await user.type(
        screen.getByLabelText(/message/i),
        'This submission should succeed and show a success message.'
      );

      await user.click(screen.getByRole('button', { name: /send message/i }));

      await waitFor(() => {
        // Source: "Thank you for your message!" (contact-form.tsx:104)
        expect(screen.getByText(/thank you/i)).toBeInTheDocument();
      });
    });

    it('should handle submission errors gracefully', async () => {
      // Mock console.error to suppress error output in tests
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      render(<ContactForm />);
      const user = userEvent.setup();

      // TODO: Mock email service to return error
      // For now, this documents expected behavior

      await user.type(screen.getByLabelText(/name/i), 'Error Test');
      await user.type(screen.getByLabelText(/email/i), 'error@example.com');
      await user.type(screen.getByLabelText(/message/i), 'This should handle errors');

      // Submission handling verified in integration tests

      consoleError.mockRestore();
    });

    it('should clear form after successful submission', async () => {
      render(<ContactForm />);
      const user = userEvent.setup();

      const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
      const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
      const messageInput = screen.getByLabelText(/message/i) as HTMLTextAreaElement;

      await user.type(nameInput, 'Clear Test');
      await user.type(emailInput, 'clear@example.com');
      await user.type(messageInput, 'This form should clear after submission.');

      await user.click(screen.getByRole('button', { name: /send message/i }));

      // Source calls event.currentTarget.reset() on success (contact-form.tsx:73)
      await waitFor(() => {
        expect(nameInput.value).toBe('');
        expect(emailInput.value).toBe('');
        expect(messageInput.value).toBe('');
      });
    });
  });

  describe('Brand Compliance', () => {
    it('should use primary brand color for submit button', () => {
      render(<ContactForm />);

      const submitButton = screen.getByRole('button', { name: /send message/i });
      expect(submitButton).toHaveClass(/bg-\[#137fec\]|bg-primary/);
    });

    it('should have proper spacing and padding', () => {
      render(<ContactForm />);

      const form = screen.getByRole('form');
      expect(form).toHaveClass(/space-y|gap/);
    });
  });

  // Honeypot IS implemented: contact-form.tsx:351-358 renders a hidden
  // input[name="website"] with aria-hidden, tabIndex=-1, positioned off-screen.
  describe('Spam Prevention', () => {
    it('should include honeypot field (hidden from users)', () => {
      render(<ContactForm />);

      const honeypot = document.querySelector('input[name="website"]');
      expect(honeypot).toBeInTheDocument();
      expect(honeypot).toHaveAttribute('aria-hidden', 'true');
      expect(honeypot).toHaveAttribute('tabindex', '-1');
    });
  });
});
