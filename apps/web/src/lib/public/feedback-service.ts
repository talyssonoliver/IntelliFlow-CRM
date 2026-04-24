/**
 * Public Feedback Service — PG-126
 *
 * Browser-side helpers for the anonymous public feedback widget. Schema
 * validation and tRPC mutation plumbing live here so the widget UI can stay
 * focused on presentation.
 *
 * Design note: we intentionally do NOT instantiate a vanilla tRPC client
 * here — the project uses `trpc.<route>.useMutation()` everywhere (see
 * `apps/web/src/lib/trpc.ts`). The widget component calls that hook
 * directly and only uses this module for (a) schema validation, (b)
 * client-side rate limiting, and (c) prepared payload construction.
 */
import {
  publicFeedbackInputSchema,
  type PublicFeedbackInput,
} from '@intelliflow/validators';

const CLIENT_SUBMIT_KEY = 'intelliflow.public.feedback.submitted_at';
const CLIENT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Returns false when the client rate-limit window is still active — the
 * widget should surface the "thanks, already received" state without
 * attempting a network request.
 */
export function canSubmitFeedbackClientRateLimit(
  now: number = Date.now()
): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stamp = window.localStorage.getItem(CLIENT_SUBMIT_KEY);
    if (!stamp) return true;
    const parsed = Date.parse(stamp);
    if (Number.isNaN(parsed)) return true;
    return now - parsed >= CLIENT_RATE_LIMIT_WINDOW_MS;
  } catch {
    return true;
  }
}

export function markFeedbackSubmittedClientSide(
  now: Date = new Date()
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CLIENT_SUBMIT_KEY, now.toISOString());
  } catch {
    /* no-op — quota exceeded / blocked */
  }
}

export function clearFeedbackClientRateLimit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CLIENT_SUBMIT_KEY);
  } catch {
    /* no-op */
  }
}

/**
 * Validates + normalises a feedback form submission. Throws a ZodError when
 * the input is invalid. Returns a payload safe to pass to the tRPC
 * mutation.
 */
export function preparePublicFeedbackPayload(
  input: PublicFeedbackInput
): PublicFeedbackInput {
  return publicFeedbackInputSchema.parse(input);
}

export { publicFeedbackInputSchema };
export type { PublicFeedbackInput };
