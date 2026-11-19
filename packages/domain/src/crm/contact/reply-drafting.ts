/**
 * MVP-012: whether Aurora drafts a reply to an enquiry, for a tenant that never saved the
 * "AI reply drafting" setting. A tenant that saved it keeps its choice.
 *
 * ON (owner rule 19/11: defaults on). Each draft is one call to the tenant's model for the
 * 'email' purpose, inside the monthly AI ceiling. The draft is only ever a draft: nothing is sent
 * without the user's click (ADR-037). This is the one place to change the default.
 */
export const AI_REPLY_DRAFTING_DEFAULT = true;

/** The tenant's setting when it saved one, else the default. */
export function replyDraftingEnabled(saved: boolean | null | undefined): boolean {
  return saved ?? AI_REPLY_DRAFTING_DEFAULT;
}
