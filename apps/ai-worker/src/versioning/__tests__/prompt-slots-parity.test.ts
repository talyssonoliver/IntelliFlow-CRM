/**
 * The API decides which chains a saved prompt can feed with promptSlots (@intelliflow/application,
 * no LangChain). The worker decides with LangChain's PromptTemplate. They must agree, or the
 * AI Chains page would show a prompt the worker does not send.
 */
import { describe, expect, it } from 'vitest';
import { PromptTemplate } from '@langchain/core/prompts';
import { BUILTIN_CHAIN_TEMPLATES, promptSlots } from '@intelliflow/application';

function langchainSlots(template: string): string[] | null {
  try {
    return [...PromptTemplate.fromTemplate(template).inputVariables].sort();
  } catch {
    return null;
  }
}

const SAMPLES = [
  'no slots',
  'Lead: {lead_info}',
  '{a} then {b} then {a}',
  'JSON: {{"score": 1}} for {lead_info}',
  'open { only',
  'close } only',
  '{{escaped}} only',
  '{text} {context} {source}',
  'nested {a{b}}',
  ...Object.values(BUILTIN_CHAIN_TEMPLATES),
];

describe('promptSlots agrees with LangChain PromptTemplate', () => {
  it.each(SAMPLES.map((s) => [s.slice(0, 40), s]))('%s', (_label, template) => {
    const ours = promptSlots(template);
    expect(ours === null ? null : [...ours].sort()).toEqual(langchainSlots(template));
  });
});
