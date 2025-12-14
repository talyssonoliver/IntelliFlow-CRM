/**
 * tRPC Client Setup
 * Connects to apps/api tracker endpoints
 */

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
