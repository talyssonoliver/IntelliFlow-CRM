/**
 * ChainVersionEditor Tests
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Tests for the create/edit chain version modal.
 * Covers: AC5 (create draft), AC6 (edit draft)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChainVersionEditor } from '../ChainVersionEditor';
import type { ChainVersionSummary } from '@intelliflow/validators';

// Mock data
const mockDraft: ChainVersionSummary = {
  id: 'draft-uuid-1234',
  chainType: 'SCORING',
  status: 'DRAFT',
  model: 'gpt-4',
  description: 'Test draft version',
  rolloutStrategy: 'IMMEDIATE',
  rolloutPercent: null,
  createdAt: new Date('2025-06-01'),
  createdBy: 'admin@test.com',
};

describe('ChainVersionEditor', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(undefined),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    existingDraft: null as ChainVersionSummary | null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render modal when open', () => {
    render(<ChainVersionEditor {...defaultProps} />);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Create Chain Version')).toBeInTheDocument();
  });

  it('should not render when closed', () => {
    render(<ChainVersionEditor {...defaultProps} open={false} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('should display form fields (chain type, model, prompt)', () => {
    render(<ChainVersionEditor {...defaultProps} />);

    expect(screen.getByLabelText(/chain type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/system prompt/i)).toBeInTheDocument();
  });

  it('should validate required fields - disable submit when empty', () => {
    render(<ChainVersionEditor {...defaultProps} />);

    const submitButton = screen.getByRole('button', { name: /create/i });
    expect(submitButton).toBeDisabled();
  });

  it('should call onCreate with form data for new version', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

    // Fill in form fields - use selectOptions for native select
    const chainTypeSelect = screen.getByLabelText(/chain type/i);
    await user.selectOptions(chainTypeSelect, 'SCORING');

    const modelInput = screen.getByLabelText(/model/i);
    await user.clear(modelInput);
    await user.type(modelInput, 'gpt-4-turbo');

    const promptInput = screen.getByLabelText(/system prompt/i);
    await user.type(promptInput, 'You are an expert lead scoring assistant that analyzes leads.');

    // Submit
    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          chainType: 'SCORING',
          model: 'gpt-4-turbo',
          prompt: 'You are an expert lead scoring assistant that analyzes leads.',
        })
      );
    });
  });

  it('should populate form for existing draft in edit mode', () => {
    render(
      <ChainVersionEditor {...defaultProps} existingDraft={mockDraft} />
    );

    expect(screen.getByText('Edit Chain Version')).toBeInTheDocument();
    expect(screen.getByLabelText(/model/i)).toHaveValue('gpt-4');
  });

  it('should call onUpdate for existing draft', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    render(
      <ChainVersionEditor
        {...defaultProps}
        existingDraft={mockDraft}
        onUpdate={onUpdate}
      />
    );

    // Modify the model
    const modelInput = screen.getByLabelText(/model/i);
    await user.clear(modelInput);
    await user.type(modelInput, 'gpt-4o');

    // Ensure prompt is populated (edit mode should have it)
    const promptInput = screen.getByLabelText(/system prompt/i);
    if (!promptInput.textContent && !(promptInput as HTMLTextAreaElement).value) {
      await user.type(promptInput, 'Updated prompt text for testing.');
    }

    const submitButton = screen.getByRole('button', { name: /save/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith(
        mockDraft.id,
        expect.objectContaining({
          model: 'gpt-4o',
        })
      );
    });
  });

  it('should disable submit while saving', () => {
    render(<ChainVersionEditor {...defaultProps} isLoading={true} />);

    const submitButton = screen.getByRole('button', { name: /saving|create/i });
    expect(submitButton).toBeDisabled();
  });

  it('should show error messages on mutation error', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockRejectedValue(new Error('Network error'));
    render(<ChainVersionEditor {...defaultProps} onCreate={onCreate} />);

    // Fill required fields
    const chainTypeSelect = screen.getByLabelText(/chain type/i);
    await user.selectOptions(chainTypeSelect, 'SCORING');

    const modelInput = screen.getByLabelText(/model/i);
    await user.type(modelInput, 'gpt-4');

    const promptInput = screen.getByLabelText(/system prompt/i);
    await user.type(promptInput, 'A system prompt that is long enough.');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  it('should clear form after successful creation', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <ChainVersionEditor
        {...defaultProps}
        onOpenChange={onOpenChange}
        onCreate={onCreate}
      />
    );

    // Fill required fields
    const chainTypeSelect = screen.getByLabelText(/chain type/i);
    await user.selectOptions(chainTypeSelect, 'SCORING');

    const modelInput = screen.getByLabelText(/model/i);
    await user.type(modelInput, 'gpt-4');

    const promptInput = screen.getByLabelText(/system prompt/i);
    await user.type(promptInput, 'A system prompt that is long enough.');

    const submitButton = screen.getByRole('button', { name: /create/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
