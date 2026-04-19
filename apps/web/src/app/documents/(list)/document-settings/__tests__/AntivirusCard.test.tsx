/**
 * AntivirusCard Tests - PG-186
 *
 * NOTE: structural smoke coverage only — full RTL behavior tests for the
 * 3 antivirus switches are tracked as a follow-up (PG-186 audit
 * finding #5).
 */
import { describe, it, expect } from 'vitest';
import { AntivirusCard } from '../components/AntivirusCard';

describe('AntivirusCard — smoke', () => {
  it('exports a function component', () => {
    expect(typeof AntivirusCard).toBe('function');
  });
});
