/**
 * ADR-070: the SUPPORT, ANALYTICS and AI_INTELLIGENCE routers enforce their module
 * entitlement server-side (the frontend <ModuleGate> only hides the UI).
 *
 * Every procedure of each router is enumerated, so a new procedure that forgets the
 * gate turns this red. Procedures deliberately shared with CORE_CRM are exempted by name.
 */
import { describe, it, expect } from 'vitest';
import { TRPCError } from '@trpc/server';
import { createAdminContext } from '../../../test/setup';
import { ticketRouter } from '../ticket.router';
import { ticketRoutingRouter } from '../ticket-routing.router';
import { ticketConfigRouter } from '../ticket-config.router';
import { ticketSettingsRouter } from '../ticket-settings.router';
import { analyticsRouter } from '../../analytics/analytics.router';
import { reportSettingsRouter } from '../../analytics/report-settings.router';
import { intelligenceRouter } from '../../intelligence/intelligence.router';
import { agentRouter } from '../../agent/agent.router';
import { conversationRouter } from '../../agent/conversation.router';

/** Procedures the core dashboard / governance pages (CORE_CRM, every plan) call. */
const CORE_SHARED = new Set(['getOverview', 'recentActivity']);

const GATED: Array<[string, string, unknown, Set<string>]> = [
  ['ticket', 'SUPPORT', ticketRouter, new Set()],
  ['ticketRouting', 'SUPPORT', ticketRoutingRouter, new Set()],
  ['ticketConfig', 'SUPPORT', ticketConfigRouter, new Set()],
  ['ticketSettings', 'SUPPORT', ticketSettingsRouter, new Set()],
  ['analytics', 'ANALYTICS', analyticsRouter, CORE_SHARED],
  ['reportSettings', 'ANALYTICS', reportSettingsRouter, new Set()],
  ['intelligence', 'AI_INTELLIGENCE', intelligenceRouter, new Set()],
  ['agent', 'AI_INTELLIGENCE', agentRouter, new Set()],
  ['conversation', 'AI_INTELLIGENCE', conversationRouter, new Set()],
];

function ctxDenying(deniedModule: string) {
  const ctx = createAdminContext(); // ADMIN so role-gated procedures reach the entitlement check
  (ctx.container.get as any).mockImplementation((name: string) =>
    name === 'moduleAccess'
      ? { isModuleEnabled: async (_t: string, m: string) => m !== deniedModule }
      : undefined
  );
  return ctx;
}

function resolve(caller: any, path: string): unknown {
  return path.split('.').reduce((node, key) => node?.[key], caller);
}

async function outcome(fn: unknown): Promise<unknown> {
  try {
    await (fn as (i: unknown) => Promise<unknown>)({});
    return undefined;
  } catch (e) {
    return e;
  }
}

describe('module-gated routers deny a tenant whose plan lacks the module', () => {
  for (const [name, moduleId, router, exempt] of GATED) {
    it(`${name}: every procedure is FORBIDDEN without ${moduleId}, except core-shared ones`, async () => {
      const procedures = Object.keys((router as any)._def.procedures ?? {});
      expect(procedures.length).toBeGreaterThan(0);
      const caller = (router as any).createCaller(ctxDenying(moduleId));

      let gated = 0;
      for (const path of procedures) {
        const err = await outcome(resolve(caller, path));
        const forbidden =
          err instanceof TRPCError && err.code === 'FORBIDDEN' && err.message.includes(moduleId);
        if (exempt.has(path.split('.').pop()!)) {
          expect(forbidden, `${name}.${path} is core-shared and must stay reachable`).toBe(false);
        } else {
          expect(forbidden, `${name}.${path} must be gated by ${moduleId}`).toBe(true);
          gated++;
        }
      }
      expect(gated).toBeGreaterThan(0);
    });
  }

  it('a denied unrelated module does not block the tenant', async () => {
    const caller = (ticketRouter as any).createCaller(ctxDenying('COMMERCE'));
    const err = await outcome(resolve(caller, 'list'));
    expect(
      err instanceof TRPCError && err.code === 'FORBIDDEN' && /SUPPORT/.test(err.message)
    ).toBe(false);
  });
});
