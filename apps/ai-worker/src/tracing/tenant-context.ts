/**
 * AsyncLocalStorage store for propagating tenant context through job processing
 * without threading tenantId through every function signature.
 *
 * Usage:
 *   // At job entry (AIWorker.processJob):
 *   await tenantContextStore.run({ tenantId: job.data.tenantId ?? 'unknown' }, async () => {
 *     await processJobImpl(job);
 *   });
 *
 *   // Inside createLLM / wrapModelWithTracing:
 *   const tenantId = tenantContextStore.getStore()?.tenantId ?? 'unknown';
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  tenantId: string;
}

export const tenantContextStore = new AsyncLocalStorage<TenantContext>();
