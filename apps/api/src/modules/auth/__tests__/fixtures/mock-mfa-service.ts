import { vi } from 'vitest';

/**
 * Shared mock factory for MFA service
 * PG-125: Consolidates duplicate mockMfaService definitions
 */
export function createMockMfaService() {
  return {
    isUserMfaEnabled: vi.fn(),
    getAvailableMfaMethods: vi.fn(),
    createChallenge: vi.fn(),
    getChallengeInfo: vi.fn(),
    verifyChallenge: vi.fn(),
    generateTotpSecret: vi.fn(),
    sendSmsOtp: vi.fn(),
    sendEmailOtp: vi.fn(),
    getUserMfaSettings: vi.fn(),
    verifyTotp: vi.fn(),
    verifyTotpTimingSafe: vi.fn(),
    saveUserMfaSettings: vi.fn(),
    generateBackupCodes: vi.fn(),
    hashBackupCodes: vi.fn(),
    clearAll: vi.fn(),
    cleanupExpiredChallenges: vi.fn(),
    getCurrentTotpCode: vi.fn(),
    verifyBackupCode: vi.fn(),
    generateOtpauthUrl: vi.fn(),
  };
}
