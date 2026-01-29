/**
 * API client alias for tRPC
 *
 * This provides a more semantic name for API calls:
 * - api.lead.create() instead of trpc.lead.create()
 */
import { trpc } from './trpc';

export const api = trpc;
