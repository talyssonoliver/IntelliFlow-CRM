import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLISHED_TERMS_VERSION } from '../src/terms-acceptance';

describe('PUBLISHED_TERMS_VERSION', () => {
  it('equals the version published at /terms (docs/shared/terms-content.md)', () => {
    const file = resolve(__dirname, '../../../docs/shared/terms-content.md');
    const line = readFileSync(file, 'utf8')
      .split('\n')
      .find((l) => l.startsWith('version: '));
    expect(line).toBeDefined();
    expect(PUBLISHED_TERMS_VERSION).toBe(line!.slice('version: '.length).trim());
  });
});
