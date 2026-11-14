import { describe, expect, it } from 'vitest';
import { bareLeak } from '../lib/git-bare-guard.mjs';

describe('git-bare-guard (globalSetup)', () => {
  it('fails the run when a test turned core.bare on, and says how to fix it', () => {
    const message = bareLeak('false', 'true');
    expect(message).toContain('core.bare=true');
    expect(message).toContain('gitEnv(process.env)');
  });

  it('passes when core.bare stayed off, or was already on before the run', () => {
    expect(bareLeak('false', 'false')).toBeNull();
    expect(bareLeak('', '')).toBeNull();
    expect(bareLeak('true', 'true')).toBeNull();
  });
});
