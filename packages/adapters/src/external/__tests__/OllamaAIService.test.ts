import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaAIService, type OllamaAIServiceConfig } from '../OllamaAIService';

// Mock ChatOllama
const mockInvoke = vi.fn();

vi.mock('@langchain/ollama', () => ({
  ChatOllama: class MockChatOllama {
    constructor() {
      // constructor args are ignored in mock
    }
    invoke = mockInvoke;
  },
}));

const defaultConfig: OllamaAIServiceConfig = {
  baseUrl: 'http://localhost:11434',
  model: 'mistral',
  temperature: 0.1,
  timeout: 60_000,
};

const sampleInput = {
  email: 'ceo@acme.com',
  firstName: 'Jane',
  lastName: 'Doe',
  company: 'Acme Corp',
  title: 'CEO',
  phone: '+1-555-0100',
  source: 'website',
};

describe('OllamaAIService', () => {
  let service: OllamaAIService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OllamaAIService(defaultConfig);
  });

  describe('constructor', () => {
    it('should set modelVersion from config model name', () => {
      expect(service.modelVersion).toBe('ollama:mistral:v1');
    });

    it('should include custom model in modelVersion', () => {
      const custom = new OllamaAIService({ ...defaultConfig, model: 'llama3' });
      expect(custom.modelVersion).toBe('ollama:llama3:v1');
    });
  });

  describe('scoreLead', () => {
    it('should return parsed score on success', async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          score: 85,
          confidence: 0.9,
          reasoning: 'C-level at established company',
          factors: {
            companySize: 0.8,
            titleRelevance: 0.95,
            emailQuality: 0.9,
            sourceCredibility: 0.7,
          },
        }),
      });

      const result = await service.scoreLead(sampleInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBe(85);
      expect(result.value.confidence).toBe(0.9);
      expect(result.value.modelVersion).toBe('ollama:mistral:v1');
      expect(result.value.reasoning).toBe('C-level at established company');
      expect(result.value.factors?.titleRelevance).toBe(0.95);
    });

    it('should parse JSON from markdown code blocks', async () => {
      mockInvoke.mockResolvedValue({
        content:
          '```json\n{"score": 72, "confidence": 0.8, "reasoning": "Manager", "factors": {"companySize": 0.6, "titleRelevance": 0.7, "emailQuality": 0.8, "sourceCredibility": 0.5}}\n```',
      });

      const result = await service.scoreLead(sampleInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBe(72);
      expect(result.value.confidence).toBe(0.8);
    });

    it('should clamp score to 0-100 range', async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          score: 150,
          confidence: 1.5,
          reasoning: 'Over range',
          factors: {},
        }),
      });

      const result = await service.scoreLead(sampleInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBe(100);
      expect(result.value.confidence).toBe(1);
    });

    it('should clamp negative score to 0', async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          score: -10,
          confidence: -0.5,
          reasoning: 'Under range',
          factors: {},
        }),
      });

      const result = await service.scoreLead(sampleInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value.score).toBe(0);
      expect(result.value.confidence).toBe(0);
    });

    it('should return error on timeout', async () => {
      mockInvoke.mockRejectedValue(new Error('The operation was aborted due to timeout'));

      const result = await service.scoreLead(sampleInput);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('OLLAMA_SERVICE_ERROR');
      expect(result.error.message).toContain('timeout');
    });

    it('should return error on invalid JSON response', async () => {
      mockInvoke.mockResolvedValue({
        content: 'This is not JSON at all',
      });

      const result = await service.scoreLead(sampleInput);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('OLLAMA_SERVICE_ERROR');
    });
  });

  describe('qualifyLead', () => {
    it('should return true for score >= 70', async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          score: 85,
          confidence: 0.9,
          reasoning: 'Qualified',
          factors: {},
        }),
      });

      const result = await service.qualifyLead(sampleInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(true);
    });

    it('should return false for score < 70', async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          score: 45,
          confidence: 0.6,
          reasoning: 'Not qualified',
          factors: {},
        }),
      });

      const result = await service.qualifyLead(sampleInput);

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe(false);
    });

    it('should propagate errors from scoreLead', async () => {
      mockInvoke.mockRejectedValue(new Error('Connection refused'));

      const result = await service.qualifyLead(sampleInput);

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('OLLAMA_SERVICE_ERROR');
    });
  });

  describe('generateEmail', () => {
    it('should return email body on success', async () => {
      mockInvoke.mockResolvedValue({
        content: JSON.stringify({
          subject: 'Partnership Opportunity',
          body: 'Dear Jane, I would like to discuss...',
        }),
      });

      const result = await service.generateEmail('lead-123', 'cold-outreach');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBe('Dear Jane, I would like to discuss...');
    });

    it('should fall back to raw content if body field is missing', async () => {
      const rawContent = JSON.stringify({ subject: 'Test' });
      mockInvoke.mockResolvedValue({ content: rawContent });

      const result = await service.generateEmail('lead-123', 'follow-up');

      expect(result.isSuccess).toBe(true);
      // Falls back to raw content when body is missing
      expect(result.value).toBe(rawContent);
    });

    it('should return error on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Model not found'));

      const result = await service.generateEmail('lead-123', 'template');

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('OLLAMA_SERVICE_ERROR');
      expect(result.error.message).toContain('Model not found');
    });
  });
});
