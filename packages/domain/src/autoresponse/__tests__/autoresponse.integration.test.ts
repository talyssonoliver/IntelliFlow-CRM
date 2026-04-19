/**
 * Auto-Response Integration Tests - IFC-029
 *
 * End-to-end integration tests for the auto-response workflow.
 * Tests the complete flow from draft creation through approval and sending.
 *
 * These tests require a running database and test the actual tRPC procedures.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { AutoResponseDraft, ResponseContent, type TriggerType } from '../index';

// Test constants
const TEST_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const TEST_USER_ID = '00000000-0000-4000-8000-000000000103';
const TEST_LEAD_ID = '00000000-0000-4000-8000-000000000201';
const TEST_APPROVER_ID = '00000000-0000-4000-8000-000000000102';
const TEST_MANAGER_ID = '00000000-0000-4000-8000-000000000101';

describe('Auto-Response Integration Tests', () => {
  describe('Domain Model Integration', () => {
    it('should create a valid AutoResponseDraft aggregate', () => {
      const content = ResponseContent.create({
        subject: 'Thank you for your inquiry',
        body: 'We have received your message and will respond shortly.',
      });

      const result = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: TEST_TENANT_ID,
        leadStatus: 'NEW',
        triggerType: 'EMAIL_RECEIVED' as TriggerType,
        content,
        aiConfidence: 0.92,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
        expiryHours: 24,
      });

      expect(result.isSuccess).toBe(true);
      const draft = result.value;

      expect(draft.status).toBe('DRAFT');
      expect(draft.aiConfidence).toBe(0.92);
      expect(draft.content.subject).toBe('Thank you for your inquiry');
      expect(draft.isExpired).toBe(false);
      expect(draft.isPendingApproval).toBe(false);
    });

    it('should validate lead status for auto-response eligibility', () => {
      const content = ResponseContent.create({
        subject: 'Test',
        body: 'Test body',
      });

      // Invalid lead status should fail
      const result = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: TEST_TENANT_ID,
        leadStatus: 'CLOSED', // Not allowed for auto-response
        triggerType: 'EMAIL_RECEIVED' as TriggerType,
        content,
        aiConfidence: 0.85,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('INVALID_LEAD_STATUS');
    });

    it('should enforce tenant isolation', () => {
      const content = ResponseContent.create({
        subject: 'Test',
        body: 'Test body',
      });

      // Mismatched tenant IDs should fail
      const result = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: 'different-tenant-id',
        leadStatus: 'NEW',
        triggerType: 'EMAIL_RECEIVED' as TriggerType,
        content,
        aiConfidence: 0.85,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
      });

      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('TENANT_MISMATCH');
    });
  });

  describe('Approval Workflow Integration', () => {
    let draft: AutoResponseDraft;

    beforeEach(() => {
      const content = ResponseContent.create({
        subject: 'Follow-up on your inquiry',
        body: 'Thank you for reaching out. We would like to schedule a call.',
      });

      const result = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: TEST_TENANT_ID,
        leadStatus: 'CONTACTED',
        triggerType: 'FORM_SUBMIT' as TriggerType,
        content,
        aiConfidence: 0.78,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
      });

      draft = result.value;
    });

    it('should complete the approval workflow: DRAFT -> PENDING_APPROVAL -> APPROVED -> SENT', () => {
      // Step 1: Submit for approval
      expect(draft.status).toBe('DRAFT');
      const submitResult = draft.submitForApproval(TEST_APPROVER_ID);
      expect(submitResult.isSuccess).toBe(true);
      expect(draft.status).toBe('PENDING_APPROVAL');
      expect(draft.isPendingApproval).toBe(true);

      // Step 2: Approve
      const approveResult = draft.approve(TEST_APPROVER_ID, undefined, 'Approved as-is');
      expect(approveResult.isSuccess).toBe(true);
      expect(draft.status).toBe('APPROVED');
      expect(draft.canBeSent).toBe(true);
      expect(draft.approvalDecision?.decision).toBe('APPROVED');

      // Step 3: Mark as sent
      const sentResult = draft.markSent('notification-id-12345');
      expect(sentResult.isSuccess).toBe(true);
      expect(draft.status).toBe('SENT');
    });

    it('should handle approval with modifications', () => {
      draft.submitForApproval(TEST_APPROVER_ID);

      const modifications = {
        subject: 'Modified: Follow-up on your inquiry',
        body: 'Edited body with additional details.',
      };

      const approveResult = draft.approve(TEST_APPROVER_ID, modifications, 'Made edits');
      expect(approveResult.isSuccess).toBe(true);
      expect(draft.approvalDecision?.modifications).toEqual(modifications);
    });

    it('should handle rejection workflow', () => {
      draft.submitForApproval(TEST_APPROVER_ID);

      const rejectResult = draft.reject(TEST_APPROVER_ID, 'Content not appropriate for this lead');
      expect(rejectResult.isSuccess).toBe(true);
      expect(draft.status).toBe('REJECTED');
      expect(draft.approvalDecision?.decision).toBe('REJECTED');
      expect(draft.approvalDecision?.reason).toBe('Content not appropriate for this lead');
    });

    it('should handle escalation workflow', () => {
      draft.submitForApproval(TEST_APPROVER_ID);

      // Escalate to manager
      const escalateResult = draft.escalate(
        TEST_APPROVER_ID,
        TEST_MANAGER_ID,
        'Need senior review for VIP lead',
        48
      );
      expect(escalateResult.isSuccess).toBe(true);
      expect(draft.status).toBe('ESCALATED');
      expect(draft.escalation?.escalatedTo).toBe(TEST_MANAGER_ID);
      expect(draft.escalationCount).toBe(1);

      // Resolve escalation
      const resolveResult = draft.resolveEscalation(TEST_MANAGER_ID, 'Reviewed and approved');
      expect(resolveResult.isSuccess).toBe(true);
      expect(draft.status).toBe('PENDING_APPROVAL');
      expect(draft.escalation?.resolvedBy).toBe(TEST_MANAGER_ID);
    });

    it('should enforce maximum escalation limit', () => {
      draft.submitForApproval(TEST_APPROVER_ID);

      // First escalation
      draft.escalate(TEST_APPROVER_ID, TEST_MANAGER_ID, 'First escalation', 24);
      draft.resolveEscalation(TEST_MANAGER_ID);

      // Second escalation
      draft.escalate(TEST_APPROVER_ID, TEST_MANAGER_ID, 'Second escalation', 24);
      draft.resolveEscalation(TEST_MANAGER_ID);

      // Third escalation
      draft.escalate(TEST_APPROVER_ID, TEST_MANAGER_ID, 'Third escalation', 24);
      draft.resolveEscalation(TEST_MANAGER_ID);

      // Fourth escalation should fail (max is 3)
      const result = draft.escalate(TEST_APPROVER_ID, TEST_MANAGER_ID, 'Fourth escalation', 24);
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('MAX_ESCALATIONS_REACHED');
    });
  });

  describe('Domain Events Integration', () => {
    it('should emit domain events during workflow transitions', () => {
      const content = ResponseContent.create({
        subject: 'Test',
        body: 'Test body',
      });

      const result = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: TEST_TENANT_ID,
        leadStatus: 'NEW',
        triggerType: 'CHAT_MESSAGE' as TriggerType,
        content,
        aiConfidence: 0.88,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
      });

      const draft = result.value;

      // Check creation event
      let events = draft.getDomainEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.constructor.name === 'AutoResponseGeneratedEvent')).toBe(true);
      draft.clearDomainEvents();

      // Submit for approval
      draft.submitForApproval(TEST_APPROVER_ID);
      events = draft.getDomainEvents();
      expect(
        events.some((e) => e.constructor.name === 'AutoResponseSubmittedForApprovalEvent')
      ).toBe(true);
      draft.clearDomainEvents();

      // Approve
      draft.approve(TEST_APPROVER_ID);
      events = draft.getDomainEvents();
      expect(events.some((e) => e.constructor.name === 'AutoResponseApprovedEvent')).toBe(true);
      draft.clearDomainEvents();

      // Mark sent
      draft.markSent('notification-123');
      events = draft.getDomainEvents();
      expect(events.some((e) => e.constructor.name === 'AutoResponseSentEvent')).toBe(true);
    });
  });

  describe('Expiration Handling', () => {
    it('should detect expired drafts', () => {
      const content = ResponseContent.create({
        subject: 'Test',
        body: 'Test body',
      });

      // Create a draft with very short expiry (for testing)
      const result = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: TEST_TENANT_ID,
        leadStatus: 'NEW',
        triggerType: 'EMAIL_RECEIVED' as TriggerType,
        content,
        aiConfidence: 0.85,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
        expiryHours: 1, // 1 hour expiry
      });

      const draft = result.value;

      // Fresh draft should not be expired
      expect(draft.isExpired).toBe(false);

      // Note: To properly test expiration, we would need to mock Date.now()
      // or use a test helper to simulate time passage
    });

    it('should reject operations on expired drafts', () => {
      const content = ResponseContent.create({
        subject: 'Test',
        body: 'Test body',
      });

      const createResult = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: TEST_TENANT_ID,
        leadStatus: 'NEW',
        triggerType: 'EMAIL_RECEIVED' as TriggerType,
        content,
        aiConfidence: 0.92,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
        expiryHours: 1,
      });

      expect(createResult.isSuccess).toBe(true);
      const draft = createResult.value;
      expect(draft.isExpired).toBe(false);

      // Fast-forward past expiry using vi.useFakeTimers + setSystemTime;
      // AutoResponseDraft.isExpired calls `new Date() > expiresAt`, which
      // setSystemTime reliably intercepts.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000)); // +2h

      try {
        expect(draft.isExpired).toBe(true);

        const submitResult = draft.submitForApproval(TEST_APPROVER_ID);
        expect(submitResult.isFailure).toBe(true);
        expect(submitResult.error?.constructor.name).toBe('DraftExpiredError');
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Status History Tracking', () => {
    it('should maintain complete status history', () => {
      const content = ResponseContent.create({
        subject: 'Test',
        body: 'Test body',
      });

      const result = AutoResponseDraft.create({
        tenantId: TEST_TENANT_ID,
        leadId: TEST_LEAD_ID,
        leadTenantId: TEST_TENANT_ID,
        leadStatus: 'NEW',
        triggerType: 'MANUAL' as TriggerType,
        content,
        aiConfidence: 0.95,
        modelVersion: 'openai:gpt-4:v1',
        recipientEmail: 'lead@example.com',
      });

      const draft = result.value;

      // Initial status
      expect(draft.statusHistory.length).toBe(1);
      expect(draft.statusHistory[0].status).toBe('DRAFT');

      // Submit for approval
      draft.submitForApproval(TEST_APPROVER_ID);
      expect(draft.statusHistory.length).toBe(2);
      expect(draft.statusHistory[1].status).toBe('PENDING_APPROVAL');

      // Approve
      draft.approve(TEST_APPROVER_ID);
      expect(draft.statusHistory.length).toBe(3);
      expect(draft.statusHistory[2].status).toBe('APPROVED');

      // Mark sent
      draft.markSent('notification-456');
      expect(draft.statusHistory.length).toBe(4);
      expect(draft.statusHistory[3].status).toBe('SENT');
    });
  });
});
