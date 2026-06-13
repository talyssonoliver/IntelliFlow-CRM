import { createTRPCReact } from '@trpc/react-query';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@intelliflow/api-client';

export const trpc = createTRPCReact<AppRouter>();

/** Inferred output types for every tRPC procedure, e.g. RouterOutputs['account']['stats']. */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
