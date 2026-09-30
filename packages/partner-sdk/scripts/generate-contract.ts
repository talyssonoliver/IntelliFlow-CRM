/**
 * Generates contract/partner-contract.v1.json from the zod schemas.
 * Run: pnpm --filter @intelliflow/partner-sdk contract:generate
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildContract } from '../src/contract';

const target = fileURLToPath(new URL('../contract/partner-contract.v1.json', import.meta.url));
writeFileSync(target, `${JSON.stringify(buildContract(), null, 2)}\n`);
console.log(`wrote ${target}`);
