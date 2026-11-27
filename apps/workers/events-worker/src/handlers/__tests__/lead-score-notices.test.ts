import { describe, expect, it, vi } from 'vitest';
import { sendLeadScoreNotices } from '../lead-score-notices';

function db(categoryPreferences: unknown) {
  return {
    notificationPreference: {
      findUnique: vi.fn(async () =>
        categoryPreferences === undefined ? null : { categoryPreferences }
      ),
    },
    notification: { create: vi.fn(async () => ({})) },
  };
}

const input = { leadId: 'lead-1', tenantId: 't1', userId: 'u1' };
const ON = { lead_scored: { enabled: true } };

describe('sendLeadScoreNotices', () => {
  it('sends nothing by default: AI score notices are off until the user turns them on', async () => {
    const d = db(undefined);
    expect(await sendLeadScoreNotices(d, { ...input, score: 90, previousScore: 40 })).toBe(0);
    expect(d.notification.create).not.toHaveBeenCalled();
  });

  it('sends nothing when the user turned them off explicitly', async () => {
    const d = db({ lead_scored: { enabled: false } });
    expect(await sendLeadScoreNotices(d, { ...input, score: 90, previousScore: 40 })).toBe(0);
  });

  it('sends the hot-lead and warming-up notices once turned on', async () => {
    const d = db(ON);
    expect(await sendLeadScoreNotices(d, { ...input, score: 90, previousScore: 40 })).toBe(2);
    const subjects = d.notification.create.mock.calls.map(
      (c) => (c[0] as { data: { subject: string } }).data.subject
    );
    expect(subjects).toEqual(['Hot lead detected: score 90', 'Lead warming up: score 90']);
  });

  it('sends only the warming-up notice when crossing 50 below 80', async () => {
    const d = db(ON);
    expect(await sendLeadScoreNotices(d, { ...input, score: 60, previousScore: undefined })).toBe(
      1
    );
    expect(d.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: 'ai_recommendation',
        metadata: expect.objectContaining({ actionUrl: '/leads/lead-1' }),
      }),
    });
  });

  it('does not even read preferences for a score that triggers no notice', async () => {
    const d = db(ON);
    expect(await sendLeadScoreNotices(d, { ...input, score: 60, previousScore: 55 })).toBe(0);
    expect(d.notificationPreference.findUnique).not.toHaveBeenCalled();
  });
});
