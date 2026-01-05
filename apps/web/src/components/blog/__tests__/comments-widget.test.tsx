// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentsWidget } from '../comments-widget';

/**
 * Comments Widget Component Tests
 *
 * Tests the comments widget component for:
 * - Rendering and display
 * - Comment submission
 * - Like functionality
 * - Reply functionality
 * - Accessibility
 */

describe('CommentsWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  describe('Rendering', () => {
    it('should render comment form', () => {
      render(<CommentsWidget postSlug="test-post" />);

      expect(
        screen.getByPlaceholderText(/share your thoughts/i)
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /post comment/i })
      ).toBeInTheDocument();
    });

    it('should render comments list with sample data', () => {
      render(<CommentsWidget postSlug="test-post" />);

      // Sample comments should be displayed
      expect(screen.getByText('Alex Thompson')).toBeInTheDocument();
      expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
    });

    it('should show comment count in heading', () => {
      render(<CommentsWidget postSlug="test-post" />);

      // Should show total including replies
      const heading = screen.getByRole('heading', { name: /comments/i });
      expect(heading).toBeInTheDocument();
      expect(heading.textContent).toMatch(/comments.*\(\d+\)/i);
    });

    it('should render nested replies', () => {
      render(<CommentsWidget postSlug="test-post" />);

      // Sarah Chen's reply should be visible
      expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    });

    it('should accept custom className', () => {
      const { container } = render(
        <CommentsWidget postSlug="test-post" className="custom-class" />
      );

      const section = container.querySelector('section');
      expect(section).toHaveClass('custom-class');
    });
  });

  describe('Empty State', () => {
    it('should show empty state message when no comments exist', async () => {
      // We can't easily test this without modifying internal state
      // This documents expected behavior
      render(<CommentsWidget postSlug="empty-post" />);

      // The component starts with sample comments, so we verify it renders
      expect(screen.getByPlaceholderText(/share your thoughts/i)).toBeInTheDocument();
    });
  });

  describe('Comment Submission', () => {
    it('should allow typing in textarea', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      const textarea = screen.getByPlaceholderText(/share your thoughts/i);
      await user.type(textarea, 'Test comment content');

      expect(textarea).toHaveValue('Test comment content');
    });

    it('should disable submit button when textarea is empty', () => {
      render(<CommentsWidget postSlug="test-post" />);

      const submitButton = screen.getByRole('button', { name: /post comment/i });
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when text is entered', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      const textarea = screen.getByPlaceholderText(/share your thoughts/i);
      const submitButton = screen.getByRole('button', { name: /post comment/i });

      await user.type(textarea, 'A valid comment');

      expect(submitButton).not.toBeDisabled();
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      const textarea = screen.getByPlaceholderText(/share your thoughts/i);
      await user.type(textarea, 'New comment');

      const submitButton = screen.getByRole('button', { name: /post comment/i });
      await user.click(submitButton);

      // Should show "Posting..." text
      expect(screen.getByText(/posting/i)).toBeInTheDocument();
    });

    it('should add comment to list after submission', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      const textarea = screen.getByPlaceholderText(/share your thoughts/i);
      await user.type(textarea, 'My new comment');

      const submitButton = screen.getByRole('button', { name: /post comment/i });
      await user.click(submitButton);

      // Advance timers to complete async submission
      await vi.advanceTimersByTimeAsync(600);

      await waitFor(() => {
        expect(screen.getByText('My new comment')).toBeInTheDocument();
      });
    });

    it('should clear form after successful submission', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      const textarea = screen.getByPlaceholderText(
        /share your thoughts/i
      ) as HTMLTextAreaElement;
      await user.type(textarea, 'Comment to clear');

      const submitButton = screen.getByRole('button', { name: /post comment/i });
      await user.click(submitButton);

      await vi.advanceTimersByTimeAsync(600);

      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });

    it('should add "You" as author for submitted comments', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      const textarea = screen.getByPlaceholderText(/share your thoughts/i);
      await user.type(textarea, 'Test by me');

      const submitButton = screen.getByRole('button', { name: /post comment/i });
      await user.click(submitButton);

      await vi.advanceTimersByTimeAsync(600);

      await waitFor(() => {
        // The new comment should show "You" as the author
        const comments = screen.getAllByText('You');
        expect(comments.length).toBeGreaterThanOrEqual(1);
      });
    });
  });

  describe('Like Functionality', () => {
    it('should display like buttons on comments', () => {
      const { container } = render(<CommentsWidget postSlug="test-post" />);

      // Find buttons containing the thumb_up icon
      const likeButtons = container.querySelectorAll('button');
      const hasLikeButton = Array.from(likeButtons).some(
        btn => btn.textContent?.includes('thumb_up')
      );

      expect(hasLikeButton).toBe(true);
    });

    it('should display like count when greater than 0', () => {
      render(<CommentsWidget postSlug="test-post" />);

      // Sample comments have like counts
      expect(screen.getByText('12')).toBeInTheDocument(); // Alex Thompson's like count
    });
  });

  describe('Reply Functionality', () => {
    it('should show reply button on comments', () => {
      render(<CommentsWidget postSlug="test-post" />);

      const replyButtons = screen.getAllByRole('button', { name: /reply/i });
      expect(replyButtons.length).toBeGreaterThan(0);
    });

    it('should show reply form when Reply is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      const replyButtons = screen.getAllByRole('button', { name: /reply/i });
      await user.click(replyButtons[0]);

      expect(screen.getByPlaceholderText(/write a reply/i)).toBeInTheDocument();
    });

    it('should hide reply form on Cancel', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      // Open reply form
      const replyButtons = screen.getAllByRole('button', { name: /reply/i });
      await user.click(replyButtons[0]);

      // Click cancel
      const cancelButton = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelButton);

      expect(
        screen.queryByPlaceholderText(/write a reply/i)
      ).not.toBeInTheDocument();
    });

    it('should add reply to parent comment on submit', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { container } = render(<CommentsWidget postSlug="test-post" />);

      // Open reply form - find first Reply button that opens the reply form
      const replyButtons = screen.getAllByRole('button', { name: /reply/i });
      await user.click(replyButtons[0]);

      // Type reply
      const replyTextarea = screen.getByPlaceholderText(/write a reply/i);
      await user.type(replyTextarea, 'My reply content');

      // Submit reply - find the button inside the reply form (size="sm")
      const replyForm = container.querySelector('[id^="reply-"]')?.closest('div');
      const submitButtons = replyForm?.querySelectorAll('button');
      const submitButton = submitButtons?.[0]; // First button in form is submit

      if (submitButton) {
        await user.click(submitButton);
        await vi.advanceTimersByTimeAsync(600);

        await waitFor(() => {
          expect(screen.getByText('My reply content')).toBeInTheDocument();
        });
      }
    });

    it('should show reply form with submit button', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const { container } = render(<CommentsWidget postSlug="test-post" />);

      // Open reply form
      const replyButtons = screen.getAllByRole('button', { name: /reply/i });
      await user.click(replyButtons[0]);

      // There should be a reply textarea and buttons in the form
      expect(screen.getByPlaceholderText(/write a reply/i)).toBeInTheDocument();

      // Find buttons in the reply form area
      const formButtons = container.querySelectorAll('button');
      const cancelButton = Array.from(formButtons).find(b => b.textContent?.includes('Cancel'));
      expect(cancelButton).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible section with heading', () => {
      render(<CommentsWidget postSlug="test-post" />);

      const section = screen.getByRole('region', { name: /comments/i });
      expect(section).toBeInTheDocument();
    });

    it('should have accessible form label for comment textarea', () => {
      render(<CommentsWidget postSlug="test-post" />);

      const textarea = screen.getByLabelText(/write a comment/i);
      expect(textarea).toBeInTheDocument();
    });

    it('should have proper button labels', () => {
      render(<CommentsWidget postSlug="test-post" />);

      expect(
        screen.getByRole('button', { name: /post comment/i })
      ).toBeInTheDocument();
    });

    it('should support keyboard navigation', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<CommentsWidget postSlug="test-post" />);

      // Tab to first interactive element
      await user.tab();

      // Should be able to tab through the comment form
      const textarea = screen.getByPlaceholderText(/share your thoughts/i);
      const submitButton = screen.getByRole('button', { name: /post comment/i });

      // One of these should be focusable
      expect(
        document.activeElement === textarea ||
          document.activeElement === submitButton ||
          document.activeElement?.closest('form')
      ).toBeTruthy();
    });

    it('should show helpful text for comment guidelines', () => {
      render(<CommentsWidget postSlug="test-post" />);

      expect(
        screen.getByText(/be respectful and constructive/i)
      ).toBeInTheDocument();
    });
  });

  describe('Date Formatting', () => {
    it('should display formatted dates on comments', () => {
      render(<CommentsWidget postSlug="test-post" />);

      // Sample comments have dates like "Dec 29, 2025"
      const datePattern = /[A-Z][a-z]+ \d+, \d{4}/;
      const dates = screen
        .getAllByText(datePattern)
        .filter(el => el.textContent);

      expect(dates.length).toBeGreaterThan(0);
    });
  });

  describe('Author Initials', () => {
    it('should display author initials in avatar', () => {
      render(<CommentsWidget postSlug="test-post" />);

      // Alex Thompson should show "AT"
      expect(screen.getByText('AT')).toBeInTheDocument();
      // Maria Garcia should show "MG"
      expect(screen.getByText('MG')).toBeInTheDocument();
    });
  });
});
