# Comprehensive Research Ledger: AI Infrastructure & BullMQ Audit
**Date:** 2026-04-16
**Task ID:** IFC-AUDIT-001
**Status:** Breathing
**Auditor:** Talysson Oliveira

---

## 1. Executive Summary
This audit provides a holistic view of the IntelliFlow AI processing and monitoring infrastructure. While the immediate symptom is "failed jobs" in the BullMQ dashboard, the investigation covered the entire pipeline—from job enqueuing and worker processing to tRPC router integration and DB-backed monitoring persistence.

**Core Discovery:** The system is suffering from an **Infrastructure-Performance Mismatch**. Local Ollama inference latency (p95: 219s) exceeds the BullMQ worker lock duration (180s). This causes jobs in the `ai-scoring` and `ai-prediction` queues to "stall" and fail, while the `ai-insights` queue remains healthy because it correctly implements lock extensions.

---

## 2. Exhaustive Audit Catalog (Files & Components Checked)

### 2.1 Queue & Infrastructure Layer
- **`packages/platform/src/queues/bull-board.ts`**: Audited the dashboard setup. Verified it serves the UI on port 3003 and correctly mounts adapters for `ai-scoring`, `ai-prediction`, and `ai-insights`.
- **`packages/platform/src/queues/queue-factory.ts`**: Identified the system-wide default `lockDuration` of **180,000ms (3 minutes)** and `stalledInterval` of **30,000ms**.
- **`packages/platform/src/queues/retry-strategy.ts`**: Validated the `conservative` strategy: exponential backoff, 5s initial delay, 5m max delay, and 0.2 jitter.
- **`packages/platform/src/queues/types.ts`**: Verified queue naming conventions and type-safe job definitions. Confirmed that AI queues use the `intelliflow:ai-` prefix.

### 2.2 Worker Processing Layer
- **`apps/ai-worker/src/ai-worker.ts`**: Audited the main class. Verified the `lockDuration` override (3m) and the `createAIWorker` factory. Found it listens for health checks on port 5000.
- **`apps/workers/shared/src/base-worker.ts`**: Audited `handleJob`. Found that it re-throws all unhandled errors to BullMQ, triggering the failure count, but has no logic to automatically detect and extend locks for long-running AI tasks.
- **`apps/workers/ingestion-worker/src/main.ts`**: **HEALTHY.** Verified that OCR and Embedding handlers catch internal errors and return a "failure result" object rather than throwing, which keeps the job in the "completed" state with a failure flag.
- **`apps/workers/notifications-worker/src/main.ts`**: **HEALTHY.** Validated the multi-channel delivery logic and circuit breaker integration.

### 2.3 AI Job Handlers (Logic Audit)
- **`ai-insights` (`insight-generation.job.ts`)**: **GOLD STANDARD.** 
    - Verified use of `job.extendLock(job.token!, 300_000)` to handle 5-minute LLM runs.
    - Verified `Promise.race` implementation for a 2-minute fallback to heuristic scoring.
- **`ai-scoring` (`scoring.job.ts`)**: **VULNERABLE.** 
    - Audited `processScoringJob`. Found it uses an internal `try-catch` but **lacks `extendLock`**. 
    - If Ollama hangs for >3m, BullMQ kills the worker despite the `try-catch`.
- **`ai-prediction` (`prediction.job.ts`)**: **VULNERABLE.** 
    - Audited `processPredictionJob`. Found it **re-throws errors** from the AI chain directly.
    - Verified strict `tenantId` and `userId` checks that throw if missing, causing immediate failure.

### 2.4 API & Monitoring Layer
- **`apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts`**: Audited all 7 endpoints. 
    - `getFailedJobs`: Confirmed it performs a **Live Redis Query** to fetch actual stalled/failed jobs.
- **`apps/api/src/services/AIMonitoringService.ts`**: Audited the DB query logic for aggregated metrics.
- **`apps/api/src/lib/load-bullmq.ts`**: Verified the dynamic loader pattern used to prevent Next.js bundle bloat.

---

## 3. Technical Evidence & Performance Analysis

### 3.1 The "180 vs 219" Latency Gap
- **Benchmark Source:** `artifacts/benchmarks/ollama-real-benchmark-report.json` (IFC-174).
- **Inference Latency:** p95 is **219,339ms (3.65 minutes)**.
- **Lock Duration:** Worker lock is **180,000ms (3.0 minutes)**.
- **Finding:** There is a **39-second gap** where BullMQ assumes the worker has crashed. Since `ai-scoring` and `ai-prediction` don't extend this lock, they are guaranteed to fail in p95 latency scenarios on developer hardware.

### 3.2 Data Flow & Monitoring Persistence (ADR-043)
- **Trace:** `ai-worker` singleton -> `AIMonitoringEvent` (DB) -> `AIMonitoringService` -> UI.
- **Lag:** Confirmed a **60-second flush interval**. Dashboard metrics (drift, ROI) will always be ~1 minute behind the actual job completion.
- **Live Exception:** The "Failed Jobs" dashboard component is **real-time** because it queries BullMQ directly, bypassing the 60s DB flush.

### 3.3 Historical Infrastructure Evidence
- **`stoa-review-queue.json`**: Historical failure verdicts (e.g., `RQ-1766308632169-236lx8`) show frequent "WARN" and "FAIL" results related to **gate timeouts** and **exit code 1** for worker processes, perfectly mirroring the current BullMQ stall symptoms.

---

## 4. Identified Technical Debt & Gaps

### 4.1 Dead API Router Endpoints
- **Source:** `artifacts/metrics/debt-ledger.yaml` (FAIL-IFC-197-001).
- **Total Dead Endpoints:** 17.
- **Conversation Router (13):** `create`, `getById`, `getBySessionId`, `search`, `addMessage`, `recordToolCall`, `updateToolCall`, `approveToolCall`, `endConversation`, `escalate`, `getPendingApprovals`, `getAnalytics`, `archiveOld`.
- **Agent Router (4):** `executeTool`, `getPendingCount`, `getTool`, `listTools`.
- **Finding:** These are legacy endpoints that query the same DB tables but are no longer used by the frontend.

### 4.2 Stale Documentation & Metrics
- **`artifacts/metrics/job-metrics.json`**: Outdated (Sprint 7, 2025). Shows zero counts which do not reflect the current system activity.
- **Empty Runbooks:** `docs/operations/runbooks/workers-runbook.md` and `workflow-troubleshooting.md` are empty. This audit's findings should be used to populate them.

### 4.3 Input Validation Gaps
- **Validation Deficiency:** `scoring.job.ts` and `prediction.job.ts` both destructure `job.data` without calling `Zod.parse()`.
- **Risk:** Malformed data (e.g., missing `lead.id`) causes a `TypeError` that crashes the job before it even reaches the LLM chain.

---

## 5. Comprehensive Recommendations

1.  **Infrastructure Config:** Update the default `lockDuration` to **360,000ms (6 minutes)** in `packages/platform/src/queues/queue-factory.ts` to provide enough headroom for local Ollama inference.
2.  **Resilience Refactor:** Implement the `job.extendLock()` pattern in `ai-scoring` and `ai-prediction` handlers to match the standard established in `ai-insights`.
3.  **Security Pre-checks:** Add a Zod validation step at the start of every job handler to provide clear "Malformed Input" failure reasons instead of re-throwing generic errors.
4.  **Route Cleanup:** Decommission the 17 dead endpoints identified in the debt ledger.
5.  **Runbook Completion:** Populate `docs/operations/runbooks/workflow-troubleshooting.md` with the "180 vs 219" latency finding as a known issue for local development.
