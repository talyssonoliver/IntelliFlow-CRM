/**
 * MonitoringFlushService — Periodically drains in-memory monitoring singletons to DB (IFC-297)
 */
import type { PrismaClient } from '@intelliflow/db';
import pino from 'pino';
import { driftDetector } from './drift-detector';
import { latencyMonitor } from './latency-monitor';
import { hallucinationChecker } from './hallucination-checker';
import { roiTracker } from './roi-tracker';
import { AIMonitoringPayloadSchema } from './ai-monitoring-payload.schema';

const logger = pino({ name: 'monitoring-flush', level: process.env.LOG_LEVEL || 'info' });

export class MonitoringFlushService {
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private lastFlushedAt: Record<string, Date> = {
    drift: new Date(0),
    latency: new Date(0),
    hallucination: new Date(0),
    roi: new Date(0),
  };

  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Start periodic flushing (default 60s)
   */
  start(intervalMs: number = 60_000): void {
    this.flushInterval = setInterval(() => {
      this.flushNow().catch((err) => {
        console.error('[MonitoringFlush] Periodic flush failed:', err);
      });
    }, intervalMs);

    // Run retention cleanup once on start, then every 24h
    this.cleanupOldEvents().catch(() => {});
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupOldEvents().catch(() => {});
      },
      24 * 60 * 60 * 1000
    );
  }

  /**
   * Stop periodic flushing and drain remaining data
   */
  async stop(): Promise<void> {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    // Final drain
    await this.flushNow();
  }

  /**
   * Flush all singleton data to DB — testable entry point
   */
  async flushNow(): Promise<void> {
    const events: Array<{
      eventType: string;
      model: string | null;
      metric: string | null;
      value: number | null;
      flagged: boolean | null;
      severity: string | null;
      payload: unknown;
      tenantId: string | null;
      recordedAt: Date;
    }> = [];

    // Drift events
    const driftHistory = driftDetector.getHistory();
    for (const dr of driftHistory) {
      if (dr.timestamp > this.lastFlushedAt.drift) {
        events.push({
          eventType: 'drift',
          model: dr.metric ?? null,
          metric: dr.metric ?? null,
          value: dr.driftScore ?? null,
          flagged: dr.detected,
          severity: dr.severity ?? 'none',
          payload: {
            pValue: dr.pValue,
            baselineWindow: dr.baselineWindow,
            currentWindow: dr.currentWindow,
            recommendations: dr.recommendations,
          },
          tenantId: null,
          recordedAt: dr.timestamp,
        });
      }
    }

    // Latency events
    const latencyMeasurements = latencyMonitor.getMeasurementsSince(this.lastFlushedAt.latency);
    for (const lm of latencyMeasurements) {
      events.push({
        eventType: 'latency',
        model: lm.model,
        metric: lm.operationType,
        value: lm.durationMs,
        flagged: !lm.success,
        severity: null,
        payload: {
          operationType: lm.operationType,
          phase: lm.phase,
          errorType: lm.errorType,
          metadata: lm.metadata,
        },
        tenantId: (lm as any).tenantId ?? null,
        recordedAt: lm.timestamp,
      });
    }

    // Hallucination events
    const hallucinationResults = hallucinationChecker.getRecentResults(1000);
    for (const hr of hallucinationResults) {
      if (hr.timestamp > this.lastFlushedAt.hallucination) {
        events.push({
          eventType: 'hallucination',
          model: hr.model,
          metric: null,
          value: hr.score,
          flagged: hr.hallucinated,
          severity: hr.hallucinated ? 'high' : 'none',
          payload: {
            inputContextHash: hr.inputContext?.substring(0, 64),
            hallucinationTypes: hr.hallucinationTypes,
            evidence: hr.evidence,
            groundTruthSources: hr.groundTruthSources,
            confidence: hr.confidence,
          },
          tenantId: (hr as any).tenantId ?? null,
          recordedAt: hr.timestamp,
        });
      }
    }

    // ROI cost events
    const costs = roiTracker.getCostsSince(this.lastFlushedAt.roi);
    for (const c of costs) {
      events.push({
        eventType: 'roi_cost',
        model: c.model,
        metric: c.operationType,
        value: c.cost,
        flagged: null,
        severity: null,
        payload: {
          operationType: c.operationType,
          inputTokens: c.inputTokens,
          outputTokens: c.outputTokens,
          metadata: c.metadata,
        },
        tenantId: (c as any).tenantId ?? null,
        recordedAt: c.timestamp,
      });
    }

    // ROI value events
    const values = roiTracker.getValuesSince(this.lastFlushedAt.roi);
    for (const v of values) {
      events.push({
        eventType: 'roi_value',
        model: null,
        metric: v.valueType,
        value: v.estimatedValue,
        flagged: null,
        severity: null,
        payload: {
          valueType: v.valueType,
          relatedCostIds: v.relatedCostIds,
          confidence: v.confidence,
          metadata: v.metadata,
        },
        tenantId: (v as any).tenantId ?? null,
        recordedAt: v.timestamp,
      });
    }

    if (events.length === 0) return;

    // Validate payload shape for each event; skip malformed ones rather than
    // crashing the entire flush (M10 — ADR-048 payload validation at write time).
    const validEvents = events.filter((event) => {
      if (event.payload === null || event.payload === undefined) return true;
      const result = AIMonitoringPayloadSchema.safeParse(event.payload);
      if (!result.success) {
        logger.warn(
          { eventType: event.eventType, issues: result.error.issues },
          '[MonitoringFlush] Skipping event with invalid payload'
        );
        return false;
      }
      return true;
    });

    if (validEvents.length === 0) return;

    try {
      await (this.prisma as any).aIMonitoringEvent.createMany({
        data: validEvents,
        skipDuplicates: true,
      });

      // Update high-water marks
      const now = new Date();
      this.lastFlushedAt.drift = now;
      this.lastFlushedAt.latency = now;
      this.lastFlushedAt.hallucination = now;
      this.lastFlushedAt.roi = now;
    } catch (err) {
      // Don't advance high-water marks — buffer is retained for next flush
      console.error('[MonitoringFlush] DB write failed, retaining buffer:', err);
    }
  }

  /**
   * Delete events older than retention period
   */
  async cleanupOldEvents(retentionDays: number = 30): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    try {
      const result = await (this.prisma as any).aIMonitoringEvent.deleteMany({
        where: { recordedAt: { lt: cutoff } },
      });
      return result.count;
    } catch (err) {
      console.error('[MonitoringFlush] Cleanup failed:', err);
      return 0;
    }
  }
}
