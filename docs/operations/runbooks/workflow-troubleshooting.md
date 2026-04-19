# Workflow Troubleshooting Runbook

**Document ID**: RUN-WF-001 **Version**: 1.0 **Last Updated**: 2025-12-29
**Owner**: Engineering Team

---

## Overview

This runbook provides troubleshooting procedures for the IntelliFlow CRM
workflow system, covering Temporal workflows, Rules Engine, BullMQ jobs, and
event handlers.

---

## Quick Reference

| Symptom               | Likely Cause        | Action                                                  |
| --------------------- | ------------------- | ------------------------------------------------------- |
| Workflow stuck        | Activity timeout    | [Temporal Activity Timeout](#temporal-activity-timeout) |
| Workflow not starting | Event routing issue | [Event Not Routed](#event-not-routed)                   |
| Rules not firing      | Condition mismatch  | [Rules Not Matching](#rules-not-matching)               |
| High latency          | Resource exhaustion | [Performance Issues](#performance-issues)               |
| Jobs failing          | Worker crash        | [BullMQ Worker Issues](#bullmq-worker-issues)           |

---

## Temporal Workflow Issues

### Temporal Server Not Responding

**Symptoms**:

- Workflows not starting
- `ECONNREFUSED` errors
- Health check failing

**Diagnosis**:

```bash
# Check Temporal server status
docker ps | grep temporal

# Check server logs
docker logs temporal-server

# Test connection
curl http://localhost:7233/health
```

**Resolution**:

1. **Restart Temporal Server**:

   ```bash
   docker-compose -f infra/docker/temporal-compose.yml restart
   ```

2. **Check resource limits**:

   ```bash
   docker stats temporal-server
   ```

3. **Verify network connectivity**:

   ```bash
   nc -zv localhost 7233
   ```

4. **Check PostgreSQL (Temporal persistence)**:
   ```bash
   docker logs temporal-postgres
   psql -h localhost -U temporal -d temporal -c "SELECT 1"
   ```

---

### Temporal Activity Timeout

**Symptoms**:

- Workflow shows "Activity Task Timed Out"
- Retry attempts exhausting
- Workflow stuck in "Running" state

**Diagnosis**:

```typescript
// Check activity configuration
const activities = proxyActivities<MyActivities>({
  startToCloseTimeout: '30 seconds', // Is this sufficient?
  scheduleToCloseTimeout: '1 minute',
  retry: {
    maximumAttempts: 3,
    initialInterval: '1 second',
    backoffCoefficient: 2,
  },
});
```

**Resolution**:

1. **Increase timeout**:

   ```typescript
   const activities = proxyActivities<MyActivities>({
     startToCloseTimeout: '2 minutes', // Increase as needed
   });
   ```

2. **Check activity implementation**:

   ```typescript
   async function slowActivity(): Promise<void> {
     // Add heartbeats for long-running activities
     Context.current().heartbeat('Processing step 1');
     // ... work ...
     Context.current().heartbeat('Processing step 2');
   }
   ```

3. **Verify external dependencies**:
   - Database connectivity
   - API response times
   - Network latency

---

### Workflow Not Receiving Signals

**Symptoms**:

- Human approval stuck
- Workflow not responding to signals
- Signal appears sent but not processed

**Diagnosis**:

1. **Check workflow ID is correct**:

   ```typescript
   const handle = await client.getHandle(workflowId);
   console.log('Workflow exists:', handle !== null);
   ```

2. **Verify workflow is in correct state**:

   ```typescript
   const status = await handle.getStatus();
   console.log('Workflow status:', status);
   // Must be 'running' to receive signals
   ```

3. **Check signal handler is registered**:

   ```typescript
   // In workflow code
   const approvalSignal = defineSignal<[ApprovalPayload]>('approval');

   setHandler(approvalSignal, (payload) => {
     console.log('Signal received:', payload); // Add logging
     approvalReceived = true;
   });
   ```

**Resolution**:

1. Ensure signal name matches exactly (case-sensitive)
2. Verify workflow is running and waiting for signal
3. Check for workflow ID typos
4. Inspect Temporal UI for signal history

---

### Workflow History Too Large

**Symptoms**:

- Workflow becoming slow
- Memory errors
- "History size exceeds limit" errors

**Diagnosis**:

```bash
# Check workflow history size in Temporal UI
# Navigate to: http://localhost:8080/namespaces/default/workflows/{workflowId}
```

**Resolution**:

1. **Use Continue-As-New**:

   ```typescript
   import { continueAsNew, workflowInfo } from '@temporalio/workflow';

   export async function longRunningWorkflow(state: State): Promise<void> {
     if (workflowInfo().historyLength > 10000) {
       await continueAsNew<typeof longRunningWorkflow>(state);
       return;
     }
     // ... workflow logic ...
   }
   ```

2. **Break into child workflows**:

   ```typescript
   import { executeChild } from '@temporalio/workflow';

   // Delegate work to child workflow
   await executeChild(childWorkflow, { args: [data] });
   ```

---

## Rules Engine Issues

### Rules Not Matching

**Symptoms**:

- Expected actions not triggering
- `matched: false` in evaluation results
- Silent failures

**Diagnosis**:

```typescript
// Enable detailed logging
const engine = new RulesEngine({ enableLogging: true });

// Evaluate with test payload
const results = await engine.evaluate({
  eventType: 'case.created',
  eventPayload: {
    caseId: 'test-123',
    priority: 'HIGH',
    status: 'OPEN',
  },
  timestamp: new Date(),
});

console.log('Results:', JSON.stringify(results, null, 2));
```

**Resolution**:

1. **Check field paths**:

   ```typescript
   // Verify field access
   // If payload is: { data: { priority: 'HIGH' } }
   // Field should be: 'data.priority' NOT 'priority'
   ```

2. **Check value types**:

   ```typescript
   // Number comparison requires numbers
   { field: 'score', operator: 'greater_than', value: 70 }  // Good
   { field: 'score', operator: 'greater_than', value: '70' }  // May fail
   ```

3. **Verify rule is enabled**:

   ```typescript
   const rule = engine.getRule('my-rule');
   console.log('Rule enabled:', rule?.enabled);
   ```

4. **Check event type registration**:
   ```typescript
   const rules = engine.getRulesForEvent('case.created');
   console.log(
     'Rules for event:',
     rules.map((r) => r.id)
   );
   ```

---

### Rules Executing Slowly

**Symptoms**:

- High `averageEvaluationTimeMs` in metrics
- API latency spikes during rule evaluation
- Timeouts in event handlers

**Diagnosis**:

```typescript
const metrics = engine.getMetrics();
console.log('Avg evaluation time:', metrics.averageEvaluationTimeMs);
console.log('Total evaluations:', metrics.totalEvaluations);
console.log('Errors:', metrics.errors);
```

**Resolution**:

1. **Reduce rule count per event**:

   ```typescript
   // Check how many rules match each event type
   const ruleCount = engine.getRulesForEvent('case.created').length;
   console.log('Rules for case.created:', ruleCount); // Should be < 50
   ```

2. **Optimize conditions**:

   ```typescript
   // Put most discriminating conditions first
   conditions: {
     operator: 'AND',
     conditions: [
       { field: 'type', operator: 'equals', value: 'RARE_TYPE' },  // Filters most events
       { field: 'priority', operator: 'equals', value: 'HIGH' },   // Secondary filter
     ],
   }
   ```

3. **Use appropriate operators**:
   ```typescript
   // 'equals' is faster than 'regex_match'
   // 'in' with small array is faster than multiple 'OR' conditions
   ```

---

### Actions Not Executing

**Symptoms**:

- Rules match but actions don't run
- Missing notifications/workflow triggers
- Errors in action execution

**Diagnosis**:

```typescript
// Check action handler is registered
const customHandler = (action, context) => {
  console.log('Action executing:', action.type);
  // ... implementation
};

engine.registerActionHandler('custom_action', customHandler);
```

**Resolution**:

1. **Check action handler exists**:

   ```typescript
   // Default action types:
   // - trigger_workflow
   // - send_notification
   // - update_field
   // - create_task
   // - log_event
   // - call_webhook
   ```

2. **Check action config**:

   ```typescript
   actions: [
     {
       type: 'send_notification',
       config: {
         channel: 'email', // Required
         recipient: 'test@example.com', // Required
         template: 'alert', // Required
       },
     },
   ];
   ```

3. **Review error logs**:
   ```typescript
   const results = await engine.evaluate(context);
   for (const result of results) {
     if (result.errors.length > 0) {
       console.error(`Rule ${result.ruleId} errors:`, result.errors);
     }
   }
   ```

---

## BullMQ Issues

### BullMQ Worker Issues

**Symptoms**:

- Jobs stuck in "waiting" state
- Worker not processing jobs
- Redis connection errors

**Diagnosis**:

```bash
# Check Redis connection
redis-cli ping

# Check queue status
redis-cli LLEN bull:email-queue:waiting
redis-cli LLEN bull:email-queue:active
redis-cli LLEN bull:email-queue:failed
```

**Resolution**:

1. **Restart worker**:

   ```typescript
   await worker.close();
   worker = new Worker('email-queue', processor, { connection });
   ```

2. **Check Redis connection**:

   ```typescript
   const connection = new IORedis({
     host: process.env.REDIS_HOST || 'localhost',
     port: Number.parseInt(process.env.REDIS_PORT || '6379'),
     maxRetriesPerRequest: null, // Required for BullMQ
   });
   ```

3. **Increase concurrency**:
   ```typescript
   const worker = new Worker('email-queue', processor, {
     connection,
     concurrency: 10, // Process up to 10 jobs concurrently
   });
   ```

---

### Jobs Failing Repeatedly

**Symptoms**:

- Jobs in failed state
- Retry limit exceeded
- DLQ filling up

**Diagnosis**:

```typescript
// Check failed job details
const failedJobs = await queue.getFailed(0, 10);
for (const job of failedJobs) {
  console.log('Job ID:', job.id);
  console.log('Attempts:', job.attemptsMade);
  console.log('Error:', job.failedReason);
  console.log('Stack:', job.stacktrace);
}
```

**Resolution**:

1. **Fix underlying error**:
   - Check error message for root cause
   - Validate job data before processing
   - Handle edge cases

2. **Retry failed jobs**:

   ```typescript
   const failedJobs = await queue.getFailed();
   for (const job of failedJobs) {
     await job.retry();
   }
   ```

3. **Move to DLQ for investigation**:
   ```typescript
   const failedJobs = await queue.getFailed();
   for (const job of failedJobs) {
     await job.moveToFailed(
       { message: 'Moved to DLQ for investigation' },
       'dlq-token'
     );
   }
   ```

---

## Event Handler Issues

### Event Not Routed

**Symptoms**:

- Events published but no workflow starts
- Handler not called
- Missing logs

**Diagnosis**:

```typescript
// Check handler registration
const registry = getCaseEventHandlerRegistry();
console.log('Registered handlers:', registry.getRegisteredEventTypes());

// Check if handler exists for event type
const handler = registry.getHandler('case.created');
console.log('Handler exists:', handler !== undefined);
```

**Resolution**:

1. **Register handler**:

   ```typescript
   registry.register(new CustomEventHandler());
   ```

2. **Check event type spelling**:

   ```typescript
   // Event types are case-sensitive
   'case.created'; // Correct
   'Case.Created'; // Wrong
   'case_created'; // Wrong
   ```

3. **Verify event bus subscription**:
   ```typescript
   eventBus.subscribe('case.*', async (event) => {
     await registry.processEvent(event.type, event.payload, event.context);
   });
   ```

---

### Handler Throwing Errors

**Symptoms**:

- Handler returns `success: false`
- Error messages in logs
- Workflow not started

**Diagnosis**:

```typescript
const result = await registry.processEvent('case.created', payload, context);

if (!result.success) {
  console.error('Handler error:', result.error);
}
```

**Resolution**:

1. **Check payload validation**:

   ```typescript
   // Ensure required fields present
   if (!payload.caseId || !payload.title) {
     return {
       success: false,
       error: 'Missing required fields',
     };
   }
   ```

2. **Add error handling**:
   ```typescript
   async handle(payload, context): Promise<HandlerResult> {
     try {
       // ... handler logic
     } catch (error) {
       console.error('Handler error:', error);
       return {
         success: false,
         error: error instanceof Error ? error.message : String(error),
       };
     }
   }
   ```

---

## Performance Issues

### High Latency

**Symptoms**:

- API response times > 500ms
- Workflow start latency > 1s
- Rule evaluation > 100ms

**Diagnosis**:

```bash
# Check system resources
docker stats

# Check Temporal latency
curl -w "@curl-format.txt" -s -o /dev/null http://localhost:7233/health

# Check Redis latency
redis-cli --latency
```

**Resolution**:

1. **Scale workers**:

   ```bash
   # Increase Temporal worker count
   docker-compose up --scale temporal-worker=3
   ```

2. **Add caching**:

   ```typescript
   // Cache frequently used rules
   const cachedRules = new Map<string, RuleDefinition[]>();
   ```

3. **Optimize database queries**:
   - Add indexes for common queries
   - Use connection pooling
   - Batch operations where possible

---

## Recovery Procedures

### Full System Recovery

If the entire workflow system is down:

1. **Stop all services**:

   ```bash
   docker-compose down
   ```

2. **Check data integrity**:

   ```bash
   # Verify PostgreSQL data
   docker-compose up -d temporal-postgres
   psql -h localhost -U temporal -d temporal -c "SELECT COUNT(*) FROM executions"

   # Verify Redis data
   docker-compose up -d redis
   redis-cli DBSIZE
   ```

3. **Start services in order**:

   ```bash
   docker-compose up -d temporal-postgres
   docker-compose up -d redis
   docker-compose up -d temporal-server
   docker-compose up -d temporal-worker
   ```

4. **Verify health**:

   ```bash
   curl http://localhost:7233/health
   redis-cli ping
   ```

5. **Resume workflows**:
   - Open Temporal UI
   - Check for stuck workflows
   - Signal or retry as needed

---

## Monitoring Setup

### Key Metrics to Track

| Metric                | Target | Alert Threshold |
| --------------------- | ------ | --------------- |
| Workflow success rate | > 95%  | < 90%           |
| Avg workflow duration | < 5s   | > 30s           |
| Rule evaluation time  | < 50ms | > 200ms         |
| BullMQ job latency    | < 1s   | > 5s            |
| Event handler errors  | < 1%   | > 5%            |

### Setting Up Alerts

```yaml
# alerts-config.yaml
alerts:
  - name: workflow-failure-rate
    condition: workflow_success_rate < 0.90
    severity: critical
    notification: pagerduty

  - name: rule-evaluation-slow
    condition: rule_evaluation_p99 > 200ms
    severity: warning
    notification: slack
```

---

## Contact and Escalation

| Level | Contact            | When to Use            |
| ----- | ------------------ | ---------------------- |
| L1    | On-call engineer   | Initial triage         |
| L2    | Workflow team lead | Persistent issues      |
| L3    | Platform architect | Architecture issues    |
| L4    | Temporal support   | Temporal-specific bugs |

---

_Runbook Version: 1.1 | Last Updated: 2026-04-17_

---

## DLQ Triage — AI Dead-Letter Queue (`ai-dlq`)

**When jobs land in the DLQ:** Jobs are forwarded to `ai-dlq` automatically
after all BullMQ retry attempts are exhausted (default: 3 attempts, exponential
backoff). Each DLQ entry contains `originalQueue`, `originalJobId`,
`failureReason`, `tenantId`, and `lastAttemptAt`.

### Inspect the DLQ

```bash
# Via Bull Board dashboard (preferred — shows full job data)
open http://localhost:3003/queues

# Via redis-cli (list waiting DLQ job IDs)
redis-cli LRANGE intelliflow:ai-dlq:waiting 0 -1

# Get a specific job's data
redis-cli HGETALL "bull:ai-dlq:JOB_ID"
```

### Replay a DLQ job back to its original queue

```typescript
// Identify the original queue and data from the DLQ job payload
// Then re-enqueue via the Bull Board dashboard's "Retry" button,
// OR manually using the BullMQ API:

import { Queue } from 'bullmq';

const dlq = new Queue('ai-dlq', { connection });
const originalQueue = new Queue('ai-scoring', { connection }); // use originalQueue field

const dlqJob = await dlq.getJob('DLQ_JOB_ID');
if (dlqJob?.data?.originalData) {
  await originalQueue.add(dlqJob.data.jobName, dlqJob.data.originalData, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 1000 },
  });
  // Remove from DLQ after successful replay
  await dlqJob.remove();
}
```

### Bulk replay all DLQ jobs

```bash
# Using Bull Board: navigate to http://localhost:3003/queues → ai-dlq → "Retry all"
# This replays each DLQ entry back into its original queue.
```

### Discard a DLQ job (unrecoverable)

```bash
# Via Bull Board: click the job → "Delete"
# Or via CLI:
redis-cli DEL "bull:ai-dlq:JOB_ID"
```

### Circuit breaker — if DLQ fills rapidly

A rapid DLQ fill rate (>10 jobs/minute) suggests the LLM provider is unreliable.
Check circuit breaker state and consider switching providers:

```bash
# Check ai-worker logs for "Circuit breaker opened" messages
docker logs ai-worker | grep "Circuit breaker"

# Switch to a different provider (env var, no restart needed if using LiteLLM proxy)
# LiteLLM auto-routes to fallback model — check infra/litellm/config.yaml
```

---

## Known Issue — "180 vs 219" BullMQ Stall on Local Ollama

**Symptom:** `ai-scoring` and `ai-prediction` BullMQ jobs fail with lock-expired
errors after ~3 minutes. The `ai-insights` queue is unaffected.

**Root cause:** Local Ollama inference p95 = 219 s (benchmark:
`artifacts/benchmarks/ollama-real-benchmark-report.json`, IFC-174) exceeds the
BullMQ worker `lockDuration` of 180 s. The `insight-generation.job.ts` handler
extends the lock every 5 min (`job.extendLock(job.token!, 300_000)` at line
894); `scoring.job.ts` and `prediction.job.ts` do not (see BullMQ audit
`artifacts/diagnostics/2026-04-16-bullmq-audit-report.md`).

**Permanent fix:** ADR-048 migration — LiteLLM proxy routes to Groq free tier
(p95 ~2 s). Tracked in sprint-17 Phase B2. Until the proxy is brought up,
scoring/prediction jobs will stall whenever Ollama p95 exceeds the BullMQ
`lockDuration` (180 s). Options while the migration lands:

- Bring LiteLLM up
  (`docker compose -f infra/docker/docker-compose.litellm.yml up -d`) and set
  `AI_PROVIDER=litellm` — routes via Groq, latency drops out of the stall range.
- Keep Ollama on its current model tag; Phase B2c added
  `extendLock(job.token!, 300_000)` to `scoring.job.ts` / `prediction.job.ts` so
  long-running inference no longer loses its BullMQ lock.
- Do NOT swap Ollama to a smaller or more-aggressively-quantized model as a
  "mitigation" — quality regressions are not an acceptable trade here.

**Diagnostics if the issue reappears:**

- Check BullMQ dashboard at `http://localhost:3003` for which queue is stalling.
- Compare current p95 to the benchmark baseline
  (`artifacts/benchmarks/ollama-real-benchmark-report.json`).
- Confirm `job.extendLock` is being called around the LLM invocation in the
  stalling handler.
