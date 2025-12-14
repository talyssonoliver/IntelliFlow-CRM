import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@intelliflow/api-client';

export const trpc = createTRPCReact<AppRouter>();
