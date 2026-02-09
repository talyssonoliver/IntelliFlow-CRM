import { describe, it, expect, vi, beforeEach } from "vitest";
import { Result } from "@intelliflow/domain";
import type { AIServicePort, LeadScoringInput, LeadScoringResult } from "@intelliflow/application";
import type { AuditLogPort, AuditLogResult } from "@intelliflow/application";
import { GuardrailsAIService, type GuardrailsConfig } from "../GuardrailsAIService";

const mockSanitizationPipeline = vi.fn();
const mockDetectScoreBias = vi.fn();

vi.mock("../../shared/prompt-sanitizer.js", () => ({
  sanitizationPipeline: (...args: any[]) => mockSanitizationPipeline(...args),
  resetRateLimit: () => {},
  checkRateLimit: () => true,
}));

vi.mock("../../shared/bias-detector.js", () => ({
  detectScoreBias: (...args: any[]) => mockDetectScoreBias(...args),
}));

function createMockAIService(): AIServicePort {
  return {
    scoreLead: vi.fn(),
    qualifyLead: vi.fn(),
    generateEmail: vi.fn(),
  };
}

function createMockAuditLogPort(): AuditLogPort {
  return {
    logSecurityEvent: vi.fn(),
    logBatchEvents: vi.fn(),
    verifyLogIntegrity: vi.fn(),
  };
}

const defaultConfig: GuardrailsConfig = {
  userId: "550e8400-e29b-41d4-a716-446655440000",
  tenantId: "550e8400-e29b-41d4-a716-446655440001",
  jurisdiction: "EU", enableBiasDetection: false,
  rateLimit: 100, enableLogging: true,
};

const input: LeadScoringInput = {
  email: "test@example.com", firstName: "John", lastName: "Doe",
  company: "Acme", title: "CTO", phone: "+447123456789", source: "website",
};

describe("GuardrailsAIService additional", () => {
  let mockAI: AIServicePort;
  let mockAudit: AuditLogPort;
  let service: GuardrailsAIService;

  beforeEach(() => {
    mockAI = createMockAIService();
    mockAudit = createMockAuditLogPort();

    mockSanitizationPipeline.mockResolvedValue({ text: "safe", safe: true });
    mockDetectScoreBias.mockReturnValue({ biasDetected: false, violations: [] });
    (mockAI.scoreLead as any).mockResolvedValue(Result.ok({ score: 75, confidence: 0.85, modelVersion: "v1", reasoning: "good" } as LeadScoringResult));
    (mockAI.qualifyLead as any).mockResolvedValue(Result.ok(true));
    (mockAI.generateEmail as any).mockResolvedValue(Result.ok("Hello World"));
    (mockAudit.logSecurityEvent as any).mockResolvedValue({ eventId: "e1", persistedAt: new Date(), status: "PERSISTED", integrityHash: "h" } as AuditLogResult);

    service = new GuardrailsAIService(mockAI, mockAudit, defaultConfig);
  });

  describe("qualifyLead", () => {
    it("returns qualification result", async () => {
      const r = await service.qualifyLead(input);
      expect(r.isSuccess).toBe(true);
      expect(r.value).toBe(true);
    });

    it("handles error gracefully", async () => {
      (mockAI.qualifyLead as any).mockRejectedValue(new Error("fail"));
      const r = await service.qualifyLead(input);
      expect(r.isFailure).toBe(true);
    });
  });

  describe("generateEmail", () => {
    it("returns generated email", async () => {
      const r = await service.generateEmail("lead-1", "Welcome template");
      expect(r.isSuccess).toBe(true);
    });

    it("handles inner service failure", async () => {
      (mockAI.generateEmail as any).mockResolvedValue(Result.fail({ message: "fail", code: "ERR" }));
      const r = await service.generateEmail("lead-1", "template");
      expect(r.isFailure).toBe(true);
    });

    it("handles error gracefully", async () => {
      (mockAI.generateEmail as any).mockRejectedValue(new Error("fail"));
      const r = await service.generateEmail("lead-1", "template");
      expect(r.isFailure).toBe(true);
    });
  });

  describe("scoreLead with bias detection", () => {
    it("collects bias metrics when enabled", async () => {
      const biasService = new GuardrailsAIService(mockAI, mockAudit, { ...defaultConfig, enableBiasDetection: true });
      (mockAI.scoreLead as any).mockResolvedValue(Result.ok({ score: 80, confidence: 0.9, modelVersion: "v1" } as LeadScoringResult));
      await biasService.scoreLead(input);
    });

    it("handles inner service failure", async () => {
      (mockAI.scoreLead as any).mockResolvedValue(Result.fail({ message: "fail", code: "ERR" }));
      const r = await service.scoreLead(input);
      expect(r.isFailure).toBe(true);
    });
  });

  describe("analyzeBiasMetrics", () => {
    it("returns empty when disabled", async () => {
      const r = await service.analyzeBiasMetrics();
      expect(r.totalScored).toBe(0);
      expect(r.biasDetected).toBe(false);
    });

    it("analyzes when buffer has data", async () => {
      const biasService = new GuardrailsAIService(mockAI, mockAudit, { ...defaultConfig, enableBiasDetection: true });
      (mockAI.scoreLead as any).mockResolvedValue(Result.ok({ score: 80, confidence: 0.9, modelVersion: "v1" } as LeadScoringResult));
      await biasService.scoreLead(input);
      const r = await biasService.analyzeBiasMetrics();
      expect(r.totalScored).toBe(1);
    });

    it("logs when bias detected", async () => {
      mockDetectScoreBias.mockReturnValue({ biasDetected: true, violations: [{ segment: "domain", severity: "high" }] });
      const biasService = new GuardrailsAIService(mockAI, mockAudit, { ...defaultConfig, enableBiasDetection: true });
      (mockAI.scoreLead as any).mockResolvedValue(Result.ok({ score: 80, confidence: 0.9, modelVersion: "v1" } as LeadScoringResult));
      await biasService.scoreLead(input);
      const r = await biasService.analyzeBiasMetrics();
      expect(r.biasDetected).toBe(true);
      expect(r.violations).toHaveLength(1);
    });
  });

  describe("PII sanitization", () => {
    it("redacts email from reasoning", async () => {
      (mockAI.scoreLead as any).mockResolvedValue(Result.ok({ score: 80, confidence: 0.9, modelVersion: "v1", reasoning: "User john@example.com scored high" } as LeadScoringResult));
      const r = await service.scoreLead(input);
      expect(r.isSuccess).toBe(true);
      expect(r.value?.reasoning).not.toContain("john@example.com");
    });
  });

  describe("logging disabled", () => {
    it("does not log when enableLogging is false", async () => {
      const noLogService = new GuardrailsAIService(mockAI, mockAudit, { ...defaultConfig, enableLogging: false });
      (mockAI.scoreLead as any).mockRejectedValue(new Error("fail"));
      await noLogService.scoreLead(input);
      expect(mockAudit.logSecurityEvent).not.toHaveBeenCalled();
    });
  });
});
