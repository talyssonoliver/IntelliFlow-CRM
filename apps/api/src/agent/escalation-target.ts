/**
 * Can an escalation target actually decide agent actions? (PG-198)
 *
 * `agent.approveAction` / `rejectAction` require the `agent:tool-approval` approve and
 * reject permissions on top of the policy's minimum role, and a per-user deny overrides the
 * role. An escalation to someone without both permissions would land on a person who is
 * refused when they act, so policies and the sweep check this up front.
 */
import { hasPermission } from '../lib/rbac';
import type { Context } from '../context';

export interface EscalationTargetUser {
  id: string;
  email: string;
  role: string;
}

export async function canDecideAgentActions(
  prisma: Context['prisma'],
  tenantId: string,
  user: EscalationTargetUser
): Promise<boolean> {
  const asTarget = {
    prisma,
    user: { userId: user.id, email: user.email, role: user.role, tenantId, emailVerified: true },
  };
  const [approve, reject] = await Promise.all([
    hasPermission(asTarget, 'agent:tool-approval', 'approve'),
    hasPermission(asTarget, 'agent:tool-approval', 'reject'),
  ]);
  return approve && reject;
}
