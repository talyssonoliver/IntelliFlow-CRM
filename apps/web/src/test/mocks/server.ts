/**
 * MSW Server Setup
 *
 * Server setup for Node.js environment (Vitest).
 */

import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// Create the MSW server instance
export const server = setupServer(...handlers);
