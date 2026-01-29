# Workflow Engine Training Guide

**Module**: IFC-141 Workflow Engine Implementation
**Version**: 1.0
**Date**: 2025-12-29

---

## Table of Contents

1. [Introduction](#introduction)
2. [Architecture Overview](#architecture-overview)
3. [Workflow Engine Selection](#workflow-engine-selection)
4. [Temporal Workflows](#temporal-workflows)
5. [Rules Engine](#rules-engine)
6. [Event Handlers](#event-handlers)
7. [Development Guide](#development-guide)
8. [Testing Workflows](#testing-workflows)
9. [Monitoring and Debugging](#monitoring-and-debugging)
10. [Common Patterns](#common-patterns)
11. [FAQs](#faqs)

---

## Introduction

IntelliFlow CRM uses a hybrid workflow architecture combining three complementary engines:

| Engine | Use Case | Characteristics |
|--------|----------|-----------------|
| **Temporal** | Durable business workflows | Long-running, reliable, saga support |
| **LangGraph** | AI agent orchestration | AI-native, state management |
| **BullMQ** | Background jobs | Fast, simple, Redis-based |
| **Rules Engine** | Real-time decisions | Low-latency, synchronous |

This guide covers the implementation, usage, and best practices for each engine.

---

## Architecture Overview

### Event-Driven Workflow Routing

```
+------------------+
| Domain Events    |
+--------+---------+
         |
         v
+------------------+
| Event Router     |
+--------+---------+
         |
    +----+----+----+----+
    |         |         |
    v         v         v
+-------+ +-------+ +-------+
|Temporal| |BullMQ | |Rules  |
+-------+ +-------+ +-------+
    |         |         |
    v         v         v
[Durable]  [Jobs]  [Decisions]
```

### Component Locations

| Component | Path |
|-----------|------|
| Workflow Engine | `packages/platform/src/workflow/engine.ts` |
| Rules Engine | `packages/platform/src/workflow/rules-engine.ts` |
| Case Events | `packages/domain/src/events/case-events.ts` |
| Event Handlers | `apps/api/src/workflow/handlers/` |
| Tests | `tests/integration/workflow/` |

---

## Workflow Engine Selection

### When to Use Each Engine

#### Temporal (Durable Workflows)

Use for processes that:
- Must not lose state on crashes
- Span multiple days/weeks/months
- Require saga pattern (compensation on failure)
- Need human-in-the-loop approvals
- Involve complex state machines

**Examples**:
- Case lifecycle management
- Order processing with payments
- Multi-step approval flows
- SLA-tracked processes

#### BullMQ (Background Jobs)

Use for tasks that:
- Are fire-and-forget
- Need simple retry logic
- Don't require complex state
- Should run asynchronously

**Examples**:
- Sending emails/notifications
- Data synchronization
- Cleanup tasks
- Webhook deliveries

#### Rules Engine (Real-time Decisions)

Use for:
- Fast, synchronous evaluations
- Simple conditional logic
- Triggering actions based on field values
- Low-latency requirements

**Examples**:
- Priority escalation rules
- SLA breach detection
- Field validation triggers
- Auto-assignment rules

---

## Temporal Workflows

### Setting Up Temporal

#### 1. Start Temporal Server (Development)

```bash
# Using Docker
docker-compose -f infra/docker/temporal-compose.yml up -d

# Verify server is running
curl http://localhost:7233/health
```

#### 2. Initialize Workflow Engine

```typescript
import {
  WorkflowEngineFactory,
  DEFAULT_TEMPORAL_CONFIG,
} from '@intelliflow/platform/workflow';

// Create engine
const engine = await WorkflowEngineFactory.createTemporalEngine({
  ...DEFAULT_TEMPORAL_CONFIG,
  taskQueue: 'intelliflow-workflows',
});

// Verify health
const health = await engine.healthCheck();
console.log('Temporal healthy:', health.healthy);
```

### Creating a Workflow

#### 1. Define Workflow Function

```typescript
// apps/ai-worker/src/workflows/case-lifecycle.workflow.ts
import { proxyActivities, sleep, defineSignal, setHandler } from '@temporalio/workflow';
import type { CaseActivities } from '../activities/case-activities';

// Proxy activities
const activities = proxyActivities<CaseActivities>({
  startToCloseTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
});

// Define signals for human interaction
export const approvalSignal = defineSignal<[{ approved: boolean; by: string }]>('approval');

// Main workflow function
export async function caseLifecycleWorkflow(input: {
  caseId: string;
  clientId: string;
  priority: string;
}): Promise<{ resolution: string; completedAt: string }> {
  // 1. Validate case data
  await activities.validateCase(input.caseId);

  // 2. Assign to team member
  const assignment = await activities.assignCase(input.caseId, input.priority);

  // 3. Wait for work to complete (with timeout)
  let workCompleted = false;
  let approvalResult = { approved: false, by: '' };

  setHandler(approvalSignal, (approval) => {
    approvalResult = approval;
    workCompleted = true;
  });

  // Wait up to 7 days for approval
  const deadline = Date.now() + 7 * 24 * 60 * 60 * 1000;
  while (!workCompleted && Date.now() < deadline) {
    await sleep('1 hour');
  }

  if (!approvalResult.approved) {
    // Escalate if not approved in time
    await activities.escalateCase(input.caseId);
  }

  // 4. Close case
  const resolution = await activities.closeCase(input.caseId, approvalResult);

  return {
    resolution,
    completedAt: new Date().toISOString(),
  };
}
```

#### 2. Define Activities

```typescript
// apps/ai-worker/src/activities/case-activities.ts
import { CaseRepository } from '@intelliflow/domain';

export interface CaseActivities {
  validateCase(caseId: string): Promise<void>;
  assignCase(caseId: string, priority: string): Promise<{ assignee: string }>;
  escalateCase(caseId: string): Promise<void>;
  closeCase(caseId: string, approval: { approved: boolean; by: string }): Promise<string>;
}

export function createCaseActivities(repo: CaseRepository): CaseActivities {
  return {
    async validateCase(caseId: string): Promise<void> {
      const caseEntity = await repo.findById(caseId);
      if (!caseEntity) {
        throw new Error(`Case ${caseId} not found`);
      }
    },

    async assignCase(caseId: string, priority: string): Promise<{ assignee: string }> {
      // Assignment logic based on priority and availability
      const assignee = await getAvailableAssignee(priority);
      await repo.updateAssignment(caseId, assignee);
      return { assignee };
    },

    async escalateCase(caseId: string): Promise<void> {
      await repo.incrementEscalationLevel(caseId);
      // Notify escalation team
    },

    async closeCase(caseId: string, approval: { approved: boolean; by: string }): Promise<string> {
      const resolution = approval.approved
        ? 'Completed successfully'
        : 'Closed without approval';
      await repo.close(caseId, resolution, approval.by);
      return resolution;
    },
  };
}
```

#### 3. Start a Workflow

```typescript
import { TemporalWorkflowEngine } from '@intelliflow/platform/workflow';

async function startCaseWorkflow(caseId: string): Promise<string> {
  const engine = WorkflowEngineFactory.getEngine('temporal') as TemporalWorkflowEngine;

  const handle = await engine.startWorkflow(
    `case-${caseId}`,
    'caseLifecycleWorkflow',
    {
      caseId,
      clientId: 'client-123',
      priority: 'HIGH',
    },
    {
      taskQueue: 'intelliflow-workflows',
      timeout: 30 * 24 * 60 * 60 * 1000, // 30 days
    }
  );

  console.log(`Started workflow: ${handle.workflowId}`);
  return handle.workflowId;
}
```

#### 4. Signal a Workflow (Human Approval)

```typescript
async function approveCase(workflowId: string, userId: string): Promise<void> {
  const engine = WorkflowEngineFactory.getEngine('temporal') as TemporalWorkflowEngine;
  const handle = await engine.getWorkflowHandle(workflowId);

  if (!handle) {
    throw new Error('Workflow not found');
  }

  await handle.signal({
    signalName: 'approval',
    payload: { approved: true, by: userId },
  });
}
```

---

## Rules Engine

### Creating Rules

#### 1. Define a Rule

```typescript
import { RulesEngine, RuleDefinition } from '@intelliflow/platform/workflow';

const escalationRule: RuleDefinition = {
  id: 'case-escalation-urgent',
  name: 'Escalate URGENT priority cases',
  enabled: true,
  priority: 10, // Lower = higher priority
  eventTypes: ['case.created', 'case.priority_changed'],
  conditions: {
    operator: 'AND',
    conditions: [
      { field: 'priority', operator: 'equals', value: 'URGENT' },
      { field: 'status', operator: 'not_equals', value: 'CLOSED' },
    ],
  },
  actions: [
    {
      type: 'send_notification',
      config: {
        channel: 'slack',
        recipient: '#urgent-cases',
        template: 'urgent-case-alert',
      },
    },
    {
      type: 'trigger_workflow',
      config: {
        workflowName: 'urgentCaseWorkflow',
        workflowEngine: 'temporal',
      },
    },
  ],
};
```

#### 2. Register and Evaluate Rules

```typescript
const rulesEngine = new RulesEngine({ enableLogging: true });

// Register rules
rulesEngine.registerRule(escalationRule);

// Evaluate when event occurs
const results = await rulesEngine.evaluate({
  eventType: 'case.created',
  eventPayload: {
    caseId: 'case-123',
    priority: 'URGENT',
    status: 'OPEN',
    title: 'Critical issue',
  },
  entityId: 'case-123',
  timestamp: new Date(),
});

// Check results
for (const result of results) {
  console.log(`Rule ${result.ruleId}: matched=${result.matched}, actions=${result.actionsExecuted}`);
}
```

### Rule Templates

Use pre-built templates for common patterns:

```typescript
import {
  createCaseEscalationRule,
  createLeadScoringRule,
  createTaskAssignmentRule,
} from '@intelliflow/platform/workflow';

// Case escalation
const escalation = createCaseEscalationRule({
  id: 'high-priority-escalation',
  priority: 'HIGH',
  daysOverdue: 3,
  notifyUsers: ['team-lead@company.com'],
});

// Lead scoring trigger
const leadScoring = createLeadScoringRule({
  id: 'new-lead-scoring',
  triggerOnCreate: true,
  triggerOnUpdate: false,
});

// Auto task creation
const taskRule = createTaskAssignmentRule({
  id: 'case-review-task',
  eventType: 'case.created',
  assigneeField: 'assignedTo',
  taskTitle: 'Review new case',
  priority: 'HIGH',
});
```

---

## Event Handlers

### Creating an Event Handler

```typescript
// apps/api/src/workflow/handlers/custom-handler.ts
import { ICaseEventHandler, CaseEventPayload, EventContext, HandlerResult } from './case-handler';

export class CustomCaseHandler implements ICaseEventHandler {
  readonly eventType = 'case.custom_event';

  async handle(
    payload: CaseEventPayload,
    context: EventContext
  ): Promise<HandlerResult> {
    try {
      // Your handling logic here
      const workflowId = `custom-${payload.caseId}-${Date.now()}`;

      // Start appropriate workflow
      // ...

      return {
        success: true,
        workflowId,
        workflowEngine: 'temporal',
        metadata: {
          caseId: payload.caseId,
          processedAt: context.occurredAt.toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }
}
```

### Registering Handlers

```typescript
import { getCaseEventHandlerRegistry, CustomCaseHandler } from './handlers';

const registry = getCaseEventHandlerRegistry();

// Register custom handler
registry.register(new CustomCaseHandler());

// Process events
const result = await registry.processEvent(
  'case.custom_event',
  { caseId: 'case-123' },
  { eventId: 'evt-1', eventType: 'case.custom_event', occurredAt: new Date() }
);
```

---

## Development Guide

### Project Setup

```bash
# Install dependencies
pnpm install

# Start Temporal (development)
docker-compose -f infra/docker/temporal-compose.yml up -d

# Start Redis (for BullMQ)
docker-compose -f infra/docker/redis-compose.yml up -d

# Run tests
pnpm test tests/integration/workflow
```

### File Structure

```
packages/platform/src/workflow/
├── engine.ts           # Workflow engine wrapper
├── rules-engine.ts     # Rules engine implementation
├── index.ts            # Exports

apps/api/src/workflow/
├── handlers/
│   ├── case-handler.ts # Case event handlers
│   └── index.ts
└── router.ts           # Event routing

tests/integration/workflow/
└── workflow.test.ts    # Integration tests
```

### Best Practices

1. **Idempotency**: All workflow activities must be idempotent
2. **Timeouts**: Always set appropriate timeouts for activities
3. **Error Handling**: Use typed errors and proper compensation
4. **Testing**: Write tests for workflows using mocks
5. **Monitoring**: Add metrics and tracing to all workflows

---

## Testing Workflows

### Unit Testing Rules

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { RulesEngine } from '@intelliflow/platform/workflow';

describe('Escalation Rules', () => {
  let engine: RulesEngine;

  beforeEach(() => {
    engine = new RulesEngine();
    // Register rules
  });

  it('should escalate URGENT cases', async () => {
    const results = await engine.evaluate({
      eventType: 'case.created',
      eventPayload: { priority: 'URGENT', status: 'OPEN' },
      timestamp: new Date(),
    });

    expect(results[0].matched).toBe(true);
  });
});
```

### Integration Testing

```typescript
import { describe, it, expect } from 'vitest';

describe('Case Lifecycle Workflow', () => {
  it('should complete case workflow end-to-end', async () => {
    // 1. Start workflow
    const workflowId = await startCaseWorkflow('case-test-1');

    // 2. Wait for workflow to reach approval step
    await waitForStatus(workflowId, 'waiting_for_input');

    // 3. Send approval signal
    await approveCase(workflowId, 'test-user');

    // 4. Wait for completion
    const result = await getWorkflowResult(workflowId);

    expect(result.resolution).toBe('Completed successfully');
  });
});
```

---

## Monitoring and Debugging

### Temporal Web UI

Access Temporal UI at `http://localhost:8080` to:
- View running workflows
- Inspect workflow history
- Debug failed workflows
- Replay workflows

### Rules Engine Metrics

```typescript
const metrics = rulesEngine.getMetrics();

console.log('Total evaluations:', metrics.totalEvaluations);
console.log('Rules matched:', metrics.totalRulesMatched);
console.log('Avg evaluation time:', metrics.averageEvaluationTimeMs, 'ms');
console.log('Errors:', metrics.errors);
```

### Logging

Enable logging for debugging:

```typescript
const engine = new RulesEngine({
  enableLogging: true,
  enableMetrics: true,
});
```

---

## Common Patterns

### Saga Pattern (Temporal)

```typescript
export async function orderSagaWorkflow(orderId: string): Promise<void> {
  try {
    await activities.reserveInventory(orderId);
    await activities.processPayment(orderId);
    await activities.shipOrder(orderId);
  } catch (error) {
    // Compensation
    await activities.cancelShipment(orderId);
    await activities.refundPayment(orderId);
    await activities.releaseInventory(orderId);
    throw error;
  }
}
```

### Conditional Rule Groups

```typescript
const complexRule: RuleDefinition = {
  id: 'complex-conditions',
  name: 'Complex Condition Example',
  enabled: true,
  priority: 100,
  eventTypes: ['case.updated'],
  conditions: {
    operator: 'OR',
    conditions: [
      {
        operator: 'AND',
        conditions: [
          { field: 'priority', operator: 'equals', value: 'URGENT' },
          { field: 'type', operator: 'equals', value: 'COMPLAINT' },
        ],
      },
      {
        operator: 'AND',
        conditions: [
          { field: 'priority', operator: 'equals', value: 'HIGH' },
          { field: 'daysOpen', operator: 'greater_than', value: 7 },
        ],
      },
    ],
  },
  actions: [/* ... */],
};
```

---

## FAQs

### Q: When should I use Temporal vs BullMQ?

**A**: Use Temporal when you need guaranteed execution, saga patterns, or long-running processes. Use BullMQ for simple async jobs like sending emails.

### Q: How do I handle workflow failures?

**A**: Temporal automatically retries activities based on retry policy. For permanent failures, use compensation logic in the workflow.

### Q: Can I update a running workflow?

**A**: Use Temporal signals to send updates to running workflows. The workflow can then react to the signal.

### Q: How do I test workflows without Temporal?

**A**: Use mock implementations of the workflow engine interface. See `tests/integration/workflow/workflow.test.ts` for examples.

### Q: What happens if Temporal is down?

**A**: Workflows pause and resume when Temporal comes back. No data is lost due to durable execution.

---

## Resources

- [Temporal TypeScript SDK](https://docs.temporal.io/typescript)
- [ADR-005: Workflow Engine Choice](../planning/adr/ADR-005-workflow-engine.md)
- [Comparison Matrix](../../artifacts/misc/workflow-comparison-matrix.md)
- [Troubleshooting Runbook](../operations/runbooks/workflow-troubleshooting.md)

---

*Training Version: 1.0 | Last Updated: 2025-12-29*
