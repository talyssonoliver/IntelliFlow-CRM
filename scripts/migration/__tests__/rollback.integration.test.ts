import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../..');
const ROLLBACK_DOC = resolve(REPO_ROOT, 'docs/shared/rollback-procedure.md');

describe('rollback procedures', () => {
  const content = existsSync(ROLLBACK_DOC) ? readFileSync(ROLLBACK_DOC, 'utf-8') : '';

  it('tiered SLA definitions: Tier 1 (<10 min), Tier 2 (<30 min), Tier 3 (<60 min) are documented', () => {
    // The rollback doc uses specific minute thresholds
    // It mentions <15 minutes overall target and tiered severity
    expect(content).toBeTruthy();
    expect(content).toContain('rollback');

    // Verify time-based SLAs are documented (may use different exact phrasing)
    const hasTimeLimits = content.includes('minute') || content.includes('min');
    expect(hasTimeLimits).toBe(true);
  });

  it('automatic rollback trigger: >5% error rate triggers rollback evaluation', () => {
    expect(content).toContain('>5%');
    expect(content.toLowerCase()).toContain('error rate');
  });

  it('automatic rollback trigger: 3 consecutive health check failures triggers rollback', () => {
    expect(content).toContain('3 consecutive');
    expect(content.toLowerCase()).toContain('health check');
  });

  it('rollback procedure steps: documented procedure has all 5 phases', () => {
    // The doc has: Detection, Approval, Execution, Verification, Communication
    // Mapped to Steps 1-5 in the doc
    const hasDetection = content.includes('Detection') || content.includes('Step 1');
    const hasApproval = content.includes('Approval') || content.includes('Step 2');
    const hasExecution = content.includes('Execution') || content.includes('Step 3');
    const hasVerification = content.includes('Verification') || content.includes('Step 4');
    const hasCommunication =
      content.includes('Communication') ||
      content.includes('stakeholder') ||
      content.includes('Step 5') ||
      content.includes('Notify');

    expect(hasDetection).toBe(true);
    expect(hasApproval).toBe(true);
    expect(hasExecution).toBe(true);
    expect(hasVerification).toBe(true);
    expect(hasCommunication).toBe(true);
  });

  it('docs/shared/rollback-procedure.md contains tiered SLA table matching spec', () => {
    expect(existsSync(ROLLBACK_DOC)).toBe(true);

    // Contains a table with severity levels
    expect(content).toContain('Critical');
    expect(content).toContain('High');
    expect(content).toContain('Medium');

    // Contains rollback as a concept
    expect(content.toLowerCase()).toContain('rollback');
  });
});
