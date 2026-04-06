import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackWidget } from '../feedback-widget';

// Mock tRPC client — submitFeedback mutation (IFC-303)
const mockMutate = vi.fn();
let shouldSimulateError = false;

vi.mock('@/lib/trpc', () => ({
  trpc: {
    helpArticle: {
      submitFeedback: {
        useMutation: (opts?: { onSuccess?: () => void; onError?: () => void }) => {
          return {
            mutate: (...args: unknown[]) => {
              mockMutate(...args);
              if (shouldSimulateError) {
                opts?.onError?.();
              } else {
                opts?.onSuccess?.();
              }
            },
            isLoading: false,
          };
        },
      },
    },
  },
}));

describe('FeedbackWidget', () => {
  it('renders "Was this helpful?" prompt text', () => {
    render(<FeedbackWidget articleId="test-1" />);
    expect(screen.getByText(/was this helpful/i)).toBeInTheDocument();
  });

  it('renders Yes button with appropriate aria-label', () => {
    render(<FeedbackWidget articleId="test-1" />);
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
  });

  it('renders No button with appropriate aria-label', () => {
    render(<FeedbackWidget articleId="test-1" />);
    expect(screen.getByRole('button', { name: /no/i })).toBeInTheDocument();
  });

  it('Yes button click shows "Thank you" confirmation', async () => {
    const user = userEvent.setup();
    render(<FeedbackWidget articleId="test-1" />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(screen.getByText(/thank you/i)).toBeInTheDocument();
  });

  it('No button click shows "Thank you" confirmation', async () => {
    const user = userEvent.setup();
    render(<FeedbackWidget articleId="test-1" />);
    await user.click(screen.getByRole('button', { name: /no/i }));
    expect(screen.getByText(/thank you/i)).toBeInTheDocument();
  });

  it('after submission, buttons are hidden', async () => {
    const user = userEvent.setup();
    render(<FeedbackWidget articleId="test-1" />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(screen.queryByRole('button', { name: /yes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /no/i })).not.toBeInTheDocument();
  });

  it('has aria-live="polite" region', () => {
    const { container } = render(<FeedbackWidget articleId="test-1" />);
    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it('buttons have aria-pressed attribute', () => {
    render(<FeedbackWidget articleId="test-1" />);
    const yesBtn = screen.getByRole('button', { name: /yes/i });
    const noBtn = screen.getByRole('button', { name: /no/i });
    expect(yesBtn).toHaveAttribute('aria-pressed', 'false');
    expect(noBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onFeedback callback with "helpful" on Yes click', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    render(<FeedbackWidget articleId="test-1" onFeedback={onFeedback} />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(onFeedback).toHaveBeenCalledWith('helpful');
  });

  it('calls onFeedback callback with "not_helpful" on No click', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    render(<FeedbackWidget articleId="test-1" onFeedback={onFeedback} />);
    await user.click(screen.getByRole('button', { name: /no/i }));
    expect(onFeedback).toHaveBeenCalledWith('not_helpful');
  });

  it('second click after submission does nothing (idempotent)', async () => {
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    render(<FeedbackWidget articleId="test-1" onFeedback={onFeedback} />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(onFeedback).toHaveBeenCalledTimes(1);
    // Buttons are gone, so no second click possible — idempotent by design
  });

  it('buttons have type="button"', () => {
    render(<FeedbackWidget articleId="test-1" />);
    const yesBtn = screen.getByRole('button', { name: /yes/i });
    const noBtn = screen.getByRole('button', { name: /no/i });
    expect(yesBtn).toHaveAttribute('type', 'button');
    expect(noBtn).toHaveAttribute('type', 'button');
  });

  it('renders without onFeedback prop (optional callback)', () => {
    expect(() => render(<FeedbackWidget articleId="test-1" />)).not.toThrow();
  });

  it('focus moves to confirmation message after submission', async () => {
    const user = userEvent.setup();
    render(<FeedbackWidget articleId="test-1" />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    const confirmation = screen.getByText(/thank you/i);
    expect(document.activeElement).toBe(confirmation.closest('[tabindex]') || confirmation);
  });

  // ─── tRPC wiring tests (IFC-303) ───────────────────────────────────────

  it('calls submitFeedback mutation with correct articleId and value on Yes click', async () => {
    mockMutate.mockClear();
    const user = userEvent.setup();
    render(<FeedbackWidget articleId="article-123" />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(mockMutate).toHaveBeenCalledWith({ articleId: 'article-123', value: 'helpful' });
  });

  it('calls submitFeedback mutation with correct articleId and value on No click', async () => {
    mockMutate.mockClear();
    const user = userEvent.setup();
    render(<FeedbackWidget articleId="article-456" />);
    await user.click(screen.getByRole('button', { name: /no/i }));
    expect(mockMutate).toHaveBeenCalledWith({ articleId: 'article-456', value: 'not_helpful' });
  });

  it('fires onFeedback callback alongside tRPC mutation', async () => {
    mockMutate.mockClear();
    const user = userEvent.setup();
    const onFeedback = vi.fn();
    render(<FeedbackWidget articleId="article-789" onFeedback={onFeedback} />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledWith('helpful');
  });

  it('shows error message when mutation fails', async () => {
    shouldSimulateError = true;
    const user = userEvent.setup();
    render(<FeedbackWidget articleId="test-err" />);
    await user.click(screen.getByRole('button', { name: /yes/i }));
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
    // Buttons should still be visible for retry
    expect(screen.getByRole('button', { name: /yes/i })).toBeInTheDocument();
    shouldSimulateError = false;
  });
});
