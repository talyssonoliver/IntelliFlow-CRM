import { describe, it, expect } from 'vitest';
import {
  activityDirection,
  directionMetadata,
  isReplyReceivedTitle,
} from '../lead-activity-direction';

describe('isReplyReceivedTitle', () => {
  it('is true for a title that starts "Reply received", dated or not, in any case', () => {
    expect(isReplyReceivedTitle('Reply received: pricing')).toBe(true);
    expect(isReplyReceivedTitle('Reply received 14/10/2026: "Sure also cost"')).toBe(true);
    expect(isReplyReceivedTitle('  reply RECEIVED')).toBe(true);
  });

  it('is false when the words come later or are part of another word', () => {
    expect(isReplyReceivedTitle('Follow-up sent: reply received?')).toBe(false);
    expect(isReplyReceivedTitle('No reply received yet')).toBe(false);
    expect(isReplyReceivedTitle('Reply receivedx')).toBe(false);
    expect(isReplyReceivedTitle('Replies received')).toBe(false);
    expect(isReplyReceivedTitle('')).toBe(false);
  });
});

describe('activityDirection', () => {
  it('keeps the direction the caller gave, whatever the title says', () => {
    expect(
      activityDirection({ type: 'EMAIL', title: 'Reply received: x', direction: 'outbound' })
    ).toBe('outbound');
    expect(
      activityDirection({ type: 'EMAIL', title: 'Outreach email sent', direction: 'inbound' })
    ).toBe('inbound');
  });

  it('stores inbound for an EMAIL titled "Reply received" that has no direction', () => {
    expect(activityDirection({ type: 'EMAIL', title: 'Reply received: pricing' })).toBe('inbound');
  });

  it('says nothing for any other email, and for a non-email even with that title', () => {
    expect(activityDirection({ type: 'EMAIL', title: 'Outreach email sent' })).toBeUndefined();
    expect(activityDirection({ type: 'NOTE', title: 'Reply received: pricing' })).toBeUndefined();
    expect(activityDirection({ type: 'CALL', title: 'Reply received' })).toBeUndefined();
  });
});

describe('directionMetadata', () => {
  it('is the metadata part of a row: the direction, or nothing', () => {
    expect(directionMetadata({ type: 'EMAIL', title: 'Reply received: hi' })).toEqual({
      metadata: { direction: 'inbound' },
    });
    expect(directionMetadata({ type: 'EMAIL', title: 'Sent', direction: 'outbound' })).toEqual({
      metadata: { direction: 'outbound' },
    });
    expect(directionMetadata({ type: 'NOTE', title: 'Note' })).toEqual({});
  });
});
