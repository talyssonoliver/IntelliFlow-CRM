/**
 * MVP-012: a data subject's reply drafts, for the DSAR export counts and the erasure checklist.
 * A draft Aurora wrote answers a contact or (since #1452) a lead, so both are matched (codex).
 */
export const replyDraftsOf = (
  tenantId: string,
  ids: { leadIds: string[]; contactIds: string[] }
) => ({
  tenantId,
  OR: [{ contactId: { in: ids.contactIds } }, { leadId: { in: ids.leadIds } }],
});
