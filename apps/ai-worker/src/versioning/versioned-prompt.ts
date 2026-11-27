/**
 * Decides whether a prompt from the version loader may replace a chain's own prompt.
 *
 * The loader returns a tenant's saved, active chain version, or its built-in fallback when there is
 * none (DEFAULT_CONFIGS in version-loader.ts). The fallback prompts have no input slots, and several
 * chains read another chain type's version (churn risk reads SCORING, sentiment reads EMAIL_WRITER,
 * ticket routing reads FOLLOWUP). Used as a template, such a prompt sends the model instructions
 * with none of the data: lead scoring never saw the lead.
 *
 * A loader prompt is used only when it places every input slot the chain fills; otherwise the
 * chain keeps its own prompt. Appending the data to a prompt written for another chain would
 * still ask the model the wrong question, so the chain's prompt is the safer default.
 */
import { PromptTemplate } from '@langchain/core/prompts';
import pino from 'pino';

const logger = pino({ name: 'versioned-prompt', level: process.env.LOG_LEVEL || 'info' });
const reported = new Set<string>();

/**
 * The input slots the prompt is missing, read the way PromptTemplate formats it: an escaped
 * `{{name}}` is literal text, not a slot. A prompt PromptTemplate cannot parse, or one with a
 * slot the chain does not fill (format would throw), counts as missing every slot.
 */
export function missingPromptSlots(prompt: string, inputVariables: readonly string[]): string[] {
  let slots: string[];
  try {
    slots = PromptTemplate.fromTemplate(prompt).inputVariables;
  } catch {
    return [...inputVariables];
  }
  if (slots.some((slot) => !inputVariables.includes(slot))) return [...inputVariables];
  return inputVariables.filter((name) => !slots.includes(name));
}

/**
 * The loader prompt when it can carry the chain's data, otherwise null (use the chain's prompt).
 * Logs once per chain when a loader prompt is set aside.
 */
export function usableVersionedPrompt(
  chain: string,
  loaderPrompt: string | null | undefined,
  inputVariables: readonly string[]
): string | null {
  if (!loaderPrompt) return null;
  const missing = missingPromptSlots(loaderPrompt, inputVariables);
  if (missing.length === 0) return loaderPrompt;
  if (!reported.has(chain)) {
    reported.add(chain);
    logger.warn(
      { chain, missingSlots: missing },
      'Versioned prompt has no slot for the chain input; using the chain prompt'
    );
  }
  return null;
}
