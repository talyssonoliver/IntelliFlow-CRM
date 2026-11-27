/**
 * Who may read an email record, for readers that hold a record already (the attachment proxy): the
 * ONE rule of register #64 (personal mail is private), the shared predicate of
 * packages/db/src/email-visibility.ts, the same one the email view (getEmail, getThread, the list)
 * ANDs into its queries through `visibleMail`. An attachment is therefore never served to someone the
 * email itself is not shown to, nor refused to someone it is shown to.
 */
import { visibleMail, type EmailRouterCtx } from './email-access';

export async function canReadEmailRecord(
  c: EmailRouterCtx,
  email: { id: string }
): Promise<boolean> {
  const visible = await visibleMail(c, [email.id]);
  const found = await c.prisma.emailRecord.findFirst({
    where: { id: email.id, tenantId: c.tenant.tenantId, AND: [visible] },
    select: { id: true },
  });
  return found !== null;
}
