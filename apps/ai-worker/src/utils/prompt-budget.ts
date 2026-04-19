/**
 * Prompt budget management — truncates conversation history to fit within a
 * token budget before sending to the LLM.
 *
 * Strategy:
 *  - Drop oldest messages first (index 1 .. N-2).
 *  - Never drop index 0 if it is a SystemMessage.
 *  - Never drop the last HumanMessage (the current turn).
 *
 * @module prompt-budget
 */

import { BaseMessage, SystemMessage } from '@langchain/core/messages';
import { countMessagesTokens } from './token-counter.js';

/**
 * Options for `ensurePromptBudget`.
 */
export interface PromptBudgetOptions {
  /** Hard upper bound on the total token count of the returned messages array. */
  maxTokens: number;
  /** Optional model name for accurate token counting (defaults to cl100k_base). */
  model?: string;
}

/**
 * Result returned by `ensurePromptBudget`.
 */
export interface PromptBudgetResult {
  /** The (possibly truncated) message array — always has at least the anchors. */
  messages: BaseMessage[];
  /** True when at least one message was removed. */
  truncated: boolean;
  /** How many messages were dropped from the history window. */
  droppedCount: number;
}

/**
 * Reduce a message array to fit within `maxTokens` by dropping the OLDEST
 * messages in the middle of the conversation.
 *
 * Anchor rules (never dropped):
 *  - Index 0 when it is a `SystemMessage`
 *  - The final element (current human turn)
 *
 * @param messages - The assembled message array (system + history + human turn).
 * @param options  - `{ maxTokens, model? }`.
 * @returns A `PromptBudgetResult` with the safe message list and truncation metadata.
 */
export function ensurePromptBudget(
  messages: BaseMessage[],
  options: PromptBudgetOptions
): PromptBudgetResult {
  const { maxTokens, model } = options;

  if (!messages || messages.length === 0) {
    return { messages: [], truncated: false, droppedCount: 0 };
  }

  // Fast path: already within budget.
  if (countMessagesTokens(messages, model) <= maxTokens) {
    return { messages: [...messages], truncated: false, droppedCount: 0 };
  }

  // Identify anchors.
  const firstIsSystem = messages[0] instanceof SystemMessage;
  const anchorStartIndex = firstIsSystem ? 1 : 0;
  const anchorEndIndex = messages.length - 1; // last message is always kept

  // Build a mutable working copy.
  const working: BaseMessage[] = [...messages];
  let droppedCount = 0;

  // Candidates to drop are in the range [anchorStartIndex, anchorEndIndex).
  // We iterate from the oldest (anchorStartIndex) forward.
  while (countMessagesTokens(working, model) > maxTokens && anchorStartIndex < anchorEndIndex) {
    // The candidate to drop is always at anchorStartIndex in the current array,
    // because all prior candidates have already been removed.
    const dropIdx = anchorStartIndex;
    // Only drop if the candidate is not the last element.
    if (dropIdx >= working.length - 1) {
      break;
    }
    working.splice(dropIdx, 1);
    droppedCount++;
  }

  return {
    messages: working,
    truncated: droppedCount > 0,
    droppedCount,
  };
}
