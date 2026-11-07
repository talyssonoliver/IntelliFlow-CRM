/**
 * Decides whether a prompt from the version loader may replace a chain's own prompt.
 *
 * Nothing calls configureVersionLoader() in production, so getChainConfig() always returns the
 * loader's fallback (DEFAULT_CONFIGS in version-loader.ts). Those fallback prompts have no input
 * slots, and several belong to another chain type (churn risk reads SCORING, sentiment reads
 * EMAIL_WRITER, ticket routing reads FOLLOWUP). Used as a template they sent the model
 * instructions with none of the data: lead scoring never saw the lead.
 *
 * A loader prompt is used only when it places every input slot the chain fills; otherwise the
 * chain keeps its own prompt. Appending the data to a prompt written for another chain would
 * still ask the model the wrong question, so the chain's prompt is the safer default.
 */
import pino from 'pino';

const logger = pino({ name: 'versioned-prompt', level: process.env.LOG_LEVEL || 'info' });
const reported = new Set<string>();

/** The input slots (`{name}`) the prompt is missing. */
export function missingPromptSlots(prompt: string, inputVariables: readonly string[]): string[] {
  return inputVariables.filter((name) => !prompt.includes(`{${name}}`));
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
