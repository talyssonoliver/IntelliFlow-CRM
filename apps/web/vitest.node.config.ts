import { webConfig } from './vitest.config';

// The DOM-free web tests (vitest.node-env-files.txt), in the node environment. See vitest.config.ts.
export default webConfig('node');
