/**
 * MVP-001: "Which address do you send from?" on the connect screen. Answers which provider runs
 * that address's mail (from its MX records) and whether it is a personal address, so the right
 * one-click button is offered first and a personal address for the company mailbox is flagged.
 * Reads DNS only; nothing is stored. Signed-in users only.
 */
import { z } from 'zod';
import { createTRPCRouter, tenantProcedure } from '../../trpc';
import { assertTenantContext } from '../../security/tenant-context';
import { providerHintFor, type ProviderHint } from './mailbox-provider-hint';

const input = z.object({ address: z.string().trim().toLowerCase().email().max(320) }).strict();

export const emailProviderHintRouter = createTRPCRouter({
  forAddress: tenantProcedure.input(input).query(async ({ ctx, input }): Promise<ProviderHint> => {
    assertTenantContext(ctx);
    return providerHintFor(input.address);
  }),
});
