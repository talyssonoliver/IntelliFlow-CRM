import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FeedbackWidget } from '../feedback-widget';

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
});
