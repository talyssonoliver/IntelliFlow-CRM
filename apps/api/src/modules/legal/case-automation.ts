/**
 * Case Automation Enforcement — PG-190 v2
 *
 * Loads a tenant's `CaseAutomationSetting` row and exposes helpers that
 * turn the stored toggles into actual runtime behavior. Policy rows are
 * owned by case-settings.router.ts; this module is the runtime consumer.
 *
 * Runtime coverage of the 12 toggles on CaseAutomationSetting (honest state):
 *
 *   WIRED in this file (1 of 12):
 *     - restrictTagCreationToAdmins → assertCanCreateTag (used by tags.create)
 *
 *   NOT YET WIRED (11 of 12 — no production consumer exists today):
 *     - preventDeleteWithOpenTasks
 *     - notifyOnDuplicate
 *     - notifyOnAssignmentChange
 *     - notifyOnStatusChange
 *     - autoEscalateOverdue
 *     - notifyOnDeadlineApproaching
 *     - aiCaseSummarization
 *     - aiPriorityPrediction
 *     - aiResolutionSuggestion
 *     - aiTagSuggestions
 *     - aiInsightGeneration
 *
 * Pending consumers are tracked as dedicated follow-up tasks in
 * `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`:
 *   - PG-190-FU-01 — notify-on-change consumers in cases.router.ts
 *   - PG-190-FU-02 — preventDeleteWithOpenTasks + notifyOnDuplicate enforcement
 *   - PG-190-FU-03 — autoEscalate + deadline-reminder workers
 *   - PG-190-FU-04 — AI chains for cases (summarization, priority, resolution,
 *                    tag suggestions, insights)
 *
 * Until those follow-ups land, the UI toggles are stored but do nothing on the
 * server side. MEMORY "PG-186 audit lessons — Cat-1 toggles loaded but with
 * zero production callers" applies — this header documents the dead state
 * honestly instead of pretending wiring exists.
 */

import type { CaseAutomationSetting } from '@intelliflow/db';
import { TRPCError } from '@trpc/server';

export interface CaseAutomationFlags {
  autoEscalateOverdue: boolean;
  notifyOnAssignmentChange: boolean;
  notifyOnDeadlineApproaching: boolean;
  notifyOnStatusChange: boolean;
  notifyOnDuplicate: boolean;
  restrictTagCreationToAdmins: boolean;
  preventDeleteWithOpenTasks: boolean;
  aiCaseSummarization: boolean;
  aiPriorityPrediction: boolean;
  aiResolutionSuggestion: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
}

const AUTOMATION_FACTORY_DEFAULTS: CaseAutomationFlags = {
  autoEscalateOverdue: false,
  notifyOnAssignmentChange: true,
  notifyOnDeadlineApproaching: true,
  notifyOnStatusChange: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  preventDeleteWithOpenTasks: true,
  aiCaseSummarization: false,
  aiPriorityPrediction: false,
  aiResolutionSuggestion: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
};

interface HasTenantContext {
  tenant: { tenantId: string };
  prismaWithTenant: {
    caseAutomationSetting: {
      findUnique(args: { where: { tenantId: string } }): Promise<CaseAutomationSetting | null>;
    };
  };
}

interface UserRoleContext {
  user?: { role?: string | null } | null;
}

/**
 * Load the tenant's case-automation row, falling back to factory defaults
 * when no row has been seeded yet (new tenant that hasn't opened settings).
 */
export async function loadCaseAutomation(ctx: HasTenantContext): Promise<CaseAutomationFlags> {
  const row = await ctx.prismaWithTenant.caseAutomationSetting.findUnique({
    where: { tenantId: ctx.tenant.tenantId },
  });
  if (!row) return { ...AUTOMATION_FACTORY_DEFAULTS };
  return {
    autoEscalateOverdue: row.autoEscalateOverdue,
    notifyOnAssignmentChange: row.notifyOnAssignmentChange,
    notifyOnDeadlineApproaching: row.notifyOnDeadlineApproaching,
    notifyOnStatusChange: row.notifyOnStatusChange,
    notifyOnDuplicate: row.notifyOnDuplicate,
    restrictTagCreationToAdmins: row.restrictTagCreationToAdmins,
    preventDeleteWithOpenTasks: row.preventDeleteWithOpenTasks,
    aiCaseSummarization: row.aiCaseSummarization,
    aiPriorityPrediction: row.aiPriorityPrediction,
    aiResolutionSuggestion: row.aiResolutionSuggestion,
    aiTagSuggestions: row.aiTagSuggestions,
    aiInsightGeneration: row.aiInsightGeneration,
  };
}

/**
 * Enforce `restrictTagCreationToAdmins` on caseSettings.tags.create.
 * When the toggle is on, only users with role ADMIN or OWNER can add tags.
 */
export function assertCanCreateTag(
  ctx: UserRoleContext,
  flags: Pick<CaseAutomationFlags, 'restrictTagCreationToAdmins'>
): void {
  if (!flags.restrictTagCreationToAdmins) return;
  const role = ctx.user?.role ?? '';
  if (role === 'ADMIN' || role === 'OWNER') return;
  throw new TRPCError({
    code: 'FORBIDDEN',
    message:
      'Tag creation is restricted to workspace admins. Ask an admin to create the tag or disable "Restrict tag creation to admins" in Case Settings.',
  });
}
