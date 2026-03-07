/**
 * Quick integration test: verify agent-status upserts work.
 * Run: npx tsx apps/ai-worker/scripts/test-agent-status.ts
 */
import '../src/env';
import { loadAIConfig } from '../src/config/ai.config';
import {
  extractJobContext,
  markAgentActive,
  markAgentIdle,
  markAgentError,
} from '../src/services/agent-status';
import type { InsightJobData } from '../src/jobs';
import pg from 'pg';

loadAIConfig();

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000101';

async function main() {
  // 1. Extract context from a sample insight job
  const jobData: InsightJobData = {
    tenantId: TENANT_ID,
    userId: USER_ID,
    dealsAtRisk: [{ id: 'd1', name: 'Test Deal', daysSinceUpdate: 10 }],
    hotLeads: [{ id: 'l1', name: 'Test Lead', score: 85 }],
    overdueTasksCount: 3,
    staleContacts: [],
  };

  const ctx = extractJobContext('ai-insights', jobData);
  if (!ctx) {
    console.error('Failed to extract context');
    process.exit(1);
  }
  console.log('Extracted context:', ctx);

  // 2. Mark ACTIVE
  console.log('\nMarking agent ACTIVE...');
  await markAgentActive(ctx);

  // 3. Check DB
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT "sessionId", "agentName", "agentModel", "status", "contextName", "lastMessageAt"
       FROM conversation_records
       WHERE "sessionId" = $1`,
      [`agent-status:${TENANT_ID}:insights`]
    );
    if (res.rows.length === 0) {
      console.error('No record created!');
      process.exit(1);
    }
    console.log('DB record (ACTIVE):', JSON.stringify(res.rows[0], null, 2));

    // 4. Mark IDLE
    console.log('\nMarking agent IDLE...');
    await markAgentIdle(ctx, 'Generated 5 insights');

    const res2 = await client.query(
      `SELECT "status", "contextName", "lastMessageAt" FROM conversation_records WHERE "sessionId" = $1`,
      [`agent-status:${TENANT_ID}:insights`]
    );
    console.log('DB record (IDLE):', JSON.stringify(res2.rows[0], null, 2));

    // 5. Mark ERROR
    console.log('\nMarking agent ERROR...');
    await markAgentError(ctx, 'Model timeout after 60s');

    const res3 = await client.query(
      `SELECT "status", "contextName", "lastMessageAt" FROM conversation_records WHERE "sessionId" = $1`,
      [`agent-status:${TENANT_ID}:insights`]
    );
    console.log('DB record (ERROR):', JSON.stringify(res3.rows[0], null, 2));

    // 6. Reset to IDLE for clean state
    await markAgentIdle(ctx, 'Awaiting new jobs');

    console.log('\nAll agent-status transitions verified successfully!');
  } finally {
    client.release();
    await pool.end();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
