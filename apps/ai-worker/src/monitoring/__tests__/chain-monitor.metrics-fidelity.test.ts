/**
 * Chain Monitor — Metrics Fidelity Tests
 *
 * @implements IFC-215: AI Monitoring Payload Fidelity
 *
 * Verifies that withMonitoring() populates real tokenCost, hallucinationFlags,
 * and modelName instead of hardcoded placeholder values (0, [], 'default').
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withMonitoring, type ChainMonitorConfig, type MonitoringContext } from '../chain-monitor';
import { DriftDetector } from '../drift-detector';
import { HallucinationChecker, type HallucinationResult } from '../hallucination-checker';
import { ROITracker } from '../roi-tracker';
import { LatencyMonitor } from '../latency-monitor';

// Use vi.hoisted so mock fns are available inside vi.mock factory
const { mockLoggerInfo, mockLoggerWarn, mockLoggerDebug, mockLoggerError } = vi.hoisted(() => ({
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockLoggerDebug: vi.fn(),
  mockLoggerError: vi.fn(),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
    debug: mockLoggerDebug,
    error: mockLoggerError,
  }),
}));

function makeConfig(): ChainMonitorConfig & {
  hallucinationChecker: HallucinationChecker;
  latencyMonitor: LatencyMonitor;
} {
  const driftDetector = new DriftDetector({
    windowSizeHours: 6,
    slidingIntervalMinutes: 30,
    pValueThreshold: 0.05,
    minSamplesRequired: 10,
    driftScoreThresholds: { low: 0.1, medium: 0.25, high: 0.5, critical: 0.75 },
  });

  const hallucinationChecker = new HallucinationChecker({
    maxHallucinationRate: 0.05,
    confidenceThreshold: 0.3,
    enableFactChecking: true,
    enableLogicChecking: true,
    enableEntityValidation: true,
    groundTruthSources: [],
  });

  const roiTracker = new ROITracker({
    valueEstimates: {
      lead_scored: 0.5,
      lead_qualified: 2.0,
      email_generated: 1.0,
      response_automated: 1.5,
      insight_generated: 3.0,
      document_processed: 0.75,
      task_automated: 2.5,
      prediction_made: 5.0,
      recommendation_made: 4.0,
      feedback_positive: 0.1,
      feedback_negative: -0.2,
      feedback_correction: 0.5,
    },
    costPerToken: { 'gpt-4': { input: 0.00003, output: 0.00006 } },
    minROITarget: 2.0,
    trackingPeriodDays: 30,
  });

  const latencyMonitor = new LatencyMonitor({
    sloTargets: { p95Ms: 2000, p99Ms: 5000 },
    alertThresholds: { p95MultiplierWarning: 1.5, p95MultiplierCritical: 2.0 },
    retentionHours: 24,
    samplingRate: 1.0,
  });

  return {
    driftDetector,
    hallucinationChecker,
    roiTracker,
    latencyMonitor,
    latencyThresholdMs: 2000,
  };
}

describe('withMonitoring — metrics fidelity (IFC-215)', () => {
  let config: ReturnType<typeof makeConfig>;

  beforeEach(() => {
    config = makeConfig();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // T-01: tokenCost populated from getUsage()
  it('T-01: tokenCost > 0 when getUsage returns real token counts', async () => {
    const context: MonitoringContext = {
      modelName: 'scoring-free',
      getUsage: () => ({ inputTokens: 100, outputTokens: 50, model: 'scoring-free' }),
    };

    const result = await withMonitoring(
      async () => ({ score: 80, confidence: 0.9 }),
      config,
      context
    );

    expect(result.metrics.tokenCost).toBeGreaterThan(0);
  });

  // T-02: hallucinationFlags populated when checker detects an issue
  it('T-02: hallucinationFlags non-empty when extractText + inputContext provided and checker flags issue', async () => {
    const fakeResult: HallucinationResult = {
      id: 'test-op',
      timestamp: new Date(),
      model: 'scoring-free',
      inputContext: 'Lead from acme.com, enterprise sector',
      output: 'The company XYZ-9999-FAKE was founded in 1234 and has 999 trillion employees.',
      hallucinated: true,
      confidence: 0.8,
      hallucinationTypes: ['fabricated_entity'],
      evidence: ['XYZ-9999-FAKE does not appear in known entity database'],
      groundTruthSources: [],
      score: 0.7,
    };

    vi.spyOn(config.hallucinationChecker, 'checkOutput').mockResolvedValue(fakeResult);

    const context: MonitoringContext = {
      modelName: 'scoring-free',
      inputContext: 'Lead from acme.com, enterprise sector', // required: prevents false-positive context_drift
      extractText: () =>
        'The company XYZ-9999-FAKE was founded in 1234 and has 999 trillion employees.',
    };

    const result = await withMonitoring(
      async () => ({ score: 80, confidence: 0.9 }),
      config,
      context
    );

    expect(result.metrics.hallucinationFlags.length).toBeGreaterThan(0);
    expect(result.metrics.hallucinationFlags).toContain('fabricated_entity');
  });

  // T-03: no context → backward-compatible (no error, zeroed fields)
  it('T-03: no context provided → tokenCost === 0 and hallucinationFlags === [] without error', async () => {
    const result = await withMonitoring(async () => ({ score: 75, confidence: 0.85 }), config);

    expect(result.metrics.tokenCost).toBe(0);
    expect(result.metrics.hallucinationFlags).toEqual([]);
    expect(result.result).toEqual({ score: 75, confidence: 0.85 });
  });

  // T-04: getUsage returns null → tokenCost stays 0
  it('T-04: getUsage() returns null → tokenCost === 0, no error', async () => {
    const context: MonitoringContext = {
      modelName: 'scoring-free',
      getUsage: () => null,
    };

    const result = await withMonitoring(async () => ({ data: 'result' }), config, context);

    expect(result.metrics.tokenCost).toBe(0);
  });

  // T-05: extractText returns string <10 chars → checkOutput NOT called
  it('T-05: extractText returns short string → hallucinationChecker.checkOutput NOT called', async () => {
    const checkSpy = vi.spyOn(config.hallucinationChecker, 'checkOutput');

    const context: MonitoringContext = {
      modelName: 'scoring-free',
      inputContext: 'Lead enterprise context long enough to be non-empty',
      extractText: () => 'short', // <10 chars → skipped
    };

    await withMonitoring(async () => ({ score: 50 }), config, context);

    expect(checkSpy).not.toHaveBeenCalled();
  });

  // T-05b: extractText returns null → checkOutput NOT called
  it('T-05b: extractText returns null → hallucinationChecker.checkOutput NOT called', async () => {
    const checkSpy = vi.spyOn(config.hallucinationChecker, 'checkOutput');

    const context: MonitoringContext = {
      modelName: 'scoring-free',
      inputContext: 'Lead enterprise context long enough to be non-empty',
      extractText: () => null, // null → skipped
    };

    await withMonitoring(async () => ({ score: 50 }), config, context);

    expect(checkSpy).not.toHaveBeenCalled();
  });

  // T-06: modelName propagates to latencyMonitor.completeOperation
  it('T-06: modelName propagates — latencyMonitor.completeOperation called with model != "default"', async () => {
    const completeOpSpy = vi.spyOn(config.latencyMonitor, 'completeOperation');

    const context: MonitoringContext = {
      modelName: 'scoring-free',
    };

    await withMonitoring(async () => ({ score: 60 }), config, context);

    expect(completeOpSpy).toHaveBeenCalled();
    const callArgs = completeOpSpy.mock.calls[0];
    expect(callArgs).toBeDefined();
    if (callArgs) {
      expect(callArgs[1].model).toBe('scoring-free');
      expect(callArgs[1].model).not.toBe('default');
    }
  });

  // T-07: fn() throws → checkOutput NOT called; error re-thrown
  it('T-07: fn() throws → hallucinationChecker.checkOutput NOT called and error re-thrown', async () => {
    const checkSpy = vi.spyOn(config.hallucinationChecker, 'checkOutput');

    const context: MonitoringContext = {
      modelName: 'scoring-free',
      inputContext: 'Lead enterprise context non-empty to isolate the fn-throws path',
      extractText: () => 'this would trigger the checker if reached',
    };

    await expect(
      withMonitoring(
        async () => {
          throw new Error('chain failed');
        },
        config,
        context
      )
    ).rejects.toThrow('chain failed');

    expect(checkSpy).not.toHaveBeenCalled();
  });

  // T-08: raw text from extractText NOT in any logger call (PII safety)
  it('T-08: raw extractText output is never passed to logger (PII safety)', async () => {
    const sensitiveText =
      'SENSITIVE-PII-DATA: user@example.com John Doe SSN:123-45-6789 with enough chars';

    const context: MonitoringContext = {
      modelName: 'scoring-free',
      inputContext: 'enterprise lead context: company acme, sector tech',
      extractText: () => sensitiveText,
    };

    await withMonitoring(async () => ({ score: 70 }), config, context);

    // Collect all logger call arguments
    const allLogCalls = [
      ...mockLoggerInfo.mock.calls,
      ...mockLoggerWarn.mock.calls,
      ...mockLoggerDebug.mock.calls,
      ...mockLoggerError.mock.calls,
    ];

    const loggedAsString = JSON.stringify(allLogCalls);
    expect(loggedAsString).not.toContain(sensitiveText);
    expect(loggedAsString).not.toContain('SENSITIVE-PII-DATA');
  });

  // T-09: no inputContext → checkOutput NOT called (prevents false context_drift flags)
  it('T-09: no inputContext → hallucinationChecker.checkOutput NOT called even with extractText', async () => {
    const checkSpy = vi.spyOn(config.hallucinationChecker, 'checkOutput');

    const context: MonitoringContext = {
      modelName: 'scoring-free',
      // intentionally no inputContext
      extractText: () => 'Long enough output text that would otherwise trigger checking.',
    };

    await withMonitoring(async () => ({ score: 70 }), config, context);

    expect(checkSpy).not.toHaveBeenCalled();
  });

  // Bonus: hallucinationChecker error → falls back gracefully, does not rethrow
  it('hallucinationChecker.checkOutput throwing → falls back to [] and does not rethrow', async () => {
    vi.spyOn(config.hallucinationChecker, 'checkOutput').mockRejectedValue(
      new Error('checker internal error')
    );

    const context: MonitoringContext = {
      modelName: 'scoring-free',
      inputContext: 'enterprise lead context: company acme, sector tech — non-empty',
      extractText: () => 'Long enough output text to trigger the hallucination check path.',
    };

    const result = await withMonitoring(async () => ({ score: 70 }), config, context);

    // Must not throw; falls back to empty flags
    expect(result.metrics.hallucinationFlags).toEqual([]);
    // Warn logger must have been called
    expect(mockLoggerWarn).toHaveBeenCalled();
  });
});
