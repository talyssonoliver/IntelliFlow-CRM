/**
 * Ticket assign flow (#1097): both ticket detail pages assign through useTicketAssign.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockToast = vi.fn();
vi.mock('@intelliflow/ui', () => ({ toast: (...args: unknown[]) => mockToast(...args) }));

import { useTicketAssign } from '../useTicketAssign';
import { INVALID_ASSIGNEE_TOAST } from '../ticket-assignee';

const TICKET_ID = 'cmhbx3k2p0000l8086t1c2k3t';
const USER_ID = 'cmhbx3k2p0000l8086a1b2c3d';

describe('useTicketAssign', () => {
  beforeEach(() => {
    mockToast.mockReset();
  });

  it('assigns a valid id, trimmed, and confirms', async () => {
    const assignTicket = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useTicketAssign(TICKET_ID, assignTicket));

    await result.current(`  ${USER_ID} `);

    expect(assignTicket).toHaveBeenCalledWith({ id: TICKET_ID, assigneeId: USER_ID });
    expect(mockToast).toHaveBeenCalledWith({
      title: 'Ticket Assigned',
      description: 'Ticket has been reassigned.',
    });
  });

  it.each([
    ['an empty id', ''],
    ['an id the api rejects', 'not-a-uuid'],
  ])('shows the invalid toast and never calls the api for %s', async (_label, userId) => {
    const assignTicket = vi.fn();
    const { result } = renderHook(() => useTicketAssign(TICKET_ID, assignTicket));

    await result.current(userId);

    expect(assignTicket).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(INVALID_ASSIGNEE_TOAST);
  });

  it('swallows a failed update and shows no success toast', async () => {
    const assignTicket = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTicketAssign(TICKET_ID, assignTicket));

    await expect(result.current(USER_ID)).resolves.toBeUndefined();

    expect(assignTicket).toHaveBeenCalledTimes(1);
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('keeps the same handler across renders with the same inputs', () => {
    const assignTicket = vi.fn();
    const { result, rerender } = renderHook(() => useTicketAssign(TICKET_ID, assignTicket));
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });
});
