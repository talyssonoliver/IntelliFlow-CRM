/**
 * Tests for ensurePromptBudget
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ------- mock token-counter so tests are deterministic -------
// Each message is counted as (content.length / 4) + 4 overhead + 2 base
// We mock countMessagesTokens to return sum of content lengths / 2
// (a simple linear stand-in that makes budget math predictable)

const mockCountMessagesTokens = vi.fn();

vi.mock('./token-counter.js', () => ({
  countMessagesTokens: (...args: any[]) => mockCountMessagesTokens(...args),
}));

import { BaseMessage, SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ensurePromptBudget } from './prompt-budget';

/**
 * Helper: build a mock token count proportional to total content chars.
 * Each message contributes Math.ceil(content.length / 4) + 4, plus 2 base.
 */
function realTokenEstimate(messages: BaseMessage[]): number {
  if (!messages || messages.length === 0) return 0;
  let total = 2; // base overhead
  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    total += Math.ceil(content.length / 4) + 4;
  }
  return total;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: delegate to the real estimator so tests are self-consistent
  mockCountMessagesTokens.mockImplementation(realTokenEstimate);
});

// ---------------------------------------------------------------

describe('ensurePromptBudget — empty / trivial inputs', () => {
  it('returns empty array for empty input', () => {
    const r = ensurePromptBudget([], { maxTokens: 1000 });
    expect(r.messages).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.droppedCount).toBe(0);
  });

  it('returns empty array for null input without crashing', () => {
    const r = ensurePromptBudget(null as any, { maxTokens: 1000 });
    expect(r.messages).toEqual([]);
    expect(r.truncated).toBe(false);
    expect(r.droppedCount).toBe(0);
  });
});

describe('ensurePromptBudget — already within budget', () => {
  it('returns original messages unchanged when under budget', () => {
    const msgs = [new SystemMessage('You are helpful.'), new HumanMessage('Hello')];
    // Make the count return something well below maxTokens
    mockCountMessagesTokens.mockReturnValue(20);

    const r = ensurePromptBudget(msgs, { maxTokens: 100 });
    expect(r.truncated).toBe(false);
    expect(r.droppedCount).toBe(0);
    expect(r.messages).toHaveLength(2);
  });

  it('returns a copy, not the original array reference', () => {
    const msgs = [new HumanMessage('hi')];
    mockCountMessagesTokens.mockReturnValue(5);

    const r = ensurePromptBudget(msgs, { maxTokens: 100 });
    expect(r.messages).not.toBe(msgs);
  });
});

describe('ensurePromptBudget — truncation', () => {
  it('drops middle messages until under budget', () => {
    const system = new SystemMessage('sys');
    const h1 = new AIMessage('old turn 1');
    const h2 = new AIMessage('old turn 2');
    const current = new HumanMessage('current question');

    const msgs = [system, h1, h2, current];

    // Call sequence (each call to countMessagesTokens):
    //  1. Fast-path check [sys,h1,h2,current]:   200 → over budget → enter loop
    //  2. Loop check before drop #1 [sys,h1,h2,current]: 200 → over → drop h1
    //  3. Loop check before drop #2 [sys,h2,current]:     150 → over → drop h2
    //  4. Loop check after drop #2 [sys,current]:          80 → under → exit
    mockCountMessagesTokens
      .mockReturnValueOnce(200) // fast-path
      .mockReturnValueOnce(200) // loop iter 1
      .mockReturnValueOnce(150) // loop iter 2
      .mockReturnValueOnce(80); // loop exit condition

    const r = ensurePromptBudget(msgs, { maxTokens: 100 });

    expect(r.truncated).toBe(true);
    expect(r.droppedCount).toBe(2);
    // system and current must remain
    expect(r.messages[0]).toBe(system);
    expect(r.messages[r.messages.length - 1]).toBe(current);
  });

  it('preserves system message at index 0', () => {
    const system = new SystemMessage('You are an assistant.');
    const history = Array.from({ length: 5 }, (_, i) => new AIMessage(`turn ${i}`));
    const current = new HumanMessage('final');
    const msgs = [system, ...history, current];

    // Gradually decrease token count on each call
    let callCount = 0;
    mockCountMessagesTokens.mockImplementation(() => {
      callCount++;
      return Math.max(10, 300 - callCount * 50);
    });

    const r = ensurePromptBudget(msgs, { maxTokens: 100 });

    expect(r.messages[0]).toBe(system); // system always preserved
    expect(r.messages[r.messages.length - 1]).toBe(current); // last always preserved
    expect(r.truncated).toBe(true);
  });

  it('preserves last human message (current turn)', () => {
    const h1 = new HumanMessage('old');
    const current = new HumanMessage('current');

    // Call sequence:
    //  1. Fast-path [h1, current]: 200 → over
    //  2. Loop check: 200 → over → drop h1 (but dropIdx=0, working.length=2, last idx=1; 0 < 1 → allowed)
    //  3. Loop check: 80 → under → exit
    mockCountMessagesTokens
      .mockReturnValueOnce(200) // fast-path
      .mockReturnValueOnce(200) // loop iter 1 (h1 gets dropped)
      .mockReturnValueOnce(80); // exit

    const r = ensurePromptBudget([h1, current], { maxTokens: 100 });

    expect(r.messages[r.messages.length - 1]).toBe(current);
    expect(r.droppedCount).toBe(1);
  });

  it('does NOT drop last message even when only two messages remain', () => {
    const system = new SystemMessage('sys');
    const current = new HumanMessage('question');

    // Always over budget, but only anchors remain
    mockCountMessagesTokens.mockReturnValue(500);

    const r = ensurePromptBudget([system, current], { maxTokens: 100 });

    // Cannot drop either — both are anchors
    expect(r.messages).toHaveLength(2);
    expect(r.droppedCount).toBe(0);
  });

  it('drops history when no system message is present', () => {
    const a1 = new AIMessage('old ai');
    const h1 = new HumanMessage('old human');
    const current = new HumanMessage('current');

    mockCountMessagesTokens
      .mockReturnValueOnce(300)
      .mockReturnValueOnce(200)
      .mockReturnValueOnce(80);

    const r = ensurePromptBudget([a1, h1, current], { maxTokens: 100 });

    expect(r.messages[r.messages.length - 1]).toBe(current);
    expect(r.truncated).toBe(true);
  });
});

describe('ensurePromptBudget — single message', () => {
  it('handles single message array (only current turn)', () => {
    const current = new HumanMessage('just me');
    mockCountMessagesTokens.mockReturnValue(10);

    const r = ensurePromptBudget([current], { maxTokens: 100 });
    expect(r.messages).toHaveLength(1);
    expect(r.truncated).toBe(false);
  });

  it('does not drop single message even if over budget', () => {
    const current = new HumanMessage('very long message');
    mockCountMessagesTokens.mockReturnValue(9999);

    const r = ensurePromptBudget([current], { maxTokens: 10 });
    expect(r.messages).toHaveLength(1);
    expect(r.droppedCount).toBe(0);
  });
});

describe('ensurePromptBudget — model option', () => {
  it('passes model to countMessagesTokens', () => {
    const msgs = [new SystemMessage('sys'), new HumanMessage('hi')];
    mockCountMessagesTokens.mockReturnValue(10);

    ensurePromptBudget(msgs, { maxTokens: 100, model: 'gpt-4o' });

    expect(mockCountMessagesTokens).toHaveBeenCalledWith(expect.any(Array), 'gpt-4o');
  });
});
