import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  messageCreate: vi.fn(),
  conversationUpdate: vi.fn(),
  enqueue: vi.fn(),
  queueClose: vi.fn(),
  queueCtor: vi.fn(),
  logDebug: vi.fn(),
}));

vi.mock('pino', () => ({
  default: () => ({
    debug: mocks.logDebug,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@intelliflow/db', () => ({
  prisma: {
    conversationRecord: { findUnique: mocks.findUnique, update: mocks.conversationUpdate },
    messageRecord: { create: mocks.messageCreate },
  },
}));

vi.mock('bullmq', () => ({
  Queue: class {
    constructor(...args: unknown[]) {
      mocks.queueCtor(...args);
    }
    close() {
      return mocks.queueClose();
    }
  },
}));

vi.mock('../../jobs/summarize-conversation.job.js', () => ({
  SUMMARIZE_QUEUE: 'summarize-queue',
  enqueueSummarizationIfNeeded: mocks.enqueue,
}));

import { ConversationRecordCallbackHandler } from '../conversation-record.handler';

describe('ConversationRecordCallbackHandler summarization enqueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue({ id: 'conv-1' });
    mocks.messageCreate.mockResolvedValue({});
    mocks.conversationUpdate.mockResolvedValue({});
    mocks.enqueue.mockResolvedValue(undefined);
    mocks.queueClose.mockResolvedValue(undefined);
  });

  it('writes the message, then enqueues summarization and closes the queue', async () => {
    const handler = new ConversationRecordCallbackHandler({
      sessionId: 'agent-status:t1:agent',
      tenantId: 't1',
      model: 'm',
    });

    await handler.handleLLMStart({} as never, ['hello'], 'run-1');
    await vi.waitFor(() => expect(mocks.queueClose).toHaveBeenCalledTimes(1));

    expect(mocks.messageCreate).toHaveBeenCalledTimes(1);
    expect(mocks.queueCtor).toHaveBeenCalledWith(
      'summarize-queue',
      expect.objectContaining({ connection: expect.any(Object) })
    );
    expect(mocks.enqueue).toHaveBeenCalledWith(
      'conv-1',
      'agent-status:t1:agent',
      't1',
      expect.anything()
    );
  });

  it('does not enqueue when the conversation record is missing', async () => {
    mocks.findUnique.mockResolvedValue(null);
    const handler = new ConversationRecordCallbackHandler({ sessionId: 's', tenantId: 't1' });

    await handler.handleLLMStart({} as never, ['hello'], 'run-1');

    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it('logs (and still closes the queue) when the summarization enqueue rejects', async () => {
    mocks.enqueue.mockRejectedValue(new Error('redis down'));
    const handler = new ConversationRecordCallbackHandler({ sessionId: 's', tenantId: 't1' });

    await handler.handleLLMStart({} as never, ['hello'], 'run-1');
    await vi.waitFor(() => expect(mocks.queueClose).toHaveBeenCalledTimes(1));

    expect(mocks.logDebug).toHaveBeenCalledWith(
      { error: 'Error: redis down' },
      'Failed to enqueue conversation summarization'
    );
  });

  it('logs when closing the summarization queue fails', async () => {
    mocks.queueClose.mockRejectedValue(new Error('close failed'));
    const handler = new ConversationRecordCallbackHandler({ sessionId: 's', tenantId: 't1' });

    await handler.handleLLMStart({} as never, ['hello'], 'run-1');

    await vi.waitFor(() =>
      expect(mocks.logDebug).toHaveBeenCalledWith(
        { error: 'Error: close failed' },
        'Failed to close summarization queue'
      )
    );
  });
});
