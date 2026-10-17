import { describe, it, expect } from 'vitest';
import { ACCOUNT_TAG_COLOR_TOKENS } from '@intelliflow/validators';
import { COLOR_SWATCH_CLASSES, swatchClass, toColorToken } from '../color-tokens';
import * as territoryColors from '@/app/accounts/(list)/territory-mapping/components/territory-colors';

describe('color-tokens (PG-198 A12)', () => {
  it('has a static swatch class for each of the 18 allowlisted tokens', () => {
    expect(ACCOUNT_TAG_COLOR_TOKENS).toHaveLength(18);
    for (const token of ACCOUNT_TAG_COLOR_TOKENS) {
      expect(COLOR_SWATCH_CLASSES[token]).toBe(`bg-${token}-500`);
    }
  });

  it('keeps a known token and falls back to slate for anything else', () => {
    expect(toColorToken('violet')).toBe('violet');
    expect(toColorToken('not-a-colour')).toBe('slate');
    expect(swatchClass('teal')).toBe('bg-teal-500');
    expect(swatchClass('')).toBe('bg-slate-500');
  });

  it('is re-exported unchanged by the territory module (pure move)', () => {
    expect(territoryColors.COLOR_SWATCH_CLASSES).toBe(COLOR_SWATCH_CLASSES);
    expect(territoryColors.toColorToken).toBe(toColorToken);
    expect(territoryColors.swatchClass).toBe(swatchClass);
  });
});
