/**
 * tRPC Client Setup
 * Connects to apps/api tracker endpoints
 */

import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../api/src/router'; // Will be created next

export const trpc = createTRPCReact<AppRouter>();

/**
 * API configuration
 */
export const API_CONFIG = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  endpoints: {
    trpc: '/api/trpc',
  },
};

/**
 * Get full API URL
 */
export function getApiUrl(endpoint: string): string {
  return `${API_CONFIG.baseUrl}${endpoint}`;
}
