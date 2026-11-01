/**
 * Ticket assignee gate (#1097), shared by both ticket detail pages.
 */

import { isRecordId } from '@/lib/shared/record-id';

/** The toast both ticket pages show when an assignee id cannot be sent. */
export const INVALID_ASSIGNEE_TOAST = {
  title: 'Invalid Assignee',
  description: 'Cannot assign ticket because user ID is invalid.',
  variant: 'destructive',
} as const;

/** The trimmed assignee id when the api will accept it, otherwise null. */
export function toAssigneeId(userId: string | undefined): string | null {
  const assigneeId = userId?.trim();
  return assigneeId && isRecordId(assigneeId) ? assigneeId : null;
}
