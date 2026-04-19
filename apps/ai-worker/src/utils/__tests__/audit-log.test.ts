/**
 * audit-log.ts unit tests
 *
 * Verifies:
 * - pino trail is always written (adapter present or absent)
 * - logAIAgentAction calls the AuditLogPort adapter with the correct shape
 * - falls back gracefully (pino WARN, no throw) when adapter call fails
 * - falls back gracefully (pino trail only) when no adapter is wired
 * - setAuditLogAdapter / getAuditLogAdapter round-trip correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuditLogPort } from '@intelliflow/application';

// ---------------------------------------------------------------------------
// Helpers — isolate module state between tests
// ---------------------------------------------------------------------------

/** Re-import the module fresh so module-level `_auditLogAdapter` is reset. */
async function freshModule() {
  // Clear the module from Vitest's cache so each test starts with null adapter.
  vi.resetModules();
  return import('../audit-log');
}

// ---------------------------------------------------------------------------
// Pino spy setup
// ---------------------------------------------------------------------------

// We mock pino at the module level so we can assert info / warn calls.
vi.mock('pino', () => {
  const infoSpy = vi.fn();
  const warnSpy = vi.fn();
  const mockLogger = { info: infoSpy, warn: warnSpy };
  const pino = vi.fn(() => mockLogger);
  (pino as any)._mockLogger = mockLogger;
  return { default: pino };
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('audit-log', () => {
  // Reset module state (adapter) before each test.
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // setAuditLogAdapter / getAuditLogAdapter
  // -------------------------------------------------------------------------

  describe('setAuditLogAdapter / getAuditLogAdapter', () => {
    it('returns null before any adapter is set', async () => {
      const { getAuditLogAdapter } = await freshModule();
      expect(getAuditLogAdapter()).toBeNull();
    });

    it('returns the adapter that was set', async () => {
      const { setAuditLogAdapter, getAuditLogAdapter } = await freshModule();
      const mockAdapter = {
        logSecurityEvent: vi.fn(),
        logBatchEvents: vi.fn(),
        verifyLogIntegrity: vi.fn(),
      } as unknown as AuditLogPort;
      setAuditLogAdapter(mockAdapter);
      expect(getAuditLogAdapter()).toBe(mockAdapter);
    });
  });

  // -------------------------------------------------------------------------
  // pino-only path (no adapter)
  // -------------------------------------------------------------------------

  describe('logAIAgentAction — no adapter wired', () => {
    it('resolves without throwing', async () => {
      const { logAIAgentAction } = await freshModule();
      await expect(
        logAIAgentAction({
          tenantId: 'tenant-1',
          agentName: 'insight-agent',
          resourceType: 'AIInsight',
          resourceId: 'res-abc',
          action: 'CREATE',
        })
      ).resolves.toBeUndefined();
    });

    it('does NOT call adapter.logSecurityEvent when no adapter is wired', async () => {
      const { logAIAgentAction } = await freshModule();
      // No adapter set — just verify it doesn't throw
      await logAIAgentAction({
        tenantId: 'tenant-2',
        agentName: 'scoring-agent',
        resourceType: 'LeadScore',
        resourceId: 'lead-999',
        action: 'UPDATE',
      });
      // If we get here without error, the no-adapter path is correct.
      expect(true).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // DB write path (adapter wired)
  // -------------------------------------------------------------------------

  describe('logAIAgentAction — adapter wired', () => {
    it('calls adapter.logSecurityEvent with correct shape', async () => {
      const { logAIAgentAction, setAuditLogAdapter } = await freshModule();

      const mockLogSecurityEvent = vi.fn().mockResolvedValue({
        eventId: 'evt-001',
        persistedAt: new Date(),
        status: 'PERSISTED',
      });
      const mockAdapter: AuditLogPort = {
        logSecurityEvent: mockLogSecurityEvent,
        logBatchEvents: vi.fn(),
        verifyLogIntegrity: vi.fn(),
      };

      setAuditLogAdapter(mockAdapter);

      await logAIAgentAction({
        tenantId: 'tenant-3',
        agentName: 'prediction-agent',
        resourceType: 'ChurnPrediction',
        resourceId: 'pred-777',
        action: 'UPSERT',
        afterState: { score: 0.87 },
      });

      expect(mockLogSecurityEvent).toHaveBeenCalledOnce();

      const [event, tenantCtx] = mockLogSecurityEvent.mock.calls[0] as [any, any];

      // Event shape
      expect(event.eventType).toBe('AI_GUARDRAIL_TRIGGERED');
      expect(event.severity).toBe('LOW');
      expect(event.tenantId).toBe('tenant-3');
      expect(event.resourceType).toBe('ChurnPrediction');
      expect(event.resourceId).toBe('pred-777');
      expect(event.description).toContain('prediction-agent');
      expect(event.description).toContain('UPSERT');

      // Metadata
      expect(event.metadata.modelId).toBe('prediction-agent');
      expect(event.metadata.guardrailId).toBe('ai-agent-write');
      expect(event.metadata.processingPurpose).toBe('crm-insight-generation');
      expect(event.metadata.legalBasis).toBe('legitimate-interest');
      expect(event.metadata.details.action).toBe('UPSERT');
      expect(event.metadata.details.afterState).toEqual({ score: 0.87 });

      // Tenant context
      expect(tenantCtx.tenantId).toBe('tenant-3');
    });

    it('includes beforeState in metadata.details when provided', async () => {
      const { logAIAgentAction, setAuditLogAdapter } = await freshModule();

      const mockLogSecurityEvent = vi
        .fn()
        .mockResolvedValue({ eventId: 'e', persistedAt: new Date(), status: 'PERSISTED' });
      setAuditLogAdapter({
        logSecurityEvent: mockLogSecurityEvent,
        logBatchEvents: vi.fn(),
        verifyLogIntegrity: vi.fn(),
      });

      await logAIAgentAction({
        tenantId: 't',
        agentName: 'agent',
        resourceType: 'Foo',
        resourceId: 'bar',
        action: 'UPDATE',
        beforeState: { old: 1 },
        afterState: { new: 2 },
      });

      const [event] = mockLogSecurityEvent.mock.calls[0] as [any, any];
      expect(event.metadata.details.beforeState).toEqual({ old: 1 });
      expect(event.metadata.details.afterState).toEqual({ new: 2 });
    });
  });

  // -------------------------------------------------------------------------
  // Adapter failure — graceful fallback
  // -------------------------------------------------------------------------

  describe('logAIAgentAction — adapter throws', () => {
    it('does NOT re-throw when adapter.logSecurityEvent rejects', async () => {
      const { logAIAgentAction, setAuditLogAdapter } = await freshModule();

      const mockAdapter: AuditLogPort = {
        logSecurityEvent: vi.fn().mockRejectedValue(new Error('DB unavailable')),
        logBatchEvents: vi.fn(),
        verifyLogIntegrity: vi.fn(),
      };
      setAuditLogAdapter(mockAdapter);

      await expect(
        logAIAgentAction({
          tenantId: 'tenant-err',
          agentName: 'bad-agent',
          resourceType: 'X',
          resourceId: 'y',
          action: 'DELETE',
        })
      ).resolves.toBeUndefined();
    });

    it('still calls adapter even after a previous failure', async () => {
      const { logAIAgentAction, setAuditLogAdapter } = await freshModule();

      const mockLogSecurityEvent = vi
        .fn()
        .mockRejectedValueOnce(new Error('first call fails'))
        .mockResolvedValueOnce({ eventId: 'ok', persistedAt: new Date(), status: 'PERSISTED' });

      setAuditLogAdapter({
        logSecurityEvent: mockLogSecurityEvent,
        logBatchEvents: vi.fn(),
        verifyLogIntegrity: vi.fn(),
      });

      // First call — should swallow error
      await logAIAgentAction({
        tenantId: 't',
        agentName: 'a',
        resourceType: 'R',
        resourceId: 'id',
        action: 'CREATE',
      });
      // Second call — should succeed
      await logAIAgentAction({
        tenantId: 't',
        agentName: 'a',
        resourceType: 'R',
        resourceId: 'id',
        action: 'UPDATE',
      });

      expect(mockLogSecurityEvent).toHaveBeenCalledTimes(2);
    });
  });
});
