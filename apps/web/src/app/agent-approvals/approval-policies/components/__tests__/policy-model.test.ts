import { describe, it, expect } from 'vitest';
import {
  actionLabel,
  agentLabel,
  assignmentOptions,
  formatMinutes,
  hasFormerTarget,
} from '../policy-model';

describe('policy-model', () => {
  it('formats minutes as min / h / d', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(60)).toBe('1 h');
    expect(formatMinutes(1440)).toBe('1 d');
    expect(formatMinutes(1530)).toBe('1 d 1 h 30 min');
    expect(formatMinutes(10080)).toBe('7 d');
  });

  it('offers each queue its own agents and actions, wildcard first', () => {
    expect(assignmentOptions('AGENT_TOOL')).toEqual({
      agents: [
        '*',
        'create_case',
        'create_appointment',
        'update_case',
        'update_appointment',
        'draft_message',
      ],
      actions: ['*', 'CREATE', 'UPDATE', 'DRAFT'],
    });
    expect(assignmentOptions('AUTO_RESPONSE')).toEqual({
      agents: ['*', 'auto_response'],
      actions: ['*', 'EMAIL_RECEIVED', 'FORM_SUBMIT', 'CHAT_MESSAGE', 'MANUAL'],
    });
  });

  it('labels known keys and passes unknown ones through', () => {
    expect(agentLabel('*')).toBe('Any agent');
    expect(agentLabel('draft_message')).toBe('Draft message');
    expect(agentLabel('mystery')).toBe('mystery');
    expect(actionLabel('FORM_SUBMIT')).toBe('Form submitted');
    expect(actionLabel('OTHER')).toBe('OTHER');
  });

  it('detects a deleted escalation target only while escalation is on (AC-018)', () => {
    expect(hasFormerTarget({ escalationEnabled: true, escalationTargetUserId: null })).toBe(true);
    expect(hasFormerTarget({ escalationEnabled: true, escalationTargetUserId: 'u1' })).toBe(false);
    expect(hasFormerTarget({ escalationEnabled: false, escalationTargetUserId: null })).toBe(false);
  });
});
