/**
 * NotificationId Value Object Tests
 * @see IFC-157: Notification service MVP
 */
import { describe, it, expect } from 'vitest';
import { NotificationId } from '../NotificationId';

describe('NotificationId', () => {
  describe('create', () => {
    it('should create a NotificationId from valid string', () => {
      const id = NotificationId.create('notif-123');
      expect(id.value).toBe('notif-123');
    });

    it('should throw for empty string', () => {
      expect(() => NotificationId.create('')).toThrow('NotificationId cannot be empty');
    });

    it('should throw for whitespace-only string', () => {
      expect(() => NotificationId.create('   ')).toThrow('NotificationId cannot be empty');
    });
  });

  describe('generate', () => {
    it('should generate a unique NotificationId', () => {
      const id1 = NotificationId.generate();
      const id2 = NotificationId.generate();
      expect(id1.value).not.toBe(id2.value);
    });

    it('should generate valid UUID format', () => {
      const id = NotificationId.generate();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuidRegex.test(id.value)).toBe(true);
    });
  });

  describe('equals', () => {
    it('should return true for equal ids', () => {
      const id1 = NotificationId.create('notif-123');
      const id2 = NotificationId.create('notif-123');
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different ids', () => {
      const id1 = NotificationId.create('notif-123');
      const id2 = NotificationId.create('notif-456');
      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the id value as string', () => {
      const id = NotificationId.create('notif-123');
      expect(id.toString()).toBe('notif-123');
    });
  });
});
