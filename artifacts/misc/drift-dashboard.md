# AI Model Drift Dashboard

**Task**: IFC-117 - Monitor AI models for drift, latency, hallucination and ROI
**Location**: Grafana Dashboard ID: `ai-drift-monitoring`
**URL**: http://localhost:3000/d/ai-drift-monitoring

---

## Dashboard Overview

The AI Drift Dashboard provides real-time monitoring of all AI/ML models in IntelliFlow CRM, tracking performance degradation, data drift, and business impact.

---

## Dashboard Panels

### Row 1: Model Health Summary

```
+---------------------------+---------------------------+---------------------------+
|   LEAD SCORING MODEL      |   EMAIL WRITER AGENT      |   FOLLOWUP AGENT          |
|   Status: HEALTHY         |   Status: HEALTHY         |   Status: HEALTHY         |
|   Accuracy: 94.2%         |   Accuracy: 91.8%         |   Accuracy: 89.4%         |
|   Drift Score: 0.03       |   Drift Score: 0.05       |   Drift Score: 0.04       |
|   Latency p95: 1.2s       |   Latency p95: 2.4s       |   Latency p95: 1.8s       |
+---------------------------+---------------------------+---------------------------+
```

### Row 2: Drift Detection Charts

```
+-----------------------------------------------+-----------------------------------------------+
|   DATA DRIFT OVER TIME                        |   CONCEPT DRIFT DETECTION                     |
|   ▲                                           |   ▲                                           |
|   │    ....                                   |   │         ....                              |
|   │ ...    ...                                |   │     ....    ...                           |
|   │.          ..                              |   │ ....           ...                        |
|   +──────────────────────► Time               |   +──────────────────────► Time               |
|   [Last 7 days] [Last 30 days] [Custom]       |   PSI Score: 0.08 (Threshold: 0.10)           |
+-----------------------------------------------+-----------------------------------------------+
```

### Row 3: Latency Metrics

```
+-----------------------------------------------+-----------------------------------------------+
|   INFERENCE LATENCY (p50/p95/p99)             |   THROUGHPUT (requests/sec)                   |
|   ▲                                           |   ▲                                           |
|   │ ━━━ p99: 3.2s                             |   │ ████████████████████ 45 req/s             |
|   │ ─── p95: 1.8s                             |   │ ████████████████ 36 req/s                 |
|   │ ··· p50: 0.9s                             |   │ ████████████ 28 req/s                     |
|   +──────────────────────► Time               |   +──────────────────────► Time               |
|   Target: p95 < 2s, p99 < 5s                  |   Current: 42 req/s | Peak: 128 req/s         |
+-----------------------------------------------+-----------------------------------------------+
```

### Row 4: Hallucination & Quality

```
+-----------------------------------------------+-----------------------------------------------+
|   HALLUCINATION RATE                          |   CONFIDENCE DISTRIBUTION                     |
|   ▲                                           |   ▲                                           |
|   │ 5%  ─────────────────── Threshold         |   │ ██████████████████ 0.8-1.0: 72%          |
|   │                                           |   │ ████████████ 0.6-0.8: 18%                 |
|   │ 2.3% ....   Current                       |   │ ████ 0.4-0.6: 7%                          |
|   │         ....                              |   │ ██ 0.0-0.4: 3%                            |
|   +──────────────────────► Time               |   +───────────────────────────► Confidence    |
|   Last 24h: 2.3% | SLA: <5%                   |   Avg Confidence: 0.84                        |
+-----------------------------------------------+-----------------------------------------------+
```

### Row 5: Human-in-the-Loop Metrics

```
+-----------------------------------------------+-----------------------------------------------+
|   HITL INTERVENTION RATE                      |   OVERRIDE REASONS                            |
|   ▲                                           |   ┌────────────────────────────────────────┐  |
|   │ ████████████████████████ 24%              |   │ Score too aggressive    ████████ 42%   │  |
|   │ ████████████████ 16%                      |   │ Missing context         ████ 23%       │  |
|   │ ████████ 8%                               |   │ Confidence too low      ███ 18%        │  |
|   │ ████ 4%                                   |   │ Incorrect entity        ██ 12%         │  |
|   +──────────────────────► Time               |   │ Other                   █ 5%           │  |
|   Target: <20% for automated decisions        |   └────────────────────────────────────────┘  |
+-----------------------------------------------+-----------------------------------------------+
```

### Row 6: Cost & ROI Tracking

```
+-----------------------------------------------+-----------------------------------------------+
|   AI API COSTS (Monthly)                      |   ROI METRICS                                 |
|   ▲                                           |   ┌────────────────────────────────────────┐  |
|   │     $450                                  |   │ Time Saved: 23.4 hrs/week               │  |
|   │   $380                                    |   │ Leads Processed: 1,247/day              │  |
|   │ $320                                      |   │ Accuracy Improvement: +18%              │  |
|   │                       Budget: $500        |   │ Cost per Lead: $0.12                    │  |
|   +──────────────────────► Month              |   │ ROI: 340%                               │  |
|   Current: $412 | Projected: $445             |   └────────────────────────────────────────┘  |
+-----------------------------------------------+-----------------------------------------------+
```

---

## Alert Rules (from alert-rules.yml)

| Alert Name | Condition | Severity |
|------------|-----------|----------|
| AIModelInferenceLatency | p95 > 5s for 10m | Warning |
| AIModelAccuracyDegraded | accuracy < 85% for 30m | Warning |
| HighAICosts | hourly cost > $100 for 15m | Warning |
| LLMRateLimitApproaching | usage > 80% of limit for 10m | Warning |

---

## Metrics Sources

- **Prometheus**: `ai_model_*`, `lead_scoring_*`, `llm_*` metrics
- **OpenTelemetry**: Traces from ai-worker service
- **Custom Exporter**: `/metrics` endpoint in ai-worker

---

## Dashboard Variables

| Variable | Type | Values |
|----------|------|--------|
| `model` | Multi-select | lead-scorer, email-writer, followup-agent |
| `timeRange` | Interval | Last 1h, 6h, 24h, 7d, 30d |
| `environment` | Single | development, staging, production |

---

## Access

- **View**: All authenticated users
- **Edit**: AI Team, SRE Team
- **Alerts**: routed to #ai-alerts Slack channel

---

## Related Resources

- [AI Metrics JSON](../metrics/ai-metrics.json)
- [Alert Rules](./alert-rules.yml)
- [Optimization Loop Config](./optimization-loop.yaml)
- [AI Worker Chains](../../apps/ai-worker/src/chains/)
