/**
 * Automatic Vitest mock for @/lib/trpc-server.
 *
 * Placed in `src/lib/__mocks__/trpc-server.ts` so Vitest can discover it
 * automatically when tests call `vi.mock('@/lib/trpc-server')`.
 *
 * This stub prevents Vite's import-analysis plugin from trying to resolve
 * `@intelliflow/api/context` and `@intelliflow/api/router` — package subpath
 * imports that are not valid in the web app's module graph (the api package
 * only exposes `dist/index.js` via "main", not subpath exports).
 *
 * Tests that need `createCallerFromToken` behavior should override with:
 *   vi.mock('@/lib/trpc-server', () => ({
 *     createCallerFromToken: vi.fn().mockResolvedValue({ ... }),
 *   }));
 */

import { vi } from 'vitest';

export const getAccessToken = vi.fn().mockResolvedValue(null);
export const createCallerFromToken = vi.fn().mockResolvedValue({});
