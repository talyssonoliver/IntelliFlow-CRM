import { describe, it, expect, beforeEach } from "vitest";
import { JobMetricsCollector, AggregateMetricsCollector, globalMetricsCollector } from "./metrics-collector";

describe("JobMetricsCollector additional", () => {
  let c: JobMetricsCollector;
  beforeEach(() => { c = new JobMetricsCollector("test-q", 60000, 100); });

  describe("recordEvent edge cases", () => {
    it("stalled records error", () => {
      c.recordEvent({ jobId: "1", queueName: "q", eventType: "stalled", timestamp: new Date().toISOString() });
      expect(c.getErrorBreakdown()["stalled"]).toBe(1);
    });
    it("failed without error string", () => {
      c.recordEvent({ jobId: "1", queueName: "q", eventType: "failed", timestamp: new Date().toISOString() });
      expect(c.getMetrics().counts.failed).toBe(1);
    });
    it("completed records duration", () => {
      c.recordEvent({ jobId: "1", queueName: "q", eventType: "completed", timestamp: new Date().toISOString(), duration: 250 });
      expect(c.getMetrics().latency.averageProcessTimeMs).toBe(250);
    });
    it("active decrements waiting", () => {
      c.recordEvent({ jobId: "1", queueName: "q", eventType: "added", timestamp: new Date().toISOString() });
      c.recordEvent({ jobId: "1", queueName: "q", eventType: "active", timestamp: new Date().toISOString() });
      expect(c.getMetrics().counts.waiting).toBe(0);
      expect(c.getMetrics().counts.active).toBe(1);
    });
    it("does not go negative", () => {
      c.recordEvent({ jobId: "1", queueName: "q", eventType: "completed", timestamp: new Date().toISOString() });
      expect(c.getMetrics().counts.active).toBe(0);
    });
  });

  describe("recordWaitTime", () => {
    it("records samples", () => {
      c.recordWaitTime(100); c.recordWaitTime(300);
      expect(c.getMetrics().latency.averageWaitTimeMs).toBe(200);
    });
  });

  describe("rates", () => {
    it("completedPerMinute", () => {
      for (let i = 0; i < 5; i++) c.recordEvent({ jobId: String(i), queueName: "q", eventType: "completed", timestamp: new Date().toISOString() });
      expect(c.getMetrics().processingRates.completedPerMinute).toBe(5);
    });
  });

  describe("percentile", () => {
    it("0 for empty", () => { expect(c.getMetrics().latency.p95ProcessTimeMs).toBe(0); });
    it("p95 correct", () => {
      for (let i = 1; i <= 100; i++) c.recordProcessTime(i * 10);
      expect(c.getMetrics().latency.p95ProcessTimeMs).toBeGreaterThanOrEqual(950);
    });
  });

  describe("error categorization", () => {
    it.each([
      ["Connection refused", "connection"], ["rate limit exceeded", "rate_limit"],
      ["401 Unauthorized", "auth"], ["404 not found", "not_found"],
      ["500 Internal server error", "server_error"], ["something unknown", "other"],
    ])("categorizes %s as %s", (msg, cat) => {
      c.recordError(msg); expect(c.getErrorBreakdown()[cat]).toBe(1);
    });
  });

  describe("pruning", () => {
    it("prunes old data", () => {
      return new Promise<void>((resolve) => {
        const sc = new JobMetricsCollector("s", 100, 1000);
        sc.recordEvent({ jobId: "1", queueName: "s", eventType: "completed", timestamp: new Date().toISOString() });
        setTimeout(() => { expect(sc.getMetrics().processingRates.completedPerMinute).toBe(0); resolve(); }, 150);
      });
    });
  });

  describe("maxSamples", () => {
    it("caps samples", () => {
      const sm = new JobMetricsCollector("sm", 60000, 5);
      for (let i = 0; i < 10; i++) sm.recordProcessTime(i * 100);
      expect(sm.getMetrics().latency.averageProcessTimeMs).toBeGreaterThan(0);
    });
  });

  it("includes queue name", () => { expect(c.getMetrics().queueName).toBe("test-q"); });
});

describe("AggregateMetricsCollector additional", () => {
  it("resetAll", () => {
    const a = new AggregateMetricsCollector();
    a.getCollector("q1").recordEvent({ jobId: "1", queueName: "q1", eventType: "completed", timestamp: new Date().toISOString() });
    a.resetAll();
    expect(a.getAllMetrics()["q1"].counts.completed).toBe(0);
  });
});

describe("globalMetricsCollector", () => {
  it("is AggregateMetricsCollector", () => {
    expect(globalMetricsCollector).toBeInstanceOf(AggregateMetricsCollector);
  });
});
