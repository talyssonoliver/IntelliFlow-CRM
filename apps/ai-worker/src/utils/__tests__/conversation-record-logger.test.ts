/**
 * Conversation Record Logger Tests (Fix #20)
 *
 * Verifies that logConversationRecord() emits structured log data
 * matching the ConversationRecordData shape for audit trail.
 */

import { describe, it, expect, vi } from 'vitest';
import { logConversationRecord } from '../conversation-record-logger';
import type { ConversationRecordLogData } from '../conversation-record-logger';

function makeMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('logConversationRecord (Fix #20)', () => {
  it('logs to logger.info with a conversationRecord key', () => {
    const logger = makeMockLogger();
    const data: ConversationRecordLogData = {
      conversationId: 'conv-001',
      model: 'openai:gpt-4o-mini',
      tokenCountInput: 150,
      tokenCountOutput: 80,
      duration: 1500,
      chainType: 'CHURN_PREDICTION',
      tenantId: 'tenant-abc',
    };

    logConversationRecord(logger as any, data);

    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('emits all required fields in the conversationRecord object', () => {
    const logger = makeMockLogger();
    const data: ConversationRecordLogData = {
      conversationId: 'conv-002',
      model: 'ollama:llama2',
      tokenCountInput: 0,
      tokenCountOutput: 0,
      duration: 800,
      chainType: 'INSIGHT_GENERATION',
      tenantId: 'tenant-xyz',
    };

    logConversationRecord(logger as any, data);

    const [logObj, message] = logger.info.mock.calls[0];
    expect(logObj.conversationRecord).toMatchObject({
      conversationId: 'conv-002',
      model: 'ollama:llama2',
      tokenCountInput: 0,
      tokenCountOutput: 0,
      duration: 800,
      chainType: 'INSIGHT_GENERATION',
      tenantId: 'tenant-xyz',
    });
    expect(message).toBe('AI conversation record');
  });

  it('omits tenantId from log when not provided', () => {
    const logger = makeMockLogger();
    const data: ConversationRecordLogData = {
      conversationId: 'conv-003',
      model: 'mock:v1',
      tokenCountInput: 0,
      tokenCountOutput: 0,
      duration: 50,
      chainType: 'LEAD_SCORING',
    };

    logConversationRecord(logger as any, data);

    const [logObj] = logger.info.mock.calls[0];
    expect(logObj.conversationRecord).not.toHaveProperty('tenantId');
  });

  it('records correct numeric token counts', () => {
    const logger = makeMockLogger();
    logConversationRecord(logger as any, {
      conversationId: 'conv-004',
      model: 'openai:gpt-4o',
      tokenCountInput: 1200,
      tokenCountOutput: 350,
      duration: 3200,
      chainType: 'CHURN_PREDICTION',
    });

    const [logObj] = logger.info.mock.calls[0];
    expect(logObj.conversationRecord.tokenCountInput).toBe(1200);
    expect(logObj.conversationRecord.tokenCountOutput).toBe(350);
    expect(logObj.conversationRecord.duration).toBe(3200);
  });

  it('supports multiple sequential calls with different data', () => {
    const logger = makeMockLogger();

    logConversationRecord(logger as any, {
      conversationId: 'conv-a',
      model: 'openai:gpt-4o-mini',
      tokenCountInput: 100,
      tokenCountOutput: 50,
      duration: 900,
      chainType: 'CHURN_PREDICTION',
    });

    logConversationRecord(logger as any, {
      conversationId: 'conv-b',
      model: 'ollama:mistral',
      tokenCountInput: 200,
      tokenCountOutput: 100,
      duration: 1800,
      chainType: 'INSIGHT_GENERATION',
      tenantId: 'tenant-multi',
    });

    expect(logger.info).toHaveBeenCalledTimes(2);
    expect(logger.info.mock.calls[0][0].conversationRecord.conversationId).toBe('conv-a');
    expect(logger.info.mock.calls[1][0].conversationRecord.conversationId).toBe('conv-b');
  });
});
