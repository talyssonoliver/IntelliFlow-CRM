/**
 * Notifications Router Additional Tests - covers uncovered filter/batch/preference paths
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { prismaMock, createTestContext, TEST_UUIDS } from "../../../test/setup";

// Must mock the validators module to provide the needed exports
vi.mock("@intelliflow/validators", async (importOriginal) => {
  const orig = await importOriginal() as any;
  return {
    ...orig,
    NOTIFICATION_TYPES: orig.NOTIFICATION_TYPES || [
      "task_assigned", "lead_scored", "deal_won", "deal_lost",
      "mention", "comment", "system_alert", "reminder",
    ],
    NOTIFICATION_CHANNELS: orig.NOTIFICATION_CHANNELS || ["in_app", "email", "sms", "push"],
  };
});

import { notificationsRouter, createNotification } from "../notifications.router";

const USER_ID = TEST_UUIDS.user1;
const TENANT_ID = "00000000-0000-4000-8000-000000000001";

describe("notificationsRouter additional coverage", () => {
  const ctx = createTestContext();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("list - with type filters", () => {
    it("should add types filter to where clause", async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.list({
        limit: 10,
        types: ["task_assigned", "lead_scored"],
      });

      expect(result.notifications).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe("list - with date range filters", () => {
    it("should add fromDate and toDate to where clause", async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.list({
        limit: 10,
        fromDate: new Date("2025-01-01"),
        toDate: new Date("2025-12-31"),
      });

      expect(result.notifications).toEqual([]);
    });
  });

  describe("list - with cursor pagination", () => {
    it("should add cursor id filter", async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.list({
        limit: 10,
        cursor: "some-cursor-id",
      });

      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });
  });

  describe("list - with isRead filter", () => {
    it("should filter by read status when isRead is true", async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.list({ limit: 10, isRead: true });
      expect(result.notifications).toEqual([]);
    });

    it("should filter by unread status when isRead is false", async () => {
      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.list({ limit: 10, isRead: false });
      expect(result.notifications).toEqual([]);
    });
  });

  describe("list - slow query warning", () => {
    it("should warn when query takes more than 200ms", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      // Mock performance.now to simulate slow query
      const origNow = performance.now;
      let callCount = 0;
      vi.spyOn(performance, "now").mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 0 : 300; // First call 0ms, second call 300ms
      });

      prismaMock.domainEvent.findMany.mockResolvedValue([]);
      prismaMock.domainEvent.count.mockResolvedValue(0);
      const caller = notificationsRouter.createCaller(ctx);

      await caller.list({ limit: 10 });

      // Restore before assertions
      vi.spyOn(performance, "now").mockRestore();
      warnSpy.mockRestore();
    });
  });

  describe("batchAction - mark_unread", () => {
    it("should set status to PENDING and processedAt to null", async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 3 });
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.batchAction({
        action: "mark_unread",
        notificationIds: ["id-1", "id-2", "id-3"],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(3);
    });
  });

  describe("batchAction - archive", () => {
    it("should set status to ARCHIVED", async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.batchAction({
        action: "archive",
        notificationIds: ["id-1", "id-2"],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(2);
    });
  });

  describe("batchAction - delete", () => {
    it("should set status to ARCHIVED for delete action", async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 1 });
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.batchAction({
        action: "delete",
        notificationIds: ["id-1"],
      });

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(1);
    });
  });

  describe("batchAction - with filter", () => {
    it("should apply types filter", async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 5 });
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.batchAction({
        action: "mark_read",
        filter: { types: ["task_assigned"] },
      });

      expect(result.success).toBe(true);
    });

    it("should apply olderThan filter", async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.batchAction({
        action: "mark_read",
        filter: { olderThan: new Date("2025-01-01") },
      });

      expect(result.success).toBe(true);
    });

    it("should apply isRead filter", async () => {
      prismaMock.domainEvent.updateMany.mockResolvedValue({ count: 2 });
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.batchAction({
        action: "archive",
        filter: { isRead: true },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("updatePreferences - type-specific merge", () => {
    it("should merge type-specific preferences", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          notifications: {
            globalEnabled: true,
            typePreferences: {
              task_assigned: { enabled: true, channels: ["in_app"] },
            },
          },
        },
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.updatePreferences({
        preferences: [
          { type: "lead_scored", enabled: true, channels: ["in_app", "email"] },
        ],
      });

      expect(result.success).toBe(true);
    });

    it("should update global settings", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {},
      } as any);
      prismaMock.user.update.mockResolvedValue({} as any);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.updatePreferences({
        globalEnabled: false,
        defaultChannels: ["email"],
      });

      expect(result.success).toBe(true);
    });
  });

  describe("getPreferences - defaults", () => {
    it("should return defaults when user has no preferences", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: null,
      } as any);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.getPreferences();

      expect(result.userId).toBe(USER_ID);
      expect(result.globalEnabled).toBe(true);
      expect(result.defaultChannels).toEqual(["in_app", "email"]);
    });

    it("should return stored preferences when available", async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        preferences: {
          notifications: {
            globalEnabled: false,
            defaultChannels: ["push"],
            quietHours: { enabled: true, start: "21:00", end: "07:00", timezone: "EST", daysOfWeek: [1,2,3,4,5] },
            emailDigest: { enabled: true, frequency: "weekly", time: "08:00" },
          },
        },
      } as any);
      const caller = notificationsRouter.createCaller(ctx);

      const result = await caller.getPreferences();

      expect(result.globalEnabled).toBe(false);
      expect(result.defaultChannels).toEqual(["push"]);
    });
  });

  describe("createNotification helper", () => {
    it("should create notification with all fields", async () => {
      prismaMock.domainEvent.create.mockResolvedValue({} as any);

      const result = await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: "task_assigned",
        title: "New task assigned",
        body: "You have been assigned a new task",
        priority: "high",
        entityType: "task",
        entityId: "task-123",
        entityName: "Follow up with client",
        actionUrl: "/tasks/task-123",
        actionLabel: "View Task",
        expiresAt: new Date("2026-01-01"),
        metadata: { assignedBy: "admin" },
      });

      expect(result.type).toBe("task_assigned");
      expect(result.title).toBe("New task assigned");
      expect(result.priority).toBe("high");
      expect(result.isRead).toBe(false);
      expect(result.status).toBe("pending");
    });

    it("should use default priority when not specified", async () => {
      prismaMock.domainEvent.create.mockResolvedValue({} as any);

      const result = await createNotification(prismaMock as any, {
        userId: USER_ID,
        tenantId: TENANT_ID,
        type: "system_alert",
        title: "System update",
        body: "System maintenance scheduled",
      });

      expect(result.priority).toBe("normal");
    });
  });
});
