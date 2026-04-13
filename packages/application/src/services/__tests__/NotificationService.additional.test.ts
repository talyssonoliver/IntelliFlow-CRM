import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Result } from '@intelliflow/domain';
import { NotificationService } from '../NotificationService';

function createMockNotificationRepo() {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    countUnread: vi.fn().mockResolvedValue(0),
    getRecentForRecipient: vi.fn().mockResolvedValue([]),
    markAllAsRead: vi.fn().mockResolvedValue(5),
    findFailedForRetry: vi.fn().mockResolvedValue([]),
    findScheduledReadyToSend: vi.fn().mockResolvedValue([]),
  };
}

function createMockPreferenceRepo() {
  return {
    findOrCreateDefault: vi.fn().mockResolvedValue({
      id: 'pref_1',
      tenantId: 'tenant_1',
      userId: 'user_1',
      doNotDisturb: false,
      shouldDeliverNow: vi.fn().mockReturnValue(true),
      isChannelEnabled: vi.fn().mockReturnValue(true),
      isCategoryEnabled: vi.fn().mockReturnValue(true),
      isInQuietHours: vi.fn().mockReturnValue(false),
      setChannelEnabled: vi.fn(),
      setCategoryEnabled: vi.fn(),
      setQuietHours: vi.fn(),
      setQuietHoursEnabled: vi.fn(),
      setTimezone: vi.fn(),
      setDoNotDisturb: vi.fn(),
    }),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockDeliveryService() {
  return {
    sendEmail: vi.fn().mockResolvedValue(
      Result.ok({
        id: 'notif_1',
        channel: 'email',
        status: 'sent',
        providerMessageId: 'prov_msg_1',
      })
    ),
    sendSms: vi.fn().mockResolvedValue(
      Result.ok({
        id: 'notif_1',
        channel: 'sms',
        status: 'sent',
        providerMessageId: 'prov_sms_1',
      })
    ),
    sendPush: vi.fn().mockResolvedValue(
      Result.ok({
        id: 'notif_1',
        channel: 'push',
        status: 'sent',
        providerMessageId: 'prov_push_1',
      })
    ),
  };
}

function createMockEventBus() {
  return { publish: vi.fn().mockResolvedValue(undefined) };
}

function createMockAuditLogger() {
  return {
    logNotificationSent: vi.fn().mockResolvedValue(undefined),
    logNotificationFailed: vi.fn().mockResolvedValue(undefined),
    logNotificationMovedToDLQ: vi.fn().mockResolvedValue(undefined),
    logPreferenceUpdated: vi.fn().mockResolvedValue(undefined),
  };
}

describe('NotificationService - additional coverage', () => {
  let notifRepo: ReturnType<typeof createMockNotificationRepo>;
  let prefRepo: ReturnType<typeof createMockPreferenceRepo>;
  let delivery: ReturnType<typeof createMockDeliveryService>;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let auditLogger: ReturnType<typeof createMockAuditLogger>;
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    notifRepo = createMockNotificationRepo();
    prefRepo = createMockPreferenceRepo();
    delivery = createMockDeliveryService();
    eventBus = createMockEventBus();
    auditLogger = createMockAuditLogger();
    service = new NotificationService(
      notifRepo as any,
      prefRepo as any,
      delivery as any,
      eventBus as any,
      auditLogger as any
    );
  });

  describe('send', () => {
    it('should send email notification successfully', async () => {
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientEmail: 'a@b.com',
        channel: 'email',
        subject: 'Hi',
        body: 'Hello world',
      });
      expect(result.status).toBe('sent');
      expect(result.providerMessageId).toBe('prov_msg_1');
      expect(notifRepo.save).toHaveBeenCalled();
    });

    it('should return filtered when DND enabled', async () => {
      prefRepo.findOrCreateDefault.mockResolvedValue({
        doNotDisturb: true,
        shouldDeliverNow: vi.fn().mockReturnValue(false),
        isChannelEnabled: vi.fn().mockReturnValue(true),
        isCategoryEnabled: vi.fn().mockReturnValue(true),
        isInQuietHours: vi.fn().mockReturnValue(false),
      } as any);
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
      });
      expect(result.status).toBe('filtered');
      expect(result.filteredReason).toContain('Do Not Disturb');
    });

    it('should filter when channel disabled', async () => {
      prefRepo.findOrCreateDefault.mockResolvedValue({
        doNotDisturb: false,
        shouldDeliverNow: vi.fn().mockReturnValue(false),
        isChannelEnabled: vi.fn().mockReturnValue(false),
        isCategoryEnabled: vi.fn().mockReturnValue(true),
        isInQuietHours: vi.fn().mockReturnValue(false),
      } as any);
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
      });
      expect(result.status).toBe('filtered');
      expect(result.filteredReason).toContain('disabled');
    });

    it('should filter when category disabled', async () => {
      prefRepo.findOrCreateDefault.mockResolvedValue({
        doNotDisturb: false,
        shouldDeliverNow: vi.fn().mockReturnValue(false),
        isChannelEnabled: vi.fn().mockReturnValue(true),
        isCategoryEnabled: vi.fn().mockReturnValue(false),
        isInQuietHours: vi.fn().mockReturnValue(false),
      } as any);
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
        category: 'marketing',
      });
      expect(result.status).toBe('filtered');
      expect(result.filteredReason).toContain('disabled');
    });

    it('should filter when in quiet hours', async () => {
      prefRepo.findOrCreateDefault.mockResolvedValue({
        doNotDisturb: false,
        shouldDeliverNow: vi.fn().mockReturnValue(false),
        isChannelEnabled: vi.fn().mockReturnValue(true),
        isCategoryEnabled: vi.fn().mockReturnValue(true),
        isInQuietHours: vi.fn().mockReturnValue(true),
      } as any);
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
      });
      expect(result.status).toBe('filtered');
      expect(result.filteredReason).toContain('quiet hours');
    });

    it('should return scheduled for future scheduledAt', async () => {
      const future = new Date(Date.now() + 86400000);
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
        scheduledAt: future,
      });
      expect(result.status).toBe('scheduled');
      expect(notifRepo.save).toHaveBeenCalled();
    });

    it('should send in_app notification immediately', async () => {
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'in_app',
        subject: 'In-app',
        body: 'In-app body',
      });
      expect(result.status).toBe('sent');
    });

    it('should send sms notification', async () => {
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientPhone: '+1234567890',
        channel: 'sms',
        subject: 'SMS',
        body: 'Text',
      });
      expect(result.status).toBe('sent');
      expect(delivery.sendSms).toHaveBeenCalled();
    });

    it('should fail sms without phone', async () => {
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'sms',
        subject: 'SMS',
        body: 'Text',
      });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('phone');
    });

    it('should send push notification', async () => {
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'push',
        subject: 'Push',
        body: 'Push body',
      });
      expect(result.status).toBe('sent');
      expect(delivery.sendPush).toHaveBeenCalled();
    });

    it('should handle email delivery failure', async () => {
      delivery.sendEmail.mockResolvedValue(
        Result.fail({ message: 'SMTP error', code: 'EMAIL_FAIL' })
      );
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientEmail: 'a@b.com',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
      });
      expect(result.status).toBe('failed');
      expect(result.error).toContain('SMTP error');
      expect(auditLogger.logNotificationFailed).toHaveBeenCalled();
    });

    it('should handle sms delivery failure', async () => {
      delivery.sendSms.mockResolvedValue(
        Result.fail({ message: 'Carrier reject', code: 'SMS_FAIL' })
      );
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientPhone: '+1234567890',
        channel: 'sms',
        subject: 'SMS',
        body: 'Text',
      });
      expect(result.status).toBe('failed');
    });

    it('should handle push delivery failure', async () => {
      delivery.sendPush.mockResolvedValue(
        Result.fail({ message: 'Token invalid', code: 'PUSH_FAIL' })
      );
      const result = await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        channel: 'push',
        subject: 'Push',
        body: 'Body',
      });
      expect(result.status).toBe('failed');
    });

    it('should publish events on success', async () => {
      await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientEmail: 'a@b.com',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
      });
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should audit log on success', async () => {
      await service.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientEmail: 'a@b.com',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
      });
      expect(auditLogger.logNotificationSent).toHaveBeenCalled();
    });
  });

  describe('sendFromTemplate', () => {
    it('should render template and send', async () => {
      service.registerTemplate({
        id: 'tpl_1',
        name: 'Welcome',
        channel: 'email',
        subject: 'Hello {{name}}',
        bodyText: 'Welcome {{name}} to {{company}}',
        variables: ['name', 'company'],
      });
      const result = await service.sendFromTemplate('tpl_1', {
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientEmail: 'a@b.com',
        channel: 'email',
        variables: { name: 'John', company: 'Acme' },
      });
      expect(result.status).toBe('sent');
    });

    it('should throw for unknown template', async () => {
      await expect(
        service.sendFromTemplate('nonexistent', {
          tenantId: 'tenant_1',
          recipientId: 'user_1',
          channel: 'email',
          variables: {},
        })
      ).rejects.toThrow('Template not found');
    });

    it('should render HTML body when available', async () => {
      service.registerTemplate({
        id: 'tpl_2',
        name: 'HTML',
        channel: 'email',
        subject: 'Sub',
        bodyText: 'Text {{x}}',
        bodyHtml: '<b>HTML {{x}}</b>',
        variables: ['x'],
      });
      const result = await service.sendFromTemplate('tpl_2', {
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientEmail: 'a@b.com',
        channel: 'email',
        variables: { x: 'val' },
      });
      expect(result.status).toBe('sent');
    });
  });

  describe('registerTemplate / getTemplates', () => {
    it('should register and retrieve templates', () => {
      service.registerTemplate({
        id: 't1',
        name: 'T1',
        channel: 'email',
        subject: 'S',
        bodyText: 'B',
        variables: [],
      });
      service.registerTemplate({
        id: 't2',
        name: 'T2',
        channel: 'sms',
        subject: 'S2',
        bodyText: 'B2',
        variables: [],
      });
      expect(service.getTemplates()).toHaveLength(2);
      expect(service.getTemplates('email')).toHaveLength(1);
      expect(service.getTemplates('sms')).toHaveLength(1);
      expect(service.getTemplates('push')).toHaveLength(0);
    });
  });

  describe('getPreferences', () => {
    it('should return preferences from repo', async () => {
      const pref = await service.getPreferences('tenant_1', 'user_1');
      expect(pref).toBeDefined();
      expect(prefRepo.findOrCreateDefault).toHaveBeenCalledWith('tenant_1', 'user_1');
    });
  });

  describe('updatePreferences', () => {
    it('should update channel preference', async () => {
      const result = await service.updatePreferences('tenant_1', 'user_1', {
        channel: { channel: 'email', enabled: false },
      });
      expect(result).toBeDefined();
      expect(prefRepo.save).toHaveBeenCalled();
    });

    it('should update category preference', async () => {
      await service.updatePreferences('tenant_1', 'user_1', {
        category: { category: 'marketing', enabled: false },
      });
      expect(prefRepo.save).toHaveBeenCalled();
    });

    it('should update quiet hours', async () => {
      await service.updatePreferences('tenant_1', 'user_1', {
        quietHours: { start: '22:00', end: '07:00', enabled: true },
      });
      expect(prefRepo.save).toHaveBeenCalled();
    });

    it('should update timezone', async () => {
      await service.updatePreferences('tenant_1', 'user_1', {
        timezone: 'America/New_York',
      });
      expect(prefRepo.save).toHaveBeenCalled();
    });

    it('should update doNotDisturb', async () => {
      await service.updatePreferences('tenant_1', 'user_1', {
        doNotDisturb: true,
      });
      expect(prefRepo.save).toHaveBeenCalled();
    });

    it('should audit log preference changes', async () => {
      await service.updatePreferences('tenant_1', 'user_1', {
        doNotDisturb: true,
      });
      expect(auditLogger.logPreferenceUpdated).toHaveBeenCalled();
    });
  });

  describe('getUnreadCount', () => {
    it('should return count from repo', async () => {
      notifRepo.countUnread.mockResolvedValue(7);
      const count = await service.getUnreadCount('tenant_1', 'user_1');
      expect(count).toBe(7);
    });
  });

  describe('getRecent', () => {
    it('should return recent notifications', async () => {
      notifRepo.getRecentForRecipient.mockResolvedValue([{ id: 'n_1' }]);
      const result = await service.getRecent('tenant_1', 'user_1');
      expect(result).toHaveLength(1);
    });

    it('should use default channel and limit', async () => {
      await service.getRecent('tenant_1', 'user_1');
      expect(notifRepo.getRecentForRecipient).toHaveBeenCalledWith(
        'tenant_1',
        'user_1',
        'in_app',
        50
      );
    });

    it('should accept custom channel and limit', async () => {
      await service.getRecent('tenant_1', 'user_1', 'email', 10);
      expect(notifRepo.getRecentForRecipient).toHaveBeenCalledWith(
        'tenant_1',
        'user_1',
        'email',
        10
      );
    });
  });

  describe('markAsRead', () => {
    it('should throw when not found', async () => {
      notifRepo.findById.mockResolvedValue(null);
      await expect(service.markAsRead('notif_x')).rejects.toThrow('Notification not found');
    });

    it('should mark delivered notification as read', async () => {
      const mockNotif = {
        status: 'delivered',
        markAsRead: vi.fn(),
        getDomainEvents: vi.fn().mockReturnValue([{ eventType: 'NotificationRead' }]),
        clearDomainEvents: vi.fn(),
      };
      notifRepo.findById.mockResolvedValue(mockNotif);
      await service.markAsRead('notif_1');
      expect(mockNotif.markAsRead).toHaveBeenCalled();
      expect(notifRepo.save).toHaveBeenCalledWith(mockNotif);
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it('should mark sent notification as read', async () => {
      const mockNotif = {
        status: 'sent',
        markAsRead: vi.fn(),
        getDomainEvents: vi.fn().mockReturnValue([]),
        clearDomainEvents: vi.fn(),
      };
      notifRepo.findById.mockResolvedValue(mockNotif);
      await service.markAsRead('notif_1');
      expect(mockNotif.markAsRead).toHaveBeenCalled();
    });

    it('should not mark failed notification as read', async () => {
      const mockNotif = {
        status: 'failed',
        markAsRead: vi.fn(),
      };
      notifRepo.findById.mockResolvedValue(mockNotif);
      await service.markAsRead('notif_1');
      expect(mockNotif.markAsRead).not.toHaveBeenCalled();
    });
  });

  describe('markAllAsRead', () => {
    it('should delegate to repo', async () => {
      notifRepo.markAllAsRead.mockResolvedValue(10);
      const count = await service.markAllAsRead('tenant_1', 'user_1');
      expect(count).toBe(10);
    });
  });

  describe('processRetries', () => {
    it('should return zeros when no failed notifications', async () => {
      const result = await service.processRetries();
      expect(result).toEqual({ retried: 0, movedToDLQ: 0 });
    });
  });

  describe('processScheduled', () => {
    it('should return 0 when none scheduled', async () => {
      const result = await service.processScheduled();
      expect(result).toBe(0);
    });
  });

  describe('without audit logger', () => {
    it('should work without audit logger on send', async () => {
      const svcNoAudit = new NotificationService(
        notifRepo as any,
        prefRepo as any,
        delivery as any,
        eventBus as any
      );
      const result = await svcNoAudit.send({
        tenantId: 'tenant_1',
        recipientId: 'user_1',
        recipientEmail: 'a@b.com',
        channel: 'email',
        subject: 'Hi',
        body: 'Body',
      });
      expect(result.status).toBe('sent');
    });

    it('should work without audit logger on updatePreferences', async () => {
      const svcNoAudit = new NotificationService(
        notifRepo as any,
        prefRepo as any,
        delivery as any,
        eventBus as any
      );
      const pref = await svcNoAudit.updatePreferences('tenant_1', 'user_1', {
        doNotDisturb: true,
      });
      expect(pref).toBeDefined();
    });
  });
});
