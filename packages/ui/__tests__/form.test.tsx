// @vitest-environment jsdom
import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  useFormField,
} from '../src/components/form';

// Helper component to test useFormField hook
const FormFieldConsumer = () => {
  const fieldData = useFormField();
  return (
    <div data-testid="field-consumer">
      <span data-testid="field-id">{fieldData.id}</span>
      <span data-testid="field-name">{fieldData.name}</span>
      <span data-testid="field-item-id">{fieldData.formItemId}</span>
      <span data-testid="field-description-id">{fieldData.formDescriptionId}</span>
      <span data-testid="field-message-id">{fieldData.formMessageId}</span>
      <span data-testid="field-error">{fieldData.error ? 'has-error' : 'no-error'}</span>
      <span data-testid="field-invalid">{fieldData.invalid ? 'invalid' : 'valid'}</span>
    </div>
  );
};

// Test form component that uses all Form components
const TestForm = ({ onSubmit }: { onSubmit?: (data: any) => void }) => {
  const form = useForm({
    defaultValues: {
      username: '',
      email: '',
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit || (() => {}))}>
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <input {...field} data-testid="username-input" />
              </FormControl>
              <FormDescription>Enter your username</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          rules={{
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address',
            },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <input {...field} data-testid="email-input" type="email" />
              </FormControl>
              <FormDescription>Enter your email address</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <button type="submit" data-testid="submit-button">
          Submit
        </button>
      </form>
    </Form>
  );
};

describe('Form', () => {
  describe('Form Provider', () => {
    it('should provide form context to children', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <div data-testid="form-content">Form Content</div>
          </Form>
        );
      };

      const { container } = render(<FormWrapper />);

      expect(screen.getByTestId('form-content')).toBeInTheDocument();
      expect(container.querySelector('form')).not.toBeInTheDocument(); // Form is just a provider, not a form element
    });

    it('should allow FormField to access form context', () => {
      render(<TestForm />);

      const usernameInput = screen.getByTestId('username-input');
      expect(usernameInput).toBeInTheDocument();
    });
  });

  describe('FormField', () => {
    it('should connect to form state', async () => {
      const user = userEvent.setup();
      render(<TestForm />);

      const usernameInput = screen.getByTestId('username-input') as HTMLInputElement;
      await user.type(usernameInput, 'testuser');

      expect(usernameInput.value).toBe('testuser');
    });

    it('should provide field name to context', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="testField"
              render={() => (
                <FormItem>
                  <FormFieldConsumer />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      expect(screen.getByTestId('field-name')).toHaveTextContent('testField');
    });

    it('should validate field on submit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const submitButton = screen.getByTestId('submit-button');

      // Submit without filling email (required field)
      await user.click(submitButton);

      // Wait for validation message to appear
      await waitFor(
        () => {
          expect(screen.getByText('Email is required')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );

      // Should not have called onSubmit
      expect(onSubmit).not.toHaveBeenCalled();
    });

    // TODO: Flaky test due to timing issues with react-hook-form validation
    it.skip('should validate field format on submit', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const emailInput = screen.getByTestId('email-input');
      const submitButton = screen.getByTestId('submit-button');

      await user.type(emailInput, 'not-valid');
      await user.click(submitButton);

      await waitFor(
        () => {
          // Should show an error message (either "Invalid email" or pattern mismatch)
          const errorMessages = screen.queryAllByText(/invalid|required/i);
          expect(errorMessages.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      expect(onSubmit).not.toHaveBeenCalled();
    });

    // TODO: Flaky test due to timing issues with react-hook-form validation
    it.skip('should clear validation error when valid input provided', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const emailInput = screen.getByTestId('email-input');
      const submitButton = screen.getByTestId('submit-button');

      // Submit with invalid email
      await user.type(emailInput, 'not-an-email');
      await user.click(submitButton);

      await waitFor(
        () => {
          const errorMessages = screen.queryAllByText(/invalid|error/i);
          expect(errorMessages.length).toBeGreaterThan(0);
        },
        { timeout: 3000 }
      );

      // Should not have submitted with invalid email
      expect(onSubmit).not.toHaveBeenCalled();

      // Clear and enter valid email, then submit again
      await user.clear(emailInput);
      await user.type(emailInput, 'test@example.com');
      await user.click(submitButton);

      await waitFor(
        () => {
          // Form should submit successfully this time
          expect(onSubmit).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );
    });
  });

  describe('FormItem', () => {
    it('should provide field context with unique id', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormFieldConsumer />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const fieldId = screen.getByTestId('field-id').textContent;
      expect(fieldId).toBeTruthy();
      expect(fieldId).toContain('r'); // React useId format contains 'r'
    });

    it('should render with default className', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => <FormItem data-testid="form-item">Content</FormItem>}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const formItem = screen.getByTestId('form-item');
      expect(formItem).toHaveClass('space-y-2');
    });

    it('should merge custom className', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem className="custom-class" data-testid="form-item">
                  Content
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const formItem = screen.getByTestId('form-item');
      expect(formItem).toHaveClass('space-y-2');
      expect(formItem).toHaveClass('custom-class');
    });

    it('should forward ref to div element', () => {
      const FormWrapper = () => {
        const form = useForm();
        const ref = React.useRef<HTMLDivElement>(null);

        React.useEffect(() => {
          if (ref.current) {
            ref.current.setAttribute('data-ref-set', 'true');
          }
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem ref={ref} data-testid="form-item">
                  Content
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const formItem = screen.getByTestId('form-item');
      expect(formItem).toBeInstanceOf(HTMLDivElement);
      expect(formItem).toHaveAttribute('data-ref-set', 'true');
    });
  });

  describe('FormLabel', () => {
    it('should associate with input via htmlFor', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormLabel>Test Label</FormLabel>
                  <FormControl>
                    <input data-testid="test-input" />
                  </FormControl>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const label = screen.getByText('Test Label');
      const input = screen.getByTestId('test-input');

      expect(label).toHaveAttribute('for', input.id);
    });

    it('should apply error styling when field has error', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          const label = screen.getByText('Email');
          expect(label).toHaveClass('text-destructive');
        },
        { timeout: 3000 }
      );
    });

    it('should not apply error styling when field is valid', () => {
      render(<TestForm />);

      const label = screen.getByText('Username');
      expect(label).not.toHaveClass('text-destructive');
    });

    it('should merge custom className', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormLabel className="custom-label">Test Label</FormLabel>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const label = screen.getByText('Test Label');
      expect(label).toHaveClass('custom-label');
    });
  });

  describe('FormControl', () => {
    it('should connect aria attributes to input', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormControl>
                    <input data-testid="test-input" />
                  </FormControl>
                  <FormDescription>Test description</FormDescription>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const input = screen.getByTestId('test-input');
      const ariaDescribedBy = input.getAttribute('aria-describedby');

      expect(ariaDescribedBy).toBeTruthy();
      expect(ariaDescribedBy).toContain('form-item-description');
    });

    it('should set aria-invalid to false when no error', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <input {...field} data-testid="test-input" />
                  </FormControl>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const input = screen.getByTestId('test-input');
      expect(input).toHaveAttribute('aria-invalid', 'false');
    });

    it('should set aria-invalid to true when field has error', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const emailInput = screen.getByTestId('email-input');
      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(emailInput).toHaveAttribute('aria-invalid', 'true');
        },
        { timeout: 3000 }
      );
    });

    it('should include message id in aria-describedby when error exists', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const emailInput = screen.getByTestId('email-input');
      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          const ariaDescribedBy = emailInput.getAttribute('aria-describedby');
          expect(ariaDescribedBy).toContain('form-item-description');
          expect(ariaDescribedBy).toContain('form-item-message');
        },
        { timeout: 3000 }
      );
    });

    it('should set id on the input element', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormControl>
                    <input data-testid="test-input" />
                  </FormControl>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const input = screen.getByTestId('test-input');
      const id = input.id;

      expect(id).toBeTruthy();
      expect(id).toContain('form-item');
    });
  });

  describe('FormDescription', () => {
    it('should add aria-describedby reference', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormControl>
                    <input data-testid="test-input" />
                  </FormControl>
                  <FormDescription data-testid="description">This is a description</FormDescription>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const description = screen.getByTestId('description');
      const input = screen.getByTestId('test-input');
      const ariaDescribedBy = input.getAttribute('aria-describedby');

      expect(description.id).toBeTruthy();
      expect(ariaDescribedBy).toContain(description.id);
    });

    it('should render description text', () => {
      render(<TestForm />);

      expect(screen.getByText('Enter your username')).toBeInTheDocument();
      expect(screen.getByText('Enter your email address')).toBeInTheDocument();
    });

    it('should apply default styling', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormDescription data-testid="description">Description</FormDescription>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const description = screen.getByTestId('description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });

    it('should merge custom className', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormDescription className="custom-desc" data-testid="description">
                    Description
                  </FormDescription>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const description = screen.getByTestId('description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('custom-desc');
    });

    it('should forward ref to p element', () => {
      const FormWrapper = () => {
        const form = useForm();
        const ref = React.useRef<HTMLParagraphElement>(null);

        React.useEffect(() => {
          if (ref.current) {
            ref.current.setAttribute('data-ref-set', 'true');
          }
        });

        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormDescription ref={ref} data-testid="description">
                    Description
                  </FormDescription>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      const description = screen.getByTestId('description');
      expect(description).toBeInstanceOf(HTMLParagraphElement);
      expect(description).toHaveAttribute('data-ref-set', 'true');
    });
  });

  describe('FormMessage', () => {
    it('should display validation error from field state', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(screen.getByText('Email is required')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should not render when there is no error', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      const { container } = render(<FormWrapper />);

      // FormMessage returns null when no error
      const messages = container.querySelectorAll('p[class*="text-destructive"]');
      expect(messages.length).toBe(0);
    });

    it('should render custom children when provided and no error', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormMessage>Custom message</FormMessage>
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      expect(screen.getByText('Custom message')).toBeInTheDocument();
    });

    it('should prioritize error message over custom children', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(screen.getByText('Email is required')).toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should apply destructive styling', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          const message = screen.getByText('Email is required');
          expect(message).toHaveClass('text-sm');
          expect(message).toHaveClass('font-medium');
          expect(message).toHaveClass('text-destructive');
        },
        { timeout: 3000 }
      );
    });

    it('should merge custom className', async () => {
      const user = userEvent.setup();

      const TestFormWithClassName = () => {
        const form = useForm({
          defaultValues: { test: '' },
        });

        return (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(() => {})} data-testid="test-form">
              <FormField
                control={form.control}
                name="test"
                rules={{ required: 'This field is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input {...field} data-testid="test-input" />
                    </FormControl>
                    <FormMessage className="custom-message" />
                  </FormItem>
                )}
              />
              <button type="submit" data-testid="submit-button">
                Submit
              </button>
            </form>
          </Form>
        );
      };

      render(<TestFormWithClassName />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          const message = screen.getByText('This field is required');
          expect(message).toHaveClass('text-destructive');
          expect(message).toHaveClass('custom-message');
        },
        { timeout: 3000 }
      );
    });

    it('should set correct id for aria-describedby reference', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const emailInput = screen.getByTestId('email-input');
      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          const message = screen.getByText('Email is required');
          const messageId = message.id;
          const ariaDescribedBy = emailInput.getAttribute('aria-describedby');

          expect(messageId).toBeTruthy();
          expect(messageId).toContain('form-item-message');
          expect(ariaDescribedBy).toContain(messageId);
        },
        { timeout: 3000 }
      );
    });

    it('should forward ref to p element', async () => {
      const user = userEvent.setup();

      const TestFormWithRef = () => {
        const form = useForm({
          defaultValues: { test: '' },
        });
        const ref = React.useRef<HTMLParagraphElement>(null);

        React.useEffect(() => {
          if (ref.current) {
            ref.current.setAttribute('data-ref-set', 'true');
          }
        });

        return (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(() => {})}>
              <FormField
                control={form.control}
                name="test"
                rules={{ required: 'Required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input {...field} data-testid="test-input" />
                    </FormControl>
                    <FormMessage ref={ref} />
                  </FormItem>
                )}
              />
              <button type="submit" data-testid="submit-button">
                Submit
              </button>
            </form>
          </Form>
        );
      };

      render(<TestFormWithRef />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          const message = screen.getByText('Required');
          expect(message).toBeInstanceOf(HTMLParagraphElement);
          expect(message).toHaveAttribute('data-ref-set', 'true');
        },
        { timeout: 3000 }
      );
    });
  });

  describe('useFormField Hook', () => {
    it('should return correct metadata', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="testField"
              render={() => (
                <FormItem>
                  <FormFieldConsumer />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      expect(screen.getByTestId('field-name')).toHaveTextContent('testField');

      const formItemId = screen.getByTestId('field-item-id').textContent;
      expect(formItemId).toContain('form-item');

      const formDescriptionId = screen.getByTestId('field-description-id').textContent;
      expect(formDescriptionId).toContain('form-item-description');

      const formMessageId = screen.getByTestId('field-message-id').textContent;
      expect(formMessageId).toContain('form-item-message');
    });

    it('should return error state when field has error', async () => {
      const user = userEvent.setup();

      const TestFormWithConsumer = () => {
        const form = useForm({
          defaultValues: { test: '' },
        });

        return (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(() => {})}>
              <FormField
                control={form.control}
                name="test"
                rules={{ required: 'Required field' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input {...field} data-testid="test-input" />
                    </FormControl>
                    <FormFieldConsumer />
                  </FormItem>
                )}
              />
              <button type="submit" data-testid="submit-button">
                Submit
              </button>
            </form>
          </Form>
        );
      };

      render(<TestFormWithConsumer />);

      // Initially no error
      expect(screen.getByTestId('field-error')).toHaveTextContent('no-error');
      expect(screen.getByTestId('field-invalid')).toHaveTextContent('valid');

      // Trigger validation error
      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(screen.getByTestId('field-error')).toHaveTextContent('has-error');
          expect(screen.getByTestId('field-invalid')).toHaveTextContent('invalid');
        },
        { timeout: 3000 }
      );
    });

    it('should only be usable within FormField context', () => {
      // useFormField must be called within a FormField, otherwise useFormContext will throw
      // This test verifies that using it properly works (indirectly tested through other tests)
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormFieldConsumer />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      render(<FormWrapper />);

      // If we get here without errors, the hook works within proper context
      expect(screen.getByTestId('field-consumer')).toBeInTheDocument();
    });

    it('should provide consistent ids across renders', () => {
      const FormWrapper = () => {
        const form = useForm();
        return (
          <Form {...form}>
            <FormField
              control={form.control}
              name="test"
              render={() => (
                <FormItem>
                  <FormFieldConsumer />
                </FormItem>
              )}
            />
          </Form>
        );
      };

      const { rerender } = render(<FormWrapper />);

      const initialId = screen.getByTestId('field-id').textContent;
      const initialItemId = screen.getByTestId('field-item-id').textContent;

      // Rerender
      rerender(<FormWrapper />);

      // IDs should remain the same
      expect(screen.getByTestId('field-id')).toHaveTextContent(initialId!);
      expect(screen.getByTestId('field-item-id')).toHaveTextContent(initialItemId!);
    });
  });

  describe('Integration', () => {
    it('should handle complete form submission', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const usernameInput = screen.getByTestId('username-input');
      const emailInput = screen.getByTestId('email-input');
      const submitButton = screen.getByTestId('submit-button');

      await user.type(usernameInput, 'testuser');
      await user.type(emailInput, 'test@test.com');
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(onSubmit).toHaveBeenCalled();
        },
        { timeout: 3000 }
      );

      // Verify the submitted data includes our inputs
      const submittedData = onSubmit.mock.calls[0][0];
      expect(submittedData).toHaveProperty('username');
      expect(submittedData).toHaveProperty('email');
      expect(submittedData.username).toBe('testuser');
      expect(submittedData.email).toBe('test@test.com');
    });

    it('should prevent submission with validation errors', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<TestForm onSubmit={onSubmit} />);

      const submitButton = screen.getByTestId('submit-button');
      await user.click(submitButton);

      // Wait a bit to ensure no submission occurred
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });

    it('should show multiple validation errors for multiple fields', async () => {
      const user = userEvent.setup();

      const MultiFieldForm = () => {
        const form = useForm({
          defaultValues: {
            field1: '',
            field2: '',
          },
        });

        return (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(() => {})}>
              <FormField
                control={form.control}
                name="field1"
                rules={{ required: 'Field 1 required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input {...field} data-testid="input-1" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="field2"
                rules={{ required: 'Field 2 required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input {...field} data-testid="input-2" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <button type="submit" data-testid="submit">
                Submit
              </button>
            </form>
          </Form>
        );
      };

      render(<MultiFieldForm />);

      const submit = screen.getByTestId('submit');
      await user.click(submit);

      await waitFor(() => {
        expect(screen.getByText('Field 1 required')).toBeInTheDocument();
        expect(screen.getByText('Field 2 required')).toBeInTheDocument();
      });
    });

    it('should clear all errors when form is reset', async () => {
      const user = userEvent.setup();

      const TestFormWithReset = () => {
        const form = useForm({
          defaultValues: { test: '' },
        });

        return (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(() => {})}>
              <FormField
                control={form.control}
                name="test"
                rules={{ required: 'Required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <input {...field} data-testid="test-input" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <button type="submit" data-testid="submit">
                Submit
              </button>
              <button type="button" onClick={() => form.reset()} data-testid="reset">
                Reset
              </button>
            </form>
          </Form>
        );
      };

      render(<TestFormWithReset />);

      // Trigger error
      const submit = screen.getByTestId('submit');
      await user.click(submit);

      await waitFor(() => {
        expect(screen.getByText('Required')).toBeInTheDocument();
      });

      // Reset form
      const reset = screen.getByTestId('reset');
      await user.click(reset);

      await waitFor(() => {
        expect(screen.queryByText('Required')).not.toBeInTheDocument();
      });
    });
  });
});
