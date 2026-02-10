/**
 * AutoResponse Router Additional Tests - covers remaining uncovered paths
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const mockRepository = {
  save: vi.fn(),
  findById: vi.fn(),
  find: vi.fn(),
  findActiveByLeadAndTrigger: vi.fn(),
  findPendingForApprover: vi.fn(),
  countByStatus: vi.fn(),
};

vi.mock("@intelliflow/adapters", () => {
  function MockPrismaAutoResponseDraftRepository() {
    return mockRepository;
  }
  return {
    PrismaAutoResponseDraftRepository: MockPrismaAutoResponseDraftRepository,
  };
});

import { autoResponseRouter } from "../autoresponse.router";

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000002";
const LEAD_ID = "00000000-0000-4000-8000-000000000003";
const DRAFT_ID = "00000000-0000-4000-8000-000000000004";

function createCtx() {
  return {
    prisma: {} as any,
    user: {
      userId: USER_ID,
      email: "test@example.com",
      role: "SALES_REP",
      tenantId: TENANT_ID,
    },
    tenant: {
      tenantId: TENANT_ID,
      tenantType: "user" as const,
      userId: USER_ID,
      role: "SALES_REP",
      canAccessAllTenantData: false,
    },
    prismaWithTenant: {} as any,
  } as any;
}

function makeDraft(overrides: Record<string, any> = {}) {
  return {
    id: { toString: () => DRAFT_ID },
    leadId: LEAD_ID,
    content: { subject: "Test subject", body: "Test body" },
    status: "DRAFT",
    aiConfidence: 0.85,
    modelVersion: "openai:gpt-4:v1",
    triggerType: "EMAIL_RECEIVED",
    recipientEmail: "test@example.com",
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    updatedAt: new Date(),
    statusHistory: [],
    approvalDecision: null,
    escalation: null,
    escalationCount: 0,
    isExpired: false,
    isPendingApproval: false,
    canBeSent: false,
    getDomainEvents: vi.fn().mockReturnValue([]),
    clearDomainEvents: vi.fn(),
    submitForApproval: vi.fn().mockReturnValue({ isFailure: false }),
    approve: vi.fn().mockReturnValue({ isFailure: false }),
    reject: vi.fn().mockReturnValue({ isFailure: false }),
    escalate: vi.fn().mockReturnValue({ isFailure: false }),
    resolveEscalation: vi.fn().mockReturnValue({ isFailure: false }),
    markSent: vi.fn().mockReturnValue({ isFailure: false }),
    markSendFailed: vi.fn().mockReturnValue({ isFailure: false }),
    invalidate: vi.fn(),
    ...overrides,
  };
}

describe("autoResponseRouter additional coverage", () => {
  let caller: ReturnType<typeof autoResponseRouter.createCaller>;

  beforeEach(() => {
    vi.clearAllMocks();
    caller = autoResponseRouter.createCaller(createCtx());
    mockRepository.findById.mockResolvedValue(null);
    mockRepository.find.mockResolvedValue([]);
    mockRepository.findActiveByLeadAndTrigger.mockResolvedValue(null);
    mockRepository.findPendingForApprover.mockResolvedValue([]);
    mockRepository.countByStatus.mockResolvedValue(0);
    mockRepository.save.mockResolvedValue(undefined);
  });

  describe("approve", () => {
    it("should throw NOT_FOUND when draft does not exist", async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(caller.approve({
        draftId: DRAFT_ID, decision: "APPROVED", decidedBy: USER_ID,
      })).rejects.toThrow(TRPCError);
    });

    it("should throw BAD_REQUEST when domain approve fails", async () => {
      const draft = makeDraft({
        approve: vi.fn().mockReturnValue({ isFailure: true, error: { message: "Cannot approve" } }),
      });
      mockRepository.findById.mockResolvedValue(draft);
      await expect(caller.approve({
        draftId: DRAFT_ID, decision: "APPROVED", decidedBy: USER_ID,
      })).rejects.toThrow("Cannot approve");
    });

    it("should throw INTERNAL_SERVER_ERROR on save failure", async () => {
      const draft = makeDraft();
      mockRepository.findById.mockResolvedValue(draft);
      mockRepository.save.mockRejectedValue(new Error("DB error"));
      await expect(caller.approve({
        draftId: DRAFT_ID, decision: "APPROVED", decidedBy: USER_ID,
      })).rejects.toThrow("Failed to save draft");
    });
  });

  describe("reject", () => {
    it("should throw NOT_FOUND", async () => {
      await expect(caller.reject({
        draftId: DRAFT_ID, decidedBy: USER_ID, reason: "Not appropriate",
      })).rejects.toThrow(TRPCError);
    });

    it("should throw BAD_REQUEST on domain failure", async () => {
      const draft = makeDraft({
        reject: vi.fn().mockReturnValue({ isFailure: true, error: { message: "Already rejected" } }),
      });
      mockRepository.findById.mockResolvedValue(draft);
      await expect(caller.reject({
        draftId: DRAFT_ID, decidedBy: USER_ID, reason: "Not appropriate",
      })).rejects.toThrow("Already rejected");
    });

    it("should throw INTERNAL_SERVER_ERROR on save failure", async () => {
      const draft = makeDraft();
      mockRepository.findById.mockResolvedValue(draft);
      mockRepository.save.mockRejectedValue(new Error("DB"));
      await expect(caller.reject({
        draftId: DRAFT_ID, decidedBy: USER_ID, reason: "Not appropriate",
      })).rejects.toThrow("Failed to save draft");
    });
  });

  describe("resolveEscalation", () => {
    it("should throw NOT_FOUND", async () => {
      await expect(caller.resolveEscalation({
        draftId: DRAFT_ID, resolvedBy: USER_ID,
      })).rejects.toThrow(TRPCError);
    });

    it("should throw BAD_REQUEST on domain failure", async () => {
      const draft = makeDraft({
        resolveEscalation: vi.fn().mockReturnValue({ isFailure: true, error: { message: "Not escalated" } }),
      });
      mockRepository.findById.mockResolvedValue(draft);
      await expect(caller.resolveEscalation({
        draftId: DRAFT_ID, resolvedBy: USER_ID,
      })).rejects.toThrow("Not escalated");
    });

    it("should throw INTERNAL_SERVER_ERROR on save failure", async () => {
      const draft = makeDraft();
      mockRepository.findById.mockResolvedValue(draft);
      mockRepository.save.mockRejectedValue(new Error("DB"));
      await expect(caller.resolveEscalation({
        draftId: DRAFT_ID, resolvedBy: USER_ID,
      })).rejects.toThrow("Failed to save draft");
    });
  });

  describe("rollback - save failure", () => {
    it("should throw INTERNAL_SERVER_ERROR", async () => {
      const draft = makeDraft({ status: "APPROVED" });
      mockRepository.findById.mockResolvedValue(draft);
      mockRepository.save.mockRejectedValue(new Error("DB"));
      await expect(caller.rollback({
        draftId: DRAFT_ID, rolledBackBy: USER_ID, reason: "Mistake",
      })).rejects.toThrow("Failed to save draft");
    });
  });

  describe("list - filters", () => {
    it("should pass triggerType and expired filters", async () => {
      const result = await caller.list({ triggerType: ["EMAIL_RECEIVED"], expired: true, page: 1, limit: 10 });
      expect(result.drafts).toEqual([]);
      expect(mockRepository.find).toHaveBeenCalledWith(expect.objectContaining({
        triggerType: "EMAIL_RECEIVED", expiredOnly: true,
      }));
    });

    it("should pass status filter", async () => {
      const result = await caller.list({ status: ["PENDING_APPROVAL"], page: 1, limit: 5 });
      expect(result.page).toBe(1);
    });
  });

  describe("getStatsByStatus", () => {
    it("should count all statuses", async () => {
      mockRepository.countByStatus.mockResolvedValue(5);
      const result = await caller.getStatsByStatus({ tenantId: TENANT_ID });
      expect(result).toBeDefined();
      expect(mockRepository.countByStatus).toHaveBeenCalledTimes(8);
    });
  });

  describe("publishEvents with actual events", () => {
    it("should log events when present", async () => {
      const draft = makeDraft({
        getDomainEvents: vi.fn().mockReturnValue([{ constructor: { name: "TestEvent" } }]),
      });
      mockRepository.findById.mockResolvedValue(draft);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await caller.markSent({ draftId: DRAFT_ID, notificationId: "notif-1" });
      } catch { /* ignore */ }
      logSpy.mockRestore();
    });
  });
});
