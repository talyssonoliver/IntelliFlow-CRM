import { describe, it, expect } from "vitest";
import { AIOutputReview, AI_OUTPUT_TYPES, REVIEW_SLA_CONFIG, type CreateReviewProps } from "../AIOutputReview";
import { ReviewStatus, ReviewDecision } from "../ReviewStatus";

const defaultProps: CreateReviewProps = {
  tenantId: "tenant-1", outputType: "LEAD_SCORING",
  outputPayload: { score: 80 }, confidence: 0.75,
};

const UUID1 = "a0000000-0000-4000-8000-000000000001";
const UUID2 = "a0000000-0000-4000-8000-000000000002";
const REVIEWER1 = "b0000000-0000-4000-8000-000000000001";
const REVIEWER2 = "b0000000-0000-4000-8000-000000000002";

describe("AIOutputReview additional coverage", () => {
  describe("create with custom SLA", () => {
    it("uses custom slaHours", () => {
      const review = AIOutputReview.create({ ...defaultProps, slaHours: 48 });
      expect(review.slaDeadline.getTime()).toBeGreaterThan(Date.now() + 47 * 3600000);
    });
    it("uses custom id", () => {
      const review = AIOutputReview.create({ ...defaultProps, id: UUID1 });
      expect(review.id.toValue()).toBe(UUID1);
    });
  });

  describe("reconstitute", () => {
    it("with all fields", () => {
      const lockedAt = new Date();
      const lockExp = new Date(Date.now() + 300000);
      const review = AIOutputReview.reconstitute(
        UUID1, "tenant-1", "SENTIMENT_ANALYSIS", { data: 1 }, 0.9,
        ReviewStatus.IN_REVIEW, new Date(Date.now() + 86400000), 1,
        REVIEWER1, lockedAt, lockExp, REVIEWER1, ReviewDecision.APPROVED, "Good"
      );
      expect(review.lockedBy).toBe(REVIEWER1);
      expect(review.lockedAt).toBe(lockedAt);
      expect(review.lockExpiresAt).toBe(lockExp);
      expect(review.reviewerId).toBe(REVIEWER1);
      expect(review.reviewDecision).toBe(ReviewDecision.APPROVED);
      expect(review.reviewNotes).toBe("Good");
      expect(review.escalationDepth).toBe(1);
    });
    it("without optional fields", () => {
      const review = AIOutputReview.reconstitute(
        UUID2, "t", "AUTO_RESPONSE", {}, 0.5,
        ReviewStatus.PENDING, new Date(Date.now() + 86400000), 0
      );
      expect(review.lockedBy).toBeUndefined();
      expect(review.reviewerId).toBeUndefined();
    });
  });

  describe("claim edge cases", () => {
    it("reclaim after lock expired", () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim(REVIEWER1);
      (review as any)._lockExpiresAt = new Date(Date.now() - 1000);
      expect(review.claim(REVIEWER2).isSuccess).toBe(true);
      expect(review.lockedBy).toBe(REVIEWER2);
    });
    it("cannot reclaim when already IN_REVIEW with active lock", () => {
      const review = AIOutputReview.create(defaultProps);
      review.claim(REVIEWER1);
      const r = review.claim(REVIEWER2);
      expect(r.isFailure).toBe(true);
    });
  });

  describe("escalate from ESCALATED", () => {
    it("allows further escalation", () => {
      const review = AIOutputReview.create(defaultProps);
      review.escalate("reason 1");
      expect(review.escalate("reason 2").isSuccess).toBe(true);
      expect(review.escalationDepth).toBe(2);
    });
  });

  describe("isSlaBreached", () => {
    it("false when not passed", () => {
      expect(AIOutputReview.create(defaultProps).isSlaBreached()).toBe(false);
    });
    it("true when passed", () => {
      const r = AIOutputReview.create(defaultProps);
      (r as any)._slaDeadline = new Date(Date.now() - 1000);
      expect(r.isSlaBreached()).toBe(true);
    });
  });

  describe("approve/reject clears lock", () => {
    it("approve clears lock", () => {
      const r = AIOutputReview.create(defaultProps);
      r.claim(REVIEWER1); r.approve(REVIEWER1, "Good");
      expect(r.lockedBy).toBeUndefined();
      expect(r.lockedAt).toBeUndefined();
      expect(r.lockExpiresAt).toBeUndefined();
    });
    it("reject clears lock", () => {
      const r = AIOutputReview.create(defaultProps);
      r.claim(REVIEWER1); r.reject(REVIEWER1, ReviewDecision.REJECTED_ACCURACY, "Bad");
      expect(r.lockedBy).toBeUndefined();
    });
  });

  describe("constants", () => {
    it("AI_OUTPUT_TYPES", () => {
      expect(AI_OUTPUT_TYPES).toContain("LEAD_SCORING");
      expect(AI_OUTPUT_TYPES).toContain("AUTO_RESPONSE");
      expect(AI_OUTPUT_TYPES.length).toBe(6);
    });
    it("REVIEW_SLA_CONFIG", () => {
      expect(REVIEW_SLA_CONFIG.DEFAULT_SLA_HOURS).toBe(24);
      expect(REVIEW_SLA_CONFIG.LOCK_DURATION_MINUTES).toBe(5);
      expect(REVIEW_SLA_CONFIG.MAX_ESCALATION_DEPTH).toBe(3);
    });
  });

  describe("getters", () => {
    it("createdAt and updatedAt", () => {
      const r = AIOutputReview.create(defaultProps);
      expect(r.createdAt).toBeInstanceOf(Date);
      expect(r.updatedAt).toBeInstanceOf(Date);
    });
  });
});
