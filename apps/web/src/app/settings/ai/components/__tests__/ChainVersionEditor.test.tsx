/**
 * ChainVersionEditor Component Tests
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Tests for the chain version editor dialog component.
 * Covers AC5 (create draft) and AC6 (edit draft).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChainVersionEditor } from '../ChainVersionEditor';
import type { ChainVersionSummary } from '@intelliflow/validators';
import type { ChainType } from '@intelliflow/domain';

// Mock data
const mockDraftVersion: ChainVersionSummary = {
  id: 'draft-v1-uuid',
  chainType: 'SCORING' as ChainType,
  status: 'DRAFT' as const,
  model: 'gpt-4-turbo',
  description: 'Experimental scoring model',
  rolloutStrategy: 'IMMEDIATE' as const,
  rolloutPercent: null,
  createdAt: new Date('2025-01-05'),
  createdBy: 'developer@test.com',
};

describe('ChainVersionEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Mode', () => {
    it('renders dialog when open', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      expect(screen.getByText('Create Chain Version')).toBeInTheDocument();
      expect(
        screen.getByText('Create a new chain version as a draft. You can activate it later.')
      ).toBeInTheDocument();
    });

    it('does not render when closed', () => {
      render(<ChainVersionEditor {...defaultProps} open={false} />);

      expect(screen.queryByText('Create Chain Version')).not.toBeInTheDocument();
    });

    it('renders all required form fields', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      expect(screen.getByLabelText(/Chain Type/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Model/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/System Prompt/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Temperature/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Max Tokens/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    });

    it('shows required field indicators', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      const requiredAsterisks = screen.getAllByText('*');
      // Chain Type, Model, System Prompt are required
      expect(requiredAsterisks.length).toBeGreaterThanOrEqual(3);
    });

    it('has correct default values', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      const chainTypeSelect = screen.getByLabelText(/Chain Type/i) as HTMLSelectElement;
      const modelInput = screen.getByLabelText(/^Model/i) as HTMLInputElement;
      const promptTextarea = screen.getByLabelText(/System Prompt/i) as HTMLTextAreaElement;
      const temperatureInput = screen.getByLabelText(/Temperature/i) as HTMLInputElement;
      const maxTokensInput = screen.getByLabelText(/Max Tokens/i) as HTMLInputElement;

      expect(chainTypeSelect.value).toBe('');
      expect(modelInput.value).toBe('');
      expect(promptTextarea.value).toBe('');
      expect(temperatureInput.value).toBe('0.7');
      expect(maxTokensInput.value).toBe('2000');
    });

    it('renders all chain type options', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      const chainTypeSelect = screen.getByLabelText(/Chain Type/i);

      expect(chainTypeSelect).toContainHTML('<option value="">Select chain type...</option>');
      expect(chainTypeSelect).toContainHTML('<option value="SCORING">Lead Scoring</option>');
      expect(chainTypeSelect).toContainHTML(
        '<option value="QUALIFICATION">Lead Qualification</option>'
      );
      expect(chainTypeSelect).toContainHTML('<option value="EMAIL_WRITER">Email Writer</option>');
      expect(chainTypeSelect).toContainHTML('<option value="FOLLOWUP">Follow-up</option>');
    });

    it('disables submit button when required fields are empty', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      const submitButton = screen.getByRole('button', { name: /Create Draft/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables submit button when all required fields are filled', async () => {
      const user = userEvent.setup();
      render(<ChainVersionEditor {...defaultProps} />);

      // Fill required fields
      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'You are a lead scoring AI.');

      const submitButton = screen.getByRole('button', { name: /Create Draft/i });
      expect(submitButton).not.toBeDisabled();
    });

    it('enforces minimum prompt length validation', async () => {
      const user = userEvent.setup();
      render(<ChainVersionEditor {...defaultProps} />);

      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'Short'); // Less than 10 chars

      const submitButton = screen.getByRole('button', { name: /Create Draft/i });
      expect(submitButton).toBeDisabled();
    });

    it('shows prompt validation hint', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      expect(
        screen.getByText(/Minimum 10 characters. This prompt defines how the AI chain behaves./i)
      ).toBeInTheDocument();
    });

    it('calls onCreate with correct data when submitted', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn().mockResolvedValue(undefined);
      render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4-turbo');
      await user.type(
        screen.getByLabelText(/System Prompt/i),
        'You are a lead scoring AI assistant.'
      );
      await user.clear(screen.getByLabelText(/Temperature/i));
      await user.type(screen.getByLabelText(/Temperature/i), '0.5');
      await user.clear(screen.getByLabelText(/Max Tokens/i));
      await user.type(screen.getByLabelText(/Max Tokens/i), '3000');
      await user.type(screen.getByLabelText(/Description/i), 'New scoring model');

      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledWith({
          chainType: 'SCORING',
          model: 'gpt-4-turbo',
          prompt: 'You are a lead scoring AI assistant.',
          temperature: 0.5,
          maxTokens: 3000,
          description: 'New scoring model',
          rolloutStrategy: 'IMMEDIATE',
        });
      });
    });

    it('calls onOpenChange(false) after successful creation', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<ChainVersionEditor {...defaultProps} onOpenChange={onOpenChange} />);

      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'You are a lead scoring AI.');

      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('calls onOpenChange when cancel button is clicked', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<ChainVersionEditor {...defaultProps} onOpenChange={onOpenChange} />);

      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('resets form when dialog closes', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn((open: boolean) => {
        if (!open) {
          // Simulate the component's reset logic
        }
      });
      const { rerender } = render(
        <ChainVersionEditor {...defaultProps} onOpenChange={onOpenChange} />
      );

      // Fill form
      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'Test prompt here');

      // Verify fields were filled
      expect((screen.getByLabelText(/Chain Type/i) as HTMLSelectElement).value).toBe('SCORING');
      expect((screen.getByLabelText(/^Model/i) as HTMLInputElement).value).toBe('gpt-4');

      // Close dialog by clicking cancel
      await user.click(screen.getByRole('button', { name: /Cancel/i }));

      // Verify onOpenChange was called with false
      expect(onOpenChange).toHaveBeenCalledWith(false);

      // Reopen with fresh props (simulates parent component managing state)
      rerender(<ChainVersionEditor {...defaultProps} open={true} onOpenChange={onOpenChange} />);

      // Wait for form to be visible again
      await screen.findByLabelText(/Chain Type/i);

      // Fields should be reset to defaults
      const chainTypeSelect = screen.getByLabelText(/Chain Type/i) as HTMLSelectElement;
      const modelInput = screen.getByLabelText(/^Model/i) as HTMLInputElement;
      const promptTextarea = screen.getByLabelText(/System Prompt/i) as HTMLTextAreaElement;

      expect(chainTypeSelect.value).toBe('');
      expect(modelInput.value).toBe('');
      expect(promptTextarea.value).toBe('');
    });

    it('displays error message when creation fails', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn().mockRejectedValue(new Error('Validation failed'));
      render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'You are a lead scoring AI.');

      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      await waitFor(() => {
        expect(screen.getByText('Validation failed')).toBeInTheDocument();
      });
    });

    it('disables all inputs when loading', () => {
      render(<ChainVersionEditor {...defaultProps} isLoading={true} />);

      expect(screen.getByLabelText(/^Model/i)).toBeDisabled();
      expect(screen.getByLabelText(/System Prompt/i)).toBeDisabled();
      expect(screen.getByLabelText(/Temperature/i)).toBeDisabled();
      expect(screen.getByLabelText(/Max Tokens/i)).toBeDisabled();
      expect(screen.getByLabelText(/Description/i)).toBeDisabled();
    });

    it('shows loading text on submit button when loading', () => {
      render(<ChainVersionEditor {...defaultProps} isLoading={true} />);

      expect(screen.getByRole('button', { name: /Saving.../i })).toBeInTheDocument();
    });

    it('allows description to be optional', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn().mockResolvedValue(undefined);
      render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'You are a lead scoring AI.');

      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            description: undefined,
          })
        );
      });
    });
  });

  describe('Edit Mode', () => {
    const propsWithDraft = {
      ...defaultProps,
      existingDraft: mockDraftVersion,
      onUpdate: vi.fn().mockResolvedValue(undefined),
    };

    it('renders edit mode title when existingDraft is provided', () => {
      render(<ChainVersionEditor {...propsWithDraft} />);

      expect(screen.getByText('Edit Chain Version')).toBeInTheDocument();
      expect(screen.getByText('Update the draft chain version configuration.')).toBeInTheDocument();
    });

    it('populates form fields with existing draft data', () => {
      render(<ChainVersionEditor {...propsWithDraft} />);

      const chainTypeSelect = screen.getByLabelText(/Chain Type/i) as HTMLSelectElement;
      const modelInput = screen.getByLabelText(/^Model/i) as HTMLInputElement;
      const descriptionInput = screen.getByLabelText(/Description/i) as HTMLInputElement;

      expect(chainTypeSelect.value).toBe('SCORING');
      expect(modelInput.value).toBe('gpt-4-turbo');
      expect(descriptionInput.value).toBe('Experimental scoring model');
    });

    it('disables chain type selection in edit mode', () => {
      render(<ChainVersionEditor {...propsWithDraft} />);

      const chainTypeSelect = screen.getByLabelText(/Chain Type/i);
      expect(chainTypeSelect).toBeDisabled();
    });

    it('renders Save Changes button in edit mode', () => {
      render(<ChainVersionEditor {...propsWithDraft} />);

      expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    });

    it('calls onUpdate with correct data when submitted in edit mode', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn().mockResolvedValue(undefined);
      render(<ChainVersionEditor {...propsWithDraft} onUpdate={onUpdate} />);

      // Modify model
      await user.clear(screen.getByLabelText(/^Model/i));
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4o');

      // Add prompt
      await user.type(screen.getByLabelText(/System Prompt/i), 'Updated prompt text');

      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(onUpdate).toHaveBeenCalledWith('draft-v1-uuid', {
          model: 'gpt-4o',
          description: 'Experimental scoring model',
          prompt: 'Updated prompt text',
          temperature: 0.7,
          maxTokens: 2000,
        });
      });
    });

    it('closes dialog after successful update', async () => {
      const user = userEvent.setup();
      const onOpenChange = vi.fn();
      render(<ChainVersionEditor {...propsWithDraft} onOpenChange={onOpenChange} />);

      await user.type(screen.getByLabelText(/System Prompt/i), 'Updated prompt');
      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(onOpenChange).toHaveBeenCalledWith(false);
      });
    });

    it('displays error when update fails', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn().mockRejectedValue(new Error('Update failed'));
      render(<ChainVersionEditor {...propsWithDraft} onUpdate={onUpdate} />);

      await user.type(screen.getByLabelText(/System Prompt/i), 'Updated prompt');
      await user.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Update failed')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('validates temperature range', async () => {
      const user = userEvent.setup();
      render(<ChainVersionEditor {...defaultProps} />);

      const temperatureInput = screen.getByLabelText(/Temperature/i);

      expect(temperatureInput).toHaveAttribute('min', '0');
      expect(temperatureInput).toHaveAttribute('max', '2');
      expect(temperatureInput).toHaveAttribute('step', '0.1');
    });

    it('validates max tokens range', async () => {
      const user = userEvent.setup();
      render(<ChainVersionEditor {...defaultProps} />);

      const maxTokensInput = screen.getByLabelText(/Max Tokens/i);

      expect(maxTokensInput).toHaveAttribute('min', '100');
      expect(maxTokensInput).toHaveAttribute('max', '128000');
      expect(maxTokensInput).toHaveAttribute('step', '100');
    });

    it('parses temperature as float', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn().mockResolvedValue(undefined);
      render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'You are a lead scoring AI.');
      await user.clear(screen.getByLabelText(/Temperature/i));
      await user.type(screen.getByLabelText(/Temperature/i), '1.2');

      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 1.2,
          })
        );
      });
    });

    it('parses maxTokens as integer', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn().mockResolvedValue(undefined);
      render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'You are a lead scoring AI.');
      await user.clear(screen.getByLabelText(/Max Tokens/i));
      await user.type(screen.getByLabelText(/Max Tokens/i), '5000');

      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      await waitFor(() => {
        expect(onCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            maxTokens: 5000,
          })
        );
      });
    });
  });

  describe('User Interactions', () => {
    it('updates chainType when user selects from dropdown', async () => {
      const user = userEvent.setup();
      render(<ChainVersionEditor {...defaultProps} />);

      const chainTypeSelect = screen.getByLabelText(/Chain Type/i) as HTMLSelectElement;

      await user.selectOptions(chainTypeSelect, 'QUALIFICATION');

      expect(chainTypeSelect.value).toBe('QUALIFICATION');
    });

    it('updates model when user types in input', async () => {
      const user = userEvent.setup();
      render(<ChainVersionEditor {...defaultProps} />);

      const modelInput = screen.getByLabelText(/^Model/i) as HTMLInputElement;

      await user.type(modelInput, 'claude-3-opus');

      expect(modelInput.value).toBe('claude-3-opus');
    });

    it('updates prompt when user types in textarea', async () => {
      const user = userEvent.setup();
      render(<ChainVersionEditor {...defaultProps} />);

      const promptTextarea = screen.getByLabelText(/System Prompt/i) as HTMLTextAreaElement;

      await user.type(promptTextarea, 'Custom prompt text');

      expect(promptTextarea.value).toBe('Custom prompt text');
    });

    it('clears error when form is modified after error', async () => {
      const user = userEvent.setup();
      const onCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

      // Fill and submit to trigger error
      await user.selectOptions(screen.getByLabelText(/Chain Type/i), 'SCORING');
      await user.type(screen.getByLabelText(/^Model/i), 'gpt-4');
      await user.type(screen.getByLabelText(/System Prompt/i), 'Test prompt');
      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      // Wait for error to appear
      await waitFor(() => {
        expect(screen.getByText('API Error')).toBeInTheDocument();
      });

      // Now submit again (onCreate should succeed this time)
      onCreate.mockResolvedValue(undefined);
      await user.click(screen.getByRole('button', { name: /Create Draft/i }));

      // Error should clear on new submission
      await waitFor(() => {
        expect(screen.queryByText('API Error')).not.toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('has accessible labels for all inputs', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      expect(screen.getByLabelText(/Chain Type/i)).toHaveAttribute('aria-label', 'Chain Type');
      expect(screen.getByLabelText(/^Model/i)).toHaveAttribute('aria-label', 'Model');
      expect(screen.getByLabelText(/System Prompt/i)).toHaveAttribute(
        'aria-label',
        'System Prompt'
      );
    });

    it('uses semantic HTML for form elements', () => {
      render(<ChainVersionEditor {...defaultProps} />);

      expect(screen.getByRole('combobox', { name: /Chain Type/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /^Model/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /System Prompt/i })).toBeInTheDocument();
    });
  });
});
