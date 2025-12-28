import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  IdempotencyManager,
  InMemoryIdempotencyStore,
  calculateAppointmentHash,
} from '../shared/IdempotencyManager';

describe('InMemoryIdempotencyStore', () => {
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    store.clear();
  });

  it('should store and retrieve a record', async () => {
    const record = {
      key: 'test-key',
      operation: 'create' as const,
      appointmentId: 'apt-123',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      result: 'success' as const,
    };

    await store.set(record);
    const retrieved = await store.get('test-key');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.appointmentId).toBe('apt-123');
    expect(retrieved?.operation).toBe('create');
  });

  it('should return null for non-existent key', async () => {
    const result = await store.get('non-existent');
    expect(result).toBeNull();
  });

  it('should return null and delete expired records', async () => {
    const record = {
      key: 'expired-key',
      operation: 'create' as const,
      appointmentId: 'apt-123',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() - 1000), // Already expired
      result: 'success' as const,
    };

    await store.set(record);
    const result = await store.get('expired-key');

    expect(result).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('should delete a record', async () => {
    const record = {
      key: 'delete-key',
      operation: 'update' as const,
      appointmentId: 'apt-456',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    await store.set(record);
    expect(store.size()).toBe(1);

    await store.delete('delete-key');
    expect(store.size()).toBe(0);
  });

  it('should cleanup expired records', async () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 30 * 60 * 1000);
    const futureDate = new Date(now.getTime() + 30 * 60 * 1000);

    await store.set({
      key: 'expired-1',
      operation: 'create' as const,
      appointmentId: 'apt-1',
      createdAt: pastDate,
      expiresAt: pastDate,
    });

    await store.set({
      key: 'valid-1',
      operation: 'create' as const,
      appointmentId: 'apt-2',
      createdAt: now,
      expiresAt: futureDate,
    });

    const cleaned = await store.cleanup(now);

    expect(cleaned).toBe(1);
    expect(store.size()).toBe(1);
  });

  it('should clear all records', () => {
    store.set({
      key: 'key-1',
      operation: 'create' as const,
      appointmentId: 'apt-1',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
    });

    store.clear();
    expect(store.size()).toBe(0);
  });
});

describe('IdempotencyManager', () => {
  let manager: IdempotencyManager;
  let store: InMemoryIdempotencyStore;

  beforeEach(() => {
    store = new InMemoryIdempotencyStore();
    manager = new IdempotencyManager(store, { ttlMinutes: 60 });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 0, 15, 10, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    store.clear();
  });

  describe('generateKey', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = manager.generateKey('apt-123', 'create', 'google');
      const key2 = manager.generateKey('apt-123', 'create', 'google');

      expect(key1).toBe(key2);
      expect(key1.startsWith('idem_')).toBe(true);
    });

    it('should generate different keys for different inputs', () => {
      const key1 = manager.generateKey('apt-123', 'create', 'google');
      const key2 = manager.generateKey('apt-123', 'update', 'google');
      const key3 = manager.generateKey('apt-456', 'create', 'google');

      expect(key1).not.toBe(key2);
      expect(key1).not.toBe(key3);
    });
  });

  describe('generateContentKey', () => {
    it('should include content hash in key', () => {
      const key1 = manager.generateContentKey('apt-123', 'update', 'google', 'hash1');
      const key2 = manager.generateContentKey('apt-123', 'update', 'google', 'hash2');

      expect(key1).not.toBe(key2);
    });
  });

  describe('checkDuplicate', () => {
    it('should return false for new keys', async () => {
      const result = await manager.checkDuplicate('new-key');

      expect(result.isDuplicate).toBe(false);
      expect(result.previousResult).toBeUndefined();
    });

    it('should return true for existing keys', async () => {
      await manager.recordSuccess('existing-key', 'apt-123', 'create', 'ext-123');

      const result = await manager.checkDuplicate('existing-key');

      expect(result.isDuplicate).toBe(true);
      expect(result.previousResult).toBeDefined();
      expect(result.previousResult?.result).toBe('success');
    });
  });

  describe('recordSuccess', () => {
    it('should record successful operation', async () => {
      await manager.recordSuccess('success-key', 'apt-123', 'create', 'ext-123');

      const record = await store.get('success-key');

      expect(record).not.toBeNull();
      expect(record?.result).toBe('success');
      expect(record?.externalEventId).toBe('ext-123');
    });
  });

  describe('recordFailure', () => {
    it('should record failed operation with error', async () => {
      await manager.recordFailure('fail-key', 'apt-123', 'create', 'API Error');

      const record = await store.get('fail-key');

      expect(record).not.toBeNull();
      expect(record?.result).toBe('failure');
      expect(record?.error).toBe('API Error');
    });
  });

  describe('clearRecord', () => {
    it('should clear a specific record', async () => {
      await manager.recordSuccess('clear-key', 'apt-123', 'create');

      await manager.clearRecord('clear-key');

      const result = await manager.checkDuplicate('clear-key');
      expect(result.isDuplicate).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup expired records', async () => {
      await manager.recordSuccess('key-1', 'apt-1', 'create');

      // Advance time past TTL
      vi.advanceTimersByTime(61 * 60 * 1000); // 61 minutes

      const cleaned = await manager.cleanup();

      expect(cleaned).toBe(1);
    });
  });
});

describe('calculateAppointmentHash', () => {
  it('should generate consistent hash for same input', () => {
    const appointment = {
      title: 'Meeting',
      description: 'Test meeting',
      startTime: new Date('2025-01-15T10:00:00Z'),
      endTime: new Date('2025-01-15T11:00:00Z'),
      location: 'Room A',
      attendeeIds: ['user-1', 'user-2'],
    };

    const hash1 = calculateAppointmentHash(appointment);
    const hash2 = calculateAppointmentHash(appointment);

    expect(hash1).toBe(hash2);
  });

  it('should generate different hash for different content', () => {
    const apt1 = {
      title: 'Meeting 1',
      description: 'Test meeting',
      startTime: new Date('2025-01-15T10:00:00Z'),
      endTime: new Date('2025-01-15T11:00:00Z'),
      attendeeIds: ['user-1'],
    };

    const apt2 = {
      title: 'Meeting 2',
      description: 'Test meeting',
      startTime: new Date('2025-01-15T10:00:00Z'),
      endTime: new Date('2025-01-15T11:00:00Z'),
      attendeeIds: ['user-1'],
    };

    const hash1 = calculateAppointmentHash(apt1);
    const hash2 = calculateAppointmentHash(apt2);

    expect(hash1).not.toBe(hash2);
  });

  it('should sort attendees for consistent hashing', () => {
    const apt1 = {
      title: 'Meeting',
      startTime: new Date('2025-01-15T10:00:00Z'),
      endTime: new Date('2025-01-15T11:00:00Z'),
      attendeeIds: ['user-1', 'user-2', 'user-3'],
    };

    const apt2 = {
      title: 'Meeting',
      startTime: new Date('2025-01-15T10:00:00Z'),
      endTime: new Date('2025-01-15T11:00:00Z'),
      attendeeIds: ['user-3', 'user-1', 'user-2'],
    };

    const hash1 = calculateAppointmentHash(apt1);
    const hash2 = calculateAppointmentHash(apt2);

    expect(hash1).toBe(hash2);
  });

  it('should handle undefined optional fields', () => {
    const appointment = {
      title: 'Meeting',
      startTime: new Date('2025-01-15T10:00:00Z'),
      endTime: new Date('2025-01-15T11:00:00Z'),
      attendeeIds: [],
    };

    const hash = calculateAppointmentHash(appointment);

    expect(hash).toBeDefined();
    expect(hash.length).toBe(16);
  });
});
