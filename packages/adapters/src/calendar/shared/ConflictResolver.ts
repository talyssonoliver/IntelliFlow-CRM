import { Appointment } from '@intelliflow/domain';
import { ExternalCalendarEvent, ConflictResolution } from '@intelliflow/application';

/**
 * Conflict Resolver
 * Handles conflicts between local appointments and external calendar events
 *
 * @see IFC-138: Conflict resolution strategy implementation
 */

export interface ConflictInfo {
  localAppointment: Appointment;
  remoteEvent: ExternalCalendarEvent;
  localUpdatedAt: Date;
  remoteUpdatedAt: Date;
  conflictType: 'time' | 'content' | 'status' | 'deleted';
}

/**
 * Conflict Resolver for bidirectional calendar sync
 */
export class ConflictResolver {
  /**
   * Detect if there's a conflict between local and remote versions
   */
  detectConflict(
    localAppointment: Appointment,
    remoteEvent: ExternalCalendarEvent
  ): ConflictInfo | null {
    const localUpdatedAt = localAppointment.updatedAt;
    const remoteUpdatedAt = remoteEvent.lastModified;

    // Check for status conflict (cancelled on one side)
    if (
      (localAppointment.isCancelled && remoteEvent.status !== 'cancelled') ||
      (!localAppointment.isCancelled && remoteEvent.status === 'cancelled')
    ) {
      return {
        localAppointment,
        remoteEvent,
        localUpdatedAt,
        remoteUpdatedAt,
        conflictType: 'status',
      };
    }

    // Check for time conflict
    const localStart = localAppointment.startTime.getTime();
    const localEnd = localAppointment.endTime.getTime();
    const remoteStart = remoteEvent.startTime.getTime();
    const remoteEnd = remoteEvent.endTime.getTime();

    if (localStart !== remoteStart || localEnd !== remoteEnd) {
      return {
        localAppointment,
        remoteEvent,
        localUpdatedAt,
        remoteUpdatedAt,
        conflictType: 'time',
      };
    }

    // Check for content conflict
    const contentDiffers =
      localAppointment.title !== remoteEvent.title ||
      (localAppointment.description || '') !== (remoteEvent.description || '') ||
      (localAppointment.location || '') !== (remoteEvent.location || '');

    if (contentDiffers) {
      return {
        localAppointment,
        remoteEvent,
        localUpdatedAt,
        remoteUpdatedAt,
        conflictType: 'content',
      };
    }

    return null;
  }

  /**
   * Resolve conflict using specified strategy
   */
  resolve(conflict: ConflictInfo, strategy: ConflictResolution['strategy']): ConflictResolution {
    const { localAppointment, remoteEvent, localUpdatedAt, remoteUpdatedAt } = conflict;

    switch (strategy) {
      case 'local_wins':
        return {
          strategy,
          localVersion: localAppointment,
          remoteVersion: remoteEvent,
          resolvedVersion: localAppointment,
          requiresManualResolution: false,
        };

      case 'remote_wins':
        return {
          strategy,
          localVersion: localAppointment,
          remoteVersion: remoteEvent,
          resolvedVersion: remoteEvent,
          requiresManualResolution: false,
        };

      case 'newest_wins':
        const localWins = localUpdatedAt >= remoteUpdatedAt;
        return {
          strategy,
          localVersion: localAppointment,
          remoteVersion: remoteEvent,
          resolvedVersion: localWins ? localAppointment : remoteEvent,
          requiresManualResolution: false,
        };

      case 'manual':
        return {
          strategy,
          localVersion: localAppointment,
          remoteVersion: remoteEvent,
          requiresManualResolution: true,
        };

      default:
        // Default to newest_wins for unknown strategies
        const defaultLocalWins = localUpdatedAt >= remoteUpdatedAt;
        return {
          strategy: 'newest_wins',
          localVersion: localAppointment,
          remoteVersion: remoteEvent,
          resolvedVersion: defaultLocalWins ? localAppointment : remoteEvent,
          requiresManualResolution: false,
        };
    }
  }

  /**
   * Apply resolution to sync the winning version
   */
  getResolutionAction(resolution: ConflictResolution): {
    action: 'push_local' | 'pull_remote' | 'manual' | 'skip';
    reason: string;
  } {
    if (resolution.requiresManualResolution) {
      return {
        action: 'manual',
        reason: 'Conflict requires manual resolution',
      };
    }

    const isLocalWinner = resolution.resolvedVersion === resolution.localVersion;

    if (isLocalWinner) {
      return {
        action: 'push_local',
        reason: `Local version wins with strategy: ${resolution.strategy}`,
      };
    }

    return {
      action: 'pull_remote',
      reason: `Remote version wins with strategy: ${resolution.strategy}`,
    };
  }
}

/**
 * Merge changes from both versions (for non-destructive conflict resolution)
 */
export function mergeAppointmentChanges(
  localAppointment: Appointment,
  remoteEvent: ExternalCalendarEvent,
  preferLocal: boolean = true
): {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
} {
  return {
    // Use the longer/more detailed title
    title: preferLocal
      ? localAppointment.title
      : remoteEvent.title.length > localAppointment.title.length
        ? remoteEvent.title
        : localAppointment.title,

    // Merge descriptions (keep both if different)
    description: mergeDescriptions(
      localAppointment.description,
      remoteEvent.description,
      preferLocal
    ),

    // Time from preferred source
    startTime: preferLocal ? localAppointment.startTime : remoteEvent.startTime,
    endTime: preferLocal ? localAppointment.endTime : remoteEvent.endTime,

    // Location from preferred source, fallback to other
    location: preferLocal
      ? localAppointment.location || remoteEvent.location
      : remoteEvent.location || localAppointment.location,
  };
}

function mergeDescriptions(
  local?: string,
  remote?: string,
  preferLocal: boolean = true
): string | undefined {
  if (!local && !remote) return undefined;
  if (!local) return remote;
  if (!remote) return local;
  if (local === remote) return local;

  // If both exist and are different, append remote notes to local
  if (preferLocal) {
    return `${local}\n\n---\n[Synced from calendar]: ${remote}`;
  }
  return `${remote}\n\n---\n[Local notes]: ${local}`;
}
