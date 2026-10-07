import { describe, it, expect } from 'vitest';
import { ACCOUNT_TIER_COLOR_TOKENS } from '@intelliflow/validators';
import { TIER_COLOR_CLASSES, UNKNOWN_TIER_COLORS, tierColorClasses } from '../tier-colors';

describe('tier colour classes (PG-196)', () => {
  it('maps every palette token, and nothing else (palette drift guard)', () => {
    expect(Object.keys(TIER_COLOR_CLASSES).sort()).toEqual([...ACCOUNT_TIER_COLOR_TOKENS].sort());
  });

  it.each([...ACCOUNT_TIER_COLOR_TOKENS])('%s has every class used by tier displays', (token) => {
    const classes = TIER_COLOR_CLASSES[token];
    expect(classes.badge).toContain(`bg-${token}-100`);
    expect(classes.dot).toBe(`bg-${token}-500`);
    expect(classes.avatarBg).toContain(`text-${token}-700`);
    expect(classes.gradient).toContain(`from-${token}-100`);
    expect(classes.sidebarText).toBe(`text-${token}-500`);
  });

  it('keeps the colours tiers had before they were configurable', () => {
    expect(TIER_COLOR_CLASSES.purple.gradient).toContain('to-indigo-50');
    expect(TIER_COLOR_CLASSES.yellow.dot).toBe('bg-yellow-500');
  });

  it('falls back to slate for a token outside the palette', () => {
    expect(tierColorClasses('chartreuse')).toBe(TIER_COLOR_CLASSES.slate);
    expect(tierColorClasses('blue')).toBe(TIER_COLOR_CLASSES.blue);
  });

  it('has neutral colours for accounts without a tier', () => {
    expect(UNKNOWN_TIER_COLORS.dot).toBe('bg-slate-400');
  });
});
