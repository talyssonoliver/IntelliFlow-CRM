import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewCard } from '../ReviewCard';
import type { ReviewResponse } from '@intelliflow/validators/ai-review';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/agent-approvals/ai-review',
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function makeReview(overrides: Partial<ReviewResponse> = {}): ReviewResponse {
  return {
    id: 'review-1',
    tenantId: 'tenant-1',
    outputType: 'LEAD_SCORING',
    outputPayload: { score: 0.85 },
    confidence: 0.85,
    status: 'PENDING',
    slaDeadline: new Date(Date.now() + 3600_000), // 1h from now
    escalationDepth: 0,
    lockedBy: null,
    lockedAt: null,
    lockExpiresAt: null,
    reviewerId: null,
    reviewDecision: null,
    reviewNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ReviewResponse;
}

const defaultProps = {
  lockToken: null as string | null,
  currentUserId: 'user-1',
  onClaim: vi.fn(),
  onApprove: vi.fn(),
  onReject: vi.fn(),
  onEscalate: vi.fn(),
  isMutating: false,
};

describe('ReviewCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders output type label for LEAD_SCORING', () => {
    render(<ReviewCard review={makeReview()} {...defaultProps} />);
    expect(screen.getByText('Lead Scoring')).toBeDefined();
  });

  it('renders output type label for AUTO_RESPONSE', () => {
    render(<ReviewCard review={makeReview({ outputType: 'AUTO_RESPONSE' })} {...defaultProps} />);
    expect(screen.getByText('Auto-Response')).toBeDefined();
  });

  it('renders StatusBadge with review status', () => {
    render(<ReviewCard review={makeReview()} {...defaultProps} />);
    expect(screen.getByText('Pending')).toBeDefined();
  });

  it('renders ConfidenceIndicator', () => {
    render(<ReviewCard review={makeReview()} {...defaultProps} />);
    // ConfidenceIndicator renders a progressbar
    expect(screen.getByRole('progressbar')).toBeDefined();
  });

  describe('PENDING status', () => {
    it('shows Claim and Preview buttons', () => {
      render(<ReviewCard review={makeReview()} {...defaultProps} />);
      expect(screen.getByText('Claim')).toBeDefined();
      expect(screen.getByText('Preview')).toBeDefined();
    });

    it('calls onClaim with reviewId when Claim clicked', () => {
      const onClaim = vi.fn();
      render(<ReviewCard review={makeReview()} {...defaultProps} onClaim={onClaim} />);
      fireEvent.click(screen.getByText('Claim'));
      expect(onClaim).toHaveBeenCalledWith('review-1');
    });
  });

  describe('IN_REVIEW status (own claim)', () => {
    it('shows Approve, Reject, Escalate buttons', () => {
      render(
        <ReviewCard
          review={makeReview({
            status: 'IN_REVIEW',
            lockedBy: 'user-1',
          })}
          {...defaultProps}
          lockToken="token-abc"
        />
      );
      expect(screen.getByText('Approve')).toBeDefined();
      expect(screen.getByText('Reject')).toBeDefined();
      expect(screen.getByText('Escalate')).toBeDefined();
    });

    it('calls onApprove with reviewId and lockToken', () => {
      const onApprove = vi.fn();
      render(
        <ReviewCard
          review={makeReview({
            status: 'IN_REVIEW',
            lockedBy: 'user-1',
          })}
          {...defaultProps}
          lockToken="token-abc"
          onApprove={onApprove}
        />
      );
      fireEvent.click(screen.getByText('Approve'));
      expect(onApprove).toHaveBeenCalledWith('review-1', 'token-abc');
    });
  });

  describe('IN_REVIEW status (other claim)', () => {
    it('shows "Claimed by another reviewer" badge', () => {
      render(
        <ReviewCard
          review={makeReview({
            status: 'IN_REVIEW',
            lockedBy: 'other-user',
          })}
          {...defaultProps}
        />
      );
      expect(screen.getByText('Claimed by another reviewer')).toBeDefined();
    });
  });

  describe('ESCALATED status', () => {
    it('shows Claim button', () => {
      render(<ReviewCard review={makeReview({ status: 'ESCALATED' })} {...defaultProps} />);
      expect(screen.getByText('Claim')).toBeDefined();
    });
  });

  describe('APPROVED status', () => {
    it('shows View button, no action buttons', () => {
      render(<ReviewCard review={makeReview({ status: 'APPROVED' })} {...defaultProps} />);
      expect(screen.getByText('View')).toBeDefined();
      expect(screen.queryByText('Claim')).toBeNull();
      expect(screen.queryByText('Approve')).toBeNull();
    });
  });

  describe('REJECTED status', () => {
    it('shows View button, no action buttons', () => {
      render(<ReviewCard review={makeReview({ status: 'REJECTED' })} {...defaultProps} />);
      expect(screen.getByText('View')).toBeDefined();
      expect(screen.queryByText('Claim')).toBeNull();
    });
  });

  describe('EXPIRED status', () => {
    it('shows View button, no action buttons', () => {
      render(<ReviewCard review={makeReview({ status: 'EXPIRED' })} {...defaultProps} />);
      expect(screen.getByText('View')).toBeDefined();
      expect(screen.queryByText('Claim')).toBeNull();
    });
  });

  it('disables buttons when isMutating=true', () => {
    render(<ReviewCard review={makeReview()} {...defaultProps} isMutating />);
    const claimBtn = screen.getByRole('button', { name: /claim/i });
    expect(claimBtn).toHaveProperty('disabled', true);
  });

  it('shows red border styling when SLA breached', () => {
    const { container } = render(
      <ReviewCard
        review={makeReview({
          slaDeadline: new Date(Date.now() - 3600_000), // 1h ago
        })}
        {...defaultProps}
      />
    );
    // Check for the ring-1 class indicating SLA breach
    const card = container.firstElementChild;
    expect(card?.className).toContain('ring-1');
  });

  describe('Reject form', () => {
    it('shows textarea and calls onReject with notes', () => {
      const onReject = vi.fn();
      render(
        <ReviewCard
          review={makeReview({
            status: 'IN_REVIEW',
            lockedBy: 'user-1',
          })}
          {...defaultProps}
          lockToken="token-abc"
          onReject={onReject}
        />
      );
      fireEvent.click(screen.getByText('Reject'));
      const textarea = screen.getByPlaceholderText(/rejection reason/i);
      fireEvent.change(textarea, { target: { value: 'Bad quality' } });
      fireEvent.click(screen.getByText('Confirm Rejection'));
      expect(onReject).toHaveBeenCalledWith('review-1', 'token-abc', 'Bad quality');
    });
  });
});
