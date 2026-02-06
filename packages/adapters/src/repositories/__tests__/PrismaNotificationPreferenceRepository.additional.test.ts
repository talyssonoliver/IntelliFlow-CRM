import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaNotificationPreferenceRepository } from '../PrismaNotificationPreferenceRepository';

vi.mock('@intelliflow/domain', () => ({
  NotificationPreference: {
    reconstitute: vi.fn().mockImplementation((id: string, props: any) => ({
      id, ...props,
      toJSON: () => ({ channels: props.channels, categories: props.categories }),
      isChannelEnabled: vi.fn().mockReturnValue(true),
      isCategoryEnabled: vi.fn().mockReturnValue(true),
      shouldDeliverNow: vi.fn().mockReturnValue(true),
      isInQuietHours: vi.fn().mockReturnValue(false),
    })),
    createDefault: vi.fn().mockImplementation((tenantId: string, userId: string) => ({
      id: 'pref_default', tenantId, userId,
      quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursEnabled: false,
      timezone: 'UTC', doNotDisturb: false,
      toJSON: () => ({ channels: {}, categories: {} }),
    })),
  },
}));

const mockPrisma = {
  notificationPreference: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
};

describe('PrismaNotificationPreferenceRepository', () => {
  let repo: PrismaNotificationPreferenceRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaNotificationPreferenceRepository(mockPrisma as any);
  });

  describe('save', () => {
    it('should upsert preference', async () => {
      mockPrisma.notificationPreference.upsert.mockResolvedValue({});
      const pref = {
        id: 'pref_1', tenantId: 'tenant_1', userId: 'user_1',
        quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursEnabled: false,
        timezone: 'UTC', doNotDisturb: false,
        toJSON: () => ({ channels: { in_app: { enabled: true } }, categories: { system: true } }),
      };
      await repo.save(pref as any);
      expect(mockPrisma.notificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId_userId: { tenantId: 'tenant_1', userId: 'user_1' } } })
      );
    });
  });

  describe('findByUserId', () => {
    it('should return null when not found', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
      const result = await repo.findByUserId('tenant_1', 'user_x');
      expect(result).toBeNull();
    });

    it('should return domain entity when found', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref_1', tenantId: 'tenant_1', userId: 'user_1',
        channelPreferences: { in_app: { enabled: true, frequency: 'realtime' } },
        categoryPreferences: { system: true },
        quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursEnabled: false,
        timezone: 'UTC', doNotDisturb: false,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await repo.findByUserId('tenant_1', 'user_1');
      expect(result).not.toBeNull();
    });

    it('should use default preferences when channelPreferences is null', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref_2', tenantId: 'tenant_1', userId: 'user_2',
        channelPreferences: null, categoryPreferences: null,
        quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursEnabled: false,
        timezone: 'UTC', doNotDisturb: false,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await repo.findByUserId('tenant_1', 'user_2');
      expect(result).not.toBeNull();
    });
  });

  describe('findOrCreateDefault', () => {
    it('should return existing preference', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({
        id: 'pref_1', tenantId: 'tenant_1', userId: 'user_1',
        channelPreferences: {}, categoryPreferences: {},
        quietHoursStart: '22:00', quietHoursEnd: '08:00', quietHoursEnabled: false,
        timezone: 'UTC', doNotDisturb: false,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const result = await repo.findOrCreateDefault('tenant_1', 'user_1');
      expect(result).not.toBeNull();
      expect(mockPrisma.notificationPreference.upsert).not.toHaveBeenCalled();
    });

    it('should create default when not found', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
      mockPrisma.notificationPreference.upsert.mockResolvedValue({});
      const result = await repo.findOrCreateDefault('tenant_1', 'user_new');
      expect(result).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete by tenantId and userId', async () => {
      mockPrisma.notificationPreference.delete.mockResolvedValue({});
      await repo.delete('tenant_1', 'user_1');
      expect(mockPrisma.notificationPreference.delete).toHaveBeenCalledWith({
        where: { tenantId_userId: { tenantId: 'tenant_1', userId: 'user_1' } },
      });
    });
  });

  describe('exists', () => {
    it('should return true when count > 0', async () => {
      mockPrisma.notificationPreference.count.mockResolvedValue(1);
      expect(await repo.exists('tenant_1', 'user_1')).toBe(true);
    });

    it('should return false when count is 0', async () => {
      mockPrisma.notificationPreference.count.mockResolvedValue(0);
      expect(await repo.exists('tenant_1', 'user_x')).toBe(false);
    });
  });

  describe('findUsersWithChannelEnabled', () => {
    it('should filter users by channel preference', async () => {
      mockPrisma.notificationPreference.findMany.mockResolvedValue([
        { userId: 'u1', channelPreferences: { email: { enabled: true } } },
        { userId: 'u2', channelPreferences: { email: { enabled: false } } },
        { userId: 'u3', channelPreferences: null },
      ]);
      const result = await repo.findUsersWithChannelEnabled('tenant_1', 'email');
      expect(result).toContain('u1');
      expect(result).toContain('u3'); // defaults: email enabled
      expect(result).not.toContain('u2');
    });
  });

  describe('bulkUpdate', () => {
    it('should update multiple preferences', async () => {
      mockPrisma.notificationPreference.updateMany.mockResolvedValue({ count: 3 });
      const result = await repo.bulkUpdate('tenant_1', ['u1', 'u2', 'u3'], { doNotDisturb: true });
      expect(result).toBe(3);
      expect(mockPrisma.notificationPreference.updateMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_1', userId: { in: ['u1', 'u2', 'u3'] } },
        data: { doNotDisturb: true },
      });
    });
  });
});
