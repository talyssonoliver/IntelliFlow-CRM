import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictResolver, mergeAppointmentChanges, ConflictInfo } from '../shared/ConflictResolver';
import { Appointment, AppointmentId, TimeSlot } from '@intelliflow/domain';
import { ExternalCalendarEvent } from '@intelliflow/application';

describe('ConflictResolver', () => {
  let resolver: ConflictResolver;
  let baseAppointment: Appointment;
  let baseRemoteEvent: ExternalCalendarEvent;

  function createAppointment(overrides: Partial<{
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    isCancelled: boolean;
    updatedAt: Date;
  }> = {}): Appointment {
    const startTime = overrides.startTime ?? new Date(2025, 0, 20, 10, 0, 0);
    const endTime = overrides.endTime ?? new Date(2025, 0, 20, 11, 0, 0);
    const timeSlot = TimeSlot.reconstitute(startTime, endTime);

    const apt = Appointment.reconstitute(AppointmentId.generate(), {
      title: overrides.title ?? 'Test Meeting',
      description: overrides.description,
      timeSlot,
      appointmentType: 'INTERNAL_MEETING',
      organizerId: 'user-123',
      attendeeIds: [],
      buffer: { beforeMinutes: 0, afterMinutes: 0 },
      status: overrides.isCancelled ? 'CANCELLED' : 'SCHEDULED',
      isRecurring: false,
      reminderMinutes: undefined,
      linkedCaseIds: [],
      notes: undefined,
      createdAt: new Date(2025, 0, 15),
      updatedAt: overrides.updatedAt ?? new Date(2025, 0, 15),
      externalCalendarId: undefined,
      recurrenceRule: undefined,
    });

    return apt;
  }

  function createRemoteEvent(overrides: Partial<{
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    status: 'confirmed' | 'tentative' | 'cancelled';
    lastModified: Date;
  }> = {}): ExternalCalendarEvent {
    return {
      externalId: 'ext-123',
      provider: 'google',
      title: overrides.title ?? 'Test Meeting',
      description: overrides.description,
      startTime: overrides.startTime ?? new Date(2025, 0, 20, 10, 0, 0),
      endTime: overrides.endTime ?? new Date(2025, 0, 20, 11, 0, 0),
      location: overrides.location,
      attendees: [],
      organizerEmail: 'organizer@example.com',
      status: overrides.status ?? 'confirmed',
      iCalUID: 'ical-123',
      lastModified: overrides.lastModified ?? new Date(2025, 0, 15),
    };
  }

  beforeEach(() => {
    resolver = new ConflictResolver();
    baseAppointment = createAppointment();
    baseRemoteEvent = createRemoteEvent();
  });

  describe('detectConflict', () => {
    it('should return null when no conflict exists', () => {
      const result = resolver.detectConflict(baseAppointment, baseRemoteEvent);
      expect(result).toBeNull();
    });

    it('should detect status conflict when local is cancelled', () => {
      const cancelledAppointment = createAppointment({ isCancelled: true });

      const result = resolver.detectConflict(cancelledAppointment, baseRemoteEvent);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('status');
    });

    it('should detect status conflict when remote is cancelled', () => {
      const cancelledRemote = createRemoteEvent({ status: 'cancelled' });

      const result = resolver.detectConflict(baseAppointment, cancelledRemote);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('status');
    });

    it('should not detect status conflict when both are cancelled', () => {
      const cancelledAppointment = createAppointment({ isCancelled: true });
      const cancelledRemote = createRemoteEvent({ status: 'cancelled' });

      const result = resolver.detectConflict(cancelledAppointment, cancelledRemote);

      // Both cancelled means no status conflict, but they should match
      expect(result).toBeNull();
    });

    it('should detect time conflict when start times differ', () => {
      const differentStartRemote = createRemoteEvent({
        startTime: new Date(2025, 0, 20, 11, 0, 0),
        endTime: new Date(2025, 0, 20, 12, 0, 0),
      });

      const result = resolver.detectConflict(baseAppointment, differentStartRemote);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('time');
    });

    it('should detect time conflict when end times differ', () => {
      const differentEndRemote = createRemoteEvent({
        endTime: new Date(2025, 0, 20, 12, 0, 0),
      });

      const result = resolver.detectConflict(baseAppointment, differentEndRemote);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('time');
    });

    it('should detect content conflict when titles differ', () => {
      const differentTitleRemote = createRemoteEvent({
        title: 'Different Title',
      });

      const result = resolver.detectConflict(baseAppointment, differentTitleRemote);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('content');
    });

    it('should detect content conflict when descriptions differ', () => {
      const appointmentWithDesc = createAppointment({ description: 'Local description' });
      const remoteWithDesc = createRemoteEvent({ description: 'Remote description' });

      const result = resolver.detectConflict(appointmentWithDesc, remoteWithDesc);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('content');
    });

    it('should detect content conflict when locations differ', () => {
      const appointmentWithLocation = createAppointment({ location: 'Room A' });
      const remoteWithLocation = createRemoteEvent({ location: 'Room B' });

      // Need to reconstitute with location
      const timeSlot = TimeSlot.reconstitute(
        new Date(2025, 0, 20, 10, 0, 0),
        new Date(2025, 0, 20, 11, 0, 0)
      );
      const aptWithLocation = Appointment.reconstitute(AppointmentId.generate(), {
        title: 'Test Meeting',
        description: undefined,
        timeSlot,
        appointmentType: 'INTERNAL_MEETING',
        organizerId: 'user-123',
        attendeeIds: [],
        buffer: { beforeMinutes: 0, afterMinutes: 0 },
        status: 'SCHEDULED',
        isRecurring: false,
        reminderMinutes: undefined,
        linkedCaseIds: [],
        notes: undefined,
        createdAt: new Date(2025, 0, 15),
        updatedAt: new Date(2025, 0, 15),
        externalCalendarId: undefined,
        recurrenceRule: undefined,
        location: 'Room A',
      });

      const result = resolver.detectConflict(aptWithLocation, remoteWithLocation);

      expect(result).not.toBeNull();
      expect(result?.conflictType).toBe('content');
    });

    it('should include correct conflict info', () => {
      const updatedLocal = createAppointment({
        title: 'Updated Local Title',
        updatedAt: new Date(2025, 0, 18),
      });
      const updatedRemote = createRemoteEvent({
        lastModified: new Date(2025, 0, 17),
      });

      const result = resolver.detectConflict(updatedLocal, updatedRemote);

      expect(result).not.toBeNull();
      expect(result?.localAppointment).toBe(updatedLocal);
      expect(result?.remoteEvent).toBe(updatedRemote);
      expect(result?.localUpdatedAt).toEqual(new Date(2025, 0, 18));
      expect(result?.remoteUpdatedAt).toEqual(new Date(2025, 0, 17));
    });
  });

  describe('resolve', () => {
    let conflict: ConflictInfo;

    beforeEach(() => {
      const localAppointment = createAppointment({
        title: 'Local Title',
        updatedAt: new Date(2025, 0, 18),
      });
      const remoteEvent = createRemoteEvent({
        title: 'Remote Title',
        lastModified: new Date(2025, 0, 17),
      });
      conflict = {
        localAppointment,
        remoteEvent,
        localUpdatedAt: new Date(2025, 0, 18),
        remoteUpdatedAt: new Date(2025, 0, 17),
        conflictType: 'content',
      };
    });

    it('should resolve with local_wins strategy', () => {
      const resolution = resolver.resolve(conflict, 'local_wins');

      expect(resolution.strategy).toBe('local_wins');
      expect(resolution.resolvedVersion).toBe(conflict.localAppointment);
      expect(resolution.requiresManualResolution).toBe(false);
    });

    it('should resolve with remote_wins strategy', () => {
      const resolution = resolver.resolve(conflict, 'remote_wins');

      expect(resolution.strategy).toBe('remote_wins');
      expect(resolution.resolvedVersion).toBe(conflict.remoteEvent);
      expect(resolution.requiresManualResolution).toBe(false);
    });

    it('should resolve with newest_wins strategy when local is newer', () => {
      const resolution = resolver.resolve(conflict, 'newest_wins');

      expect(resolution.strategy).toBe('newest_wins');
      expect(resolution.resolvedVersion).toBe(conflict.localAppointment);
      expect(resolution.requiresManualResolution).toBe(false);
    });

    it('should resolve with newest_wins strategy when remote is newer', () => {
      const newerRemoteConflict: ConflictInfo = {
        ...conflict,
        remoteUpdatedAt: new Date(2025, 0, 20),
      };

      const resolution = resolver.resolve(newerRemoteConflict, 'newest_wins');

      expect(resolution.strategy).toBe('newest_wins');
      expect(resolution.resolvedVersion).toBe(newerRemoteConflict.remoteEvent);
      expect(resolution.requiresManualResolution).toBe(false);
    });

    it('should resolve with newest_wins when timestamps are equal (prefer local)', () => {
      const sameTimeConflict: ConflictInfo = {
        ...conflict,
        localUpdatedAt: new Date(2025, 0, 18),
        remoteUpdatedAt: new Date(2025, 0, 18),
      };

      const resolution = resolver.resolve(sameTimeConflict, 'newest_wins');

      expect(resolution.resolvedVersion).toBe(sameTimeConflict.localAppointment);
    });

    it('should resolve with manual strategy', () => {
      const resolution = resolver.resolve(conflict, 'manual');

      expect(resolution.strategy).toBe('manual');
      expect(resolution.resolvedVersion).toBeUndefined();
      expect(resolution.requiresManualResolution).toBe(true);
    });

    it('should default to newest_wins for unknown strategy', () => {
      const resolution = resolver.resolve(conflict, 'unknown_strategy' as any);

      expect(resolution.strategy).toBe('newest_wins');
      expect(resolution.requiresManualResolution).toBe(false);
    });

    it('should include both versions in resolution', () => {
      const resolution = resolver.resolve(conflict, 'local_wins');

      expect(resolution.localVersion).toBe(conflict.localAppointment);
      expect(resolution.remoteVersion).toBe(conflict.remoteEvent);
    });
  });

  describe('getResolutionAction', () => {
    it('should return push_local when local wins', () => {
      const localAppointment = createAppointment();
      const resolution = {
        strategy: 'local_wins' as const,
        localVersion: localAppointment,
        remoteVersion: baseRemoteEvent,
        resolvedVersion: localAppointment,
        requiresManualResolution: false,
      };

      const action = resolver.getResolutionAction(resolution);

      expect(action.action).toBe('push_local');
      expect(action.reason).toContain('Local version wins');
    });

    it('should return pull_remote when remote wins', () => {
      const localAppointment = createAppointment();
      const resolution = {
        strategy: 'remote_wins' as const,
        localVersion: localAppointment,
        remoteVersion: baseRemoteEvent,
        resolvedVersion: baseRemoteEvent,
        requiresManualResolution: false,
      };

      const action = resolver.getResolutionAction(resolution);

      expect(action.action).toBe('pull_remote');
      expect(action.reason).toContain('Remote version wins');
    });

    it('should return manual when manual resolution required', () => {
      const localAppointment = createAppointment();
      const resolution = {
        strategy: 'manual' as const,
        localVersion: localAppointment,
        remoteVersion: baseRemoteEvent,
        requiresManualResolution: true,
      };

      const action = resolver.getResolutionAction(resolution);

      expect(action.action).toBe('manual');
      expect(action.reason).toContain('requires manual resolution');
    });

    it('should include strategy in action reason', () => {
      const localAppointment = createAppointment();
      const resolution = {
        strategy: 'newest_wins' as const,
        localVersion: localAppointment,
        remoteVersion: baseRemoteEvent,
        resolvedVersion: localAppointment,
        requiresManualResolution: false,
      };

      const action = resolver.getResolutionAction(resolution);

      expect(action.reason).toContain('newest_wins');
    });
  });
});

describe('mergeAppointmentChanges', () => {
  let localAppointment: Appointment;
  let remoteEvent: ExternalCalendarEvent;

  function createAppointment(overrides: Partial<{
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
  }> = {}): Appointment {
    const startTime = overrides.startTime ?? new Date(2025, 0, 20, 10, 0, 0);
    const endTime = overrides.endTime ?? new Date(2025, 0, 20, 11, 0, 0);
    const timeSlot = TimeSlot.reconstitute(startTime, endTime);

    return Appointment.reconstitute(AppointmentId.generate(), {
      title: overrides.title ?? 'Local Meeting',
      description: overrides.description,
      timeSlot,
      appointmentType: 'INTERNAL_MEETING',
      organizerId: 'user-123',
      attendeeIds: [],
      buffer: { beforeMinutes: 0, afterMinutes: 0 },
      status: 'SCHEDULED',
      isRecurring: false,
      reminderMinutes: undefined,
      linkedCaseIds: [],
      notes: undefined,
      createdAt: new Date(2025, 0, 15),
      updatedAt: new Date(2025, 0, 15),
      externalCalendarId: undefined,
      recurrenceRule: undefined,
      location: overrides.location,
    });
  }

  function createRemoteEvent(overrides: Partial<{
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
  }> = {}): ExternalCalendarEvent {
    return {
      externalId: 'ext-123',
      provider: 'google',
      title: overrides.title ?? 'Remote Meeting',
      description: overrides.description,
      startTime: overrides.startTime ?? new Date(2025, 0, 20, 14, 0, 0),
      endTime: overrides.endTime ?? new Date(2025, 0, 20, 15, 0, 0),
      location: overrides.location,
      attendees: [],
      organizerEmail: 'organizer@example.com',
      status: 'confirmed',
      iCalUID: 'ical-123',
      lastModified: new Date(2025, 0, 15),
    };
  }

  beforeEach(() => {
    localAppointment = createAppointment();
    remoteEvent = createRemoteEvent();
  });

  it('should use local title when preferLocal is true', () => {
    const result = mergeAppointmentChanges(localAppointment, remoteEvent, true);

    expect(result.title).toBe('Local Meeting');
  });

  it('should use longer remote title when preferLocal is false', () => {
    const longerRemote = createRemoteEvent({ title: 'Remote Meeting with Extra Details' });

    const result = mergeAppointmentChanges(localAppointment, longerRemote, false);

    expect(result.title).toBe('Remote Meeting with Extra Details');
  });

  it('should use local title when remote title is shorter and preferLocal is false', () => {
    const shorterRemote = createRemoteEvent({ title: 'Short' });
    const longerLocal = createAppointment({ title: 'Much Longer Local Title' });

    const result = mergeAppointmentChanges(longerLocal, shorterRemote, false);

    expect(result.title).toBe('Much Longer Local Title');
  });

  it('should use local times when preferLocal is true', () => {
    const result = mergeAppointmentChanges(localAppointment, remoteEvent, true);

    expect(result.startTime).toEqual(localAppointment.startTime);
    expect(result.endTime).toEqual(localAppointment.endTime);
  });

  it('should use remote times when preferLocal is false', () => {
    const result = mergeAppointmentChanges(localAppointment, remoteEvent, false);

    expect(result.startTime).toEqual(remoteEvent.startTime);
    expect(result.endTime).toEqual(remoteEvent.endTime);
  });

  it('should use local location with remote fallback when preferLocal is true', () => {
    const localWithLocation = createAppointment({ location: 'Room A' });
    const remoteWithLocation = createRemoteEvent({ location: 'Room B' });

    const result = mergeAppointmentChanges(localWithLocation, remoteWithLocation, true);

    expect(result.location).toBe('Room A');
  });

  it('should use remote location as fallback when local is empty', () => {
    const localWithoutLocation = createAppointment();
    const remoteWithLocation = createRemoteEvent({ location: 'Room B' });

    const result = mergeAppointmentChanges(localWithoutLocation, remoteWithLocation, true);

    expect(result.location).toBe('Room B');
  });

  it('should merge descriptions when both exist and differ', () => {
    const localWithDesc = createAppointment({ description: 'Local notes' });
    const remoteWithDesc = createRemoteEvent({ description: 'Remote notes' });

    const result = mergeAppointmentChanges(localWithDesc, remoteWithDesc, true);

    expect(result.description).toContain('Local notes');
    expect(result.description).toContain('Remote notes');
    expect(result.description).toContain('[Synced from calendar]');
  });

  it('should use local description when remote is empty', () => {
    const localWithDesc = createAppointment({ description: 'Local notes' });

    const result = mergeAppointmentChanges(localWithDesc, remoteEvent, true);

    expect(result.description).toBe('Local notes');
  });

  it('should use remote description when local is empty', () => {
    const remoteWithDesc = createRemoteEvent({ description: 'Remote notes' });

    const result = mergeAppointmentChanges(localAppointment, remoteWithDesc, true);

    expect(result.description).toBe('Remote notes');
  });

  it('should return undefined description when both are empty', () => {
    const result = mergeAppointmentChanges(localAppointment, remoteEvent, true);

    expect(result.description).toBeUndefined();
  });

  it('should return same description when both are identical', () => {
    const localWithDesc = createAppointment({ description: 'Same notes' });
    const remoteWithDesc = createRemoteEvent({ description: 'Same notes' });

    const result = mergeAppointmentChanges(localWithDesc, remoteWithDesc, true);

    expect(result.description).toBe('Same notes');
  });

  it('should format merged descriptions with remote preference', () => {
    const localWithDesc = createAppointment({ description: 'Local notes' });
    const remoteWithDesc = createRemoteEvent({ description: 'Remote notes' });

    const result = mergeAppointmentChanges(localWithDesc, remoteWithDesc, false);

    expect(result.description).toContain('Remote notes');
    expect(result.description).toContain('[Local notes]');
  });

  it('should default preferLocal to true', () => {
    const result = mergeAppointmentChanges(localAppointment, remoteEvent);

    expect(result.title).toBe('Local Meeting');
    expect(result.startTime).toEqual(localAppointment.startTime);
    expect(result.endTime).toEqual(localAppointment.endTime);
  });
});
