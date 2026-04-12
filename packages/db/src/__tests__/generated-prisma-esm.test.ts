import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const generatedPrismaPath = (...parts: string[]) =>
  resolve(__dirname, '..', '..', 'generated', 'prisma', ...parts);

describe('generated Prisma ESM shims', () => {
  it('marks generated/prisma as an ESM package for tsx consumers', () => {
    const packageJson = JSON.parse(readFileSync(generatedPrismaPath('package.json'), 'utf8'));

    expect(packageJson).toMatchObject({ type: 'module' });
  });

  it('re-exports Prisma from the generated client shim', () => {
    const clientShim = readFileSync(generatedPrismaPath('client.js'), 'utf8');

    expect(clientShim).toContain("export { Prisma } from './client.ts';");
  });
});
