import { describe, it, expect, beforeEach } from 'vitest';
import { AIOutputReview, CreateReviewProps, AIOutputType } from '../AIOutputReview';
import { ReviewId } from '../ReviewId';
import { ConfidenceScore } from '../ConfidenceScore';
import { ReviewStatus, ReviewDecision } from '../ReviewStatus';
import { ReviewRequestedEvent } from '../events/ReviewRequestedEvent';
import { ReviewApprovedEvent } from '../events/ReviewApprovedEvent';
import { ReviewRejectedEvent } from '../events/ReviewRejectedEvent';
import { ReviewEscalatedEvent } from '../events/ReviewEscalatedEvent';

describe('AIOutputReview', () => {
  const defaultProps: CreateReviewProps = {
    tenantId: 'tenant-123',
    outputType: 'LEAD_SCORING' as AIOutputType,
    outputPayload: { leadId: 'lead-1', score: 75 },
    confidence: 0.75, // Below default threshold
  };

  describe('create', () => {
    it('should create review with PENDING status', () => {
      const review = AIOutputReview.create(defaultProps);
      expect(review.status).toBe(ReviewStatus.PENDING);
    });

    it('should emit ReviewRequestedEvent on creation', () => {
      const review = AIOutputReview.create(defaultProps);
      const events = review.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ReviewRequestedEvent);
    });

    it('should calculate SLA deadline correctly (24 hours from creation)', () => {
      const before = new Date();
      const review = AIOutputReview.create(defaultProps);
      const after = new Date();

      const expectedMinDeadline = new Date(before.getTime() + 24 * 60 * 60 * 1000);
      const expectedMaxDeadline = new Date(after.getTime() + 24 * 60 * 60 * 1000);

      expect(review.slaDeadline.getTime()).toBeGreaterThanOrEqual(
        expectedMinDeadline.getTime() - 1000
      );
      expect(review.slaDeadline.getTime()).toBeLessThanOrEqual(
        expectedMaxDeadline.getTime() + 1000
      );
    });

    it('should initialize escalation depth to 0', () => {
      const review = AIOutputReview.create(defaultProps);
      expect(review.escalationDepth).toBe(0);
    });

    it('should store output payload correctly', () => {
      const review = AIOutputReview.create(defaultProps);
      expect(review.outputPayload).toEqual(defaultProps.outputPayload);
    });

    it('should store confidence score correctly', () => {
      const review = AIOutputReview.create(defaultProps);
      expect(review.confidence.toValue()).toBe(0.75);
    });
  });

  describe('claim', () => {
    it('should transition from PENDING to IN_REVIEW when claimed', () => {
      const review = AIOutputReview.create(defaultProps);
      const result = review.claim('reviewer-123');
      expect(result.isSuccess).toBe(true);
      expect(review.status).toBe(ReviewStatus.IN_REVIEW);
    });

    it('should set lock details when claimed', () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');
      expect(review.lockedBy).toBe('reviewer-123');
      expect(review.lockedAt).toBeDefined();
      expect(review.lockExpiresAt).toBeDefined();
    });

    it('should set lock expiry to 5 minutes from claim time', () => {
      const before = new Date();
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');

      const expectedMinExpiry = new Date(before.getTime() + 5 * 60 * 1000);
      expect(review.lockExpiresAt!.getTime()).toBeGreaterThanOrEqual(
        expectedMinExpiry.getTime() - 1000
      );
    });

    it('should reject claim on already locked review', () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');
      const result = review.claim('reviewer-456');
      expect(result.isFailure).toBe(true);
    });

    it('should allow claim when lock has expired', () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');
      // Simulate expired lock
      (review as any)._lockExpiresAt = new Date(Date.now() - 1000); // test: access internal state
      const result = review.claim('reviewer-456');
      expect(result.isSuccess).toBe(true);
      expect(review.lockedBy).toBe('reviewer-456');
    });
  });

  describe('release', () => {
    it('should release lock and return to PENDING', () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');
      const result = review.release('reviewer-123');
      expect(result.isSuccess).toBe(true);
      expect(review.status).toBe(ReviewStatus.PENDING);
      expect(review.lockedBy).toBeUndefined();
    });

    it('should reject release from non-lock holder', () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');
      const result = review.release('reviewer-456');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('approve', () => {
    it('should transition from PENDING to APPROVED', () => {
      const review = AIOutputReview.create(defaultProps);
      const result = review.approve('reviewer-123');
      expect(result.isSuccess).toBe(true);
      expect(review.status).toBe(ReviewStatus.APPROVED);
    });

    it('should transition from IN_REVIEW to APPROVED', () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');
      const result = review.approve('reviewer-123');
      expect(result.isSuccess).toBe(true);
      expect(review.status).toBe(ReviewStatus.APPROVED);
    });

    it('should emit ReviewApprovedEvent', () => {
      const review = AIOutputReview.create(defaultProps);
      review.clearDomainEvents(); // Clear creation event
      review.approve('reviewer-123', 'Looks good');
      const events = review.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ReviewApprovedEvent);
    });

    it('should store reviewer notes', () => {
      const review = AIOutputReview.create(defaultProps);
      review.approve('reviewer-123', 'Approved with minor concerns');
      expect(review.reviewNotes).toBe('Approved with minor concerns');
    });

    it('should reject approval from invalid states', () => {
      const review = AIOutputReview.create(defaultProps);
      review.approve('reviewer-123');
      const result = review.approve('reviewer-456');
      expect(result.isFailure).toBe(true);
    });
  });

  describe('reject', () => {
    it('should transition from PENDING to REJECTED', () => {
      const review = AIOutputReview.create(defaultProps);
      const result = review.reject('reviewer-123', ReviewDecision.REJECTED_QUALITY, 'Poor quality');
      expect(result.isSuccess).toBe(true);
      expect(review.status).toBe(ReviewStatus.REJECTED);
    });

    it('should transition from IN_REVIEW to REJECTED', () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim('reviewer-123');
      const result = review.reject('reviewer-123', ReviewDecision.REJECTED_ACCURACY, 'Inaccurate');
      expect(result.isSuccess).toBe(true);
      expect(review.status).toBe(ReviewStatus.REJECTED);
    });

    it('should require rejection reason', () => {
      const review = AIOutputReview.create(defaultProps);
      const result = review.reject('reviewer-123', ReviewDecision.REJECTED_QUALITY, '');
      expect(result.isFailure).toBe(true);
    });

    it('should emit ReviewRejectedEvent with decision type', () => {
      const review = AIOutputReview.create(defaultProps);
      review.clearDomainEvents();
      review.reject('reviewer-123', ReviewDecision.REJECTED_SAFETY, 'Safety concern');
      const events = review.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ReviewRejectedEvent);
      const event = events[0] as ReviewRejectedEvent;
      expect(event.decision).toBe(ReviewDecision.REJECTED_SAFETY);
    });
  });

  describe('escalate', () => {
    it('should increment escalation depth', () => {
      const review = AIOutputReview.create(defaultProps);
      const result = review.escalate();
      expect(result.isSuccess).toBe(true);
      expect(review.escalationDepth).toBe(1);
    });

    it('should transition to ESCALATED status', () => {
      const review = AIOutputReview.create(defaultProps);
      review.escalate();
      expect(review.status).toBe(ReviewStatus.ESCALATED);
    });

    it('should emit ReviewEscalatedEvent', () => {
      const review = AIOutputReview.create(defaultProps);
      review.clearDomainEvents();
      review.escalate();
      const events = review.domainEvents;
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ReviewEscalatedEvent);
    });

    it('should reject escalation when max depth reached (3)', () => {
      const review = AIOutputReview.create(defaultProps);
      review.escalate(); // depth 1
      // Reset status to allow further escalations
      (review as any)._status = ReviewStatus.PENDING; // test: access internal state
      review.escalate(); // depth 2
      (review as any)._status = ReviewStatus.PENDING; // test: access internal state
      review.escalate(); // depth 3
      (review as any)._status = ReviewStatus.PENDING; // test: access internal state
      const result = review.escalate(); // should fail at depth 3
      expect(result.isFailure).toBe(true);
      expect(review.escalationDepth).toBe(3);
    });

    it('should reject escalation from non-PENDING states', () => {
      const review = AIOutputReview.create(defaultProps);
      review.approve('reviewer-123');
      const result = review.escalate();
      expect(result.isFailure).toBe(true);
    });
  });

  describe('canEscalate', () => {
    it('should return true when depth < MAX_ESCALATION_DEPTH and status is PENDING', () => {
      const review = AIOutputReview.create(defaultProps);
      expect(review.canEscalate()).toBe(true);
    });

    it('should return false when depth >= MAX_ESCALATION_DEPTH', () => {
      const review = AIOutputReview.create(defaultProps);
      review.escalate();
      (review as any)._status = ReviewStatus.PENDING; // test: access internal state
      review.escalate();
      (review as any)._status = ReviewStatus.PENDING; // test: access internal state
      review.escalate();
      (review as any)._status = ReviewStatus.PENDING; // test: access internal state
      expect(review.canEscalate()).toBe(false);
    });

    it('should return false when status is not PENDING or ESCALATED', () => {
      const review = AIOutputReview.create(defaultProps);
      review.approve('reviewer-123');
      expect(review.canEscalate()).toBe(false);
    });
  });

  describe('expire', () => {
    it('should transition to EXPIRED when SLA deadline passed', () => {
      const review = AIOutputReview.create(defaultProps);
      // Simulate past deadline
      (review as any)._slaDeadline = new Date(Date.now() - 1000); // test: access internal state
      const result = review.expire();
      expect(result.isSuccess).toBe(true);
      expect(review.status).toBe(ReviewStatus.EXPIRED);
    });

    it('should reject expiration if deadline not passed', () => {
      const review = AIOutputReview.create(defaultProps);
      const result = review.expire();
      expect(result.isFailure).toBe(true);
    });
  });

  describe('state machine invariants', () => {
    it('should not allow transition from APPROVED to any state', () => {
      const review = AIOutputReview.create(defaultProps);
      review.approve('reviewer-123');

      expect(review.reject('r', ReviewDecision.REJECTED_QUALITY, 'x').isFailure).toBe(true);
      expect(review.escalate().isFailure).toBe(true);
      expect(review.claim('r').isFailure).toBe(true);
    });

    it('should not allow transition from REJECTED to any state', () => {
      const review = AIOutputReview.create(defaultProps);
      review.reject('reviewer-123', ReviewDecision.REJECTED_QUALITY, 'reason');

      expect(review.approve('r').isFailure).toBe(true);
      expect(review.escalate().isFailure).toBe(true);
      expect(review.claim('r').isFailure).toBe(true);
    });

    it('should not allow transition from EXPIRED to any state', () => {
      const review = AIOutputReview.create(defaultProps);
      (review as any)._slaDeadline = new Date(Date.now() - 1000); // test: access internal state
      review.expire();

      expect(review.approve('r').isFailure).toBe(true);
      expect(review.reject('r', ReviewDecision.REJECTED_QUALITY, 'x').isFailure).toBe(true);
      expect(review.escalate().isFailure).toBe(true);
    });
  });
});
