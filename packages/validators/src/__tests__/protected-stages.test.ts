/**
 * Protected Stage Validation Tests
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Tests for protected stages (CLOSED_WON, CLOSED_LOST) that cannot be deactivated.
 * These are terminal stages in the sales pipeline that must always remain active.
 */

import { describe, it, expect } from 'vitest';
import {
  PROTECTED_STAGES,
  validateStageDeactivation,
} from '../opportunity';

describe('Protected Stage Validation', () => {
  describe('PROTECTED_STAGES constant', () => {
    it('should define PROTECTED_STAGES constant with CLOSED_WON and CLOSED_LOST', () => {
      expect(PROTECTED_STAGES).toBeDefined();
      expect(PROTECTED_STAGES).toContain('CLOSED_WON');
      expect(PROTECTED_STAGES).toContain('CLOSED_LOST');
      expect(PROTECTED_STAGES).toHaveLength(2);
    });
  });

  describe('validateStageDeactivation', () => {
    it('should throw when deactivating CLOSED_WON', () => {
      expect(() => validateStageDeactivation('CLOSED_WON', false)).toThrow(
        'Cannot deactivate terminal stage: CLOSED_WON'
      );
    });

    it('should throw when deactivating CLOSED_LOST', () => {
      expect(() => validateStageDeactivation('CLOSED_LOST', false)).toThrow(
        'Cannot deactivate terminal stage: CLOSED_LOST'
      );
    });

    it('should allow deactivating non-protected stages', () => {
      // Should not throw for non-protected stages
      expect(() => validateStageDeactivation('PROSPECTING', false)).not.toThrow();
      expect(() => validateStageDeactivation('QUALIFICATION', false)).not.toThrow();
      expect(() => validateStageDeactivation('PROPOSAL', false)).not.toThrow();
      expect(() => validateStageDeactivation('NEGOTIATION', false)).not.toThrow();
    });

    it('should allow activating protected stages', () => {
      // Activating (isActive: true) should always be allowed
      expect(() => validateStageDeactivation('CLOSED_WON', true)).not.toThrow();
      expect(() => validateStageDeactivation('CLOSED_LOST', true)).not.toThrow();
    });
  });
});
