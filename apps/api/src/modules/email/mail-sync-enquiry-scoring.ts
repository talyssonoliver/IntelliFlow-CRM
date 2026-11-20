/**
 * MVP-012 #34: queue AI scoring for the lead an email enquiry made (split out of the sync engine to
 * keep it within its size limit). Best-effort and detached: a missing queue never breaks a sync.
 * An existing lead (a raced or repeated enquiry) is a deduped no-op in the enqueue itself.
 */
export type QueueLeadAi = (ref: {
  leadId: string;
  tenantId: string;
  correlationId: string;
}) => Promise<void>;

export function queueEnquiryLeadScoring(
  queueLeadAi: QueueLeadAi | undefined,
  ref: { leadId: string; tenantId: string; providerMessageId: string }
): void {
  if (!queueLeadAi) return;
  const warn = (error: unknown) =>
    console.warn('[email-sync] enquiry lead AI enqueue failed', {
      leadId: ref.leadId,
      error: error instanceof Error ? error.name : 'unknown',
    });
  // Promise.resolve().then also turns a synchronous throw into a rejection the .catch handles.
  void Promise.resolve()
    .then(() =>
      queueLeadAi({
        leadId: ref.leadId,
        tenantId: ref.tenantId,
        correlationId: `mail-enquiry:${ref.providerMessageId}`,
      })
    )
    .catch(warn);
}
