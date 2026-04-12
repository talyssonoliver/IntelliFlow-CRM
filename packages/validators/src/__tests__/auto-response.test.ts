/**
 * Auto-Response Validators Tests
 *
 * Tests the Zod validation schemas for auto-response draft management.
 * Covers enum schemas, content validation, CRUD operations, query filters,
 * AI chain input/output, and approval workflow schemas.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  autoResponseStatusSchema,
  triggerTypeSchema,
  allowedLeadStatusSchema,
  responseContentSchema,
  autoResponseLeadInfoSchema,
  tenantSettingsSchema,
  autoResponseContextSchema,
  createAutoResponseDraftSchema,
  submitForApprovalSchema,
  approvalDecisionSchema,
  escalationSchema,
  markSentSchema,
  markFailedSchema,
  autoResponseQuerySchema,
  statusChangeSchema,
  autoResponseChainInputSchema,
  autoResponseChainOutputSchema,
  autoResponseValidationResultSchema,
} from '../auto-response';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_UUID_2 = '660e8400-e29b-41d4-a716-446655440001';

describe('Auto-Response Validators', () => {
  // ==========================================================================
  // Enum Schemas
  // ==========================================================================

  describe('autoResponseStatusSchema', () => {
    it('should accept all valid statuses', () => {
      const valid = [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'REJECTED',
        'INVALIDATED',
        'SENT',
        'FAILED',
        'ESCALATED',
      ];
      valid.forEach((v) => {
        const result = autoResponseStatusSchema.safeParse(v);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      expect(autoResponseStatusSchema.safeParse('CANCELLED').success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(autoResponseStatusSchema.safeParse('').success).toBe(false);
    });

    it('should reject non-string types', () => {
      expect(autoResponseStatusSchema.safeParse(42).success).toBe(false);
      expect(autoResponseStatusSchema.safeParse(null).success).toBe(false);
    });
  });

  describe('triggerTypeSchema', () => {
    it('should accept all valid trigger types', () => {
      ['EMAIL_RECEIVED', 'FORM_SUBMIT', 'CHAT_MESSAGE', 'MANUAL'].forEach((v) => {
        expect(triggerTypeSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid trigger type', () => {
      expect(triggerTypeSchema.safeParse('WEBHOOK').success).toBe(false);
    });
  });

  describe('allowedLeadStatusSchema', () => {
    it('should accept all allowed lead statuses', () => {
      ['NEW', 'CONTACTED', 'QUALIFIED', 'NURTURING'].forEach((v) => {
        expect(allowedLeadStatusSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject disallowed lead status', () => {
      expect(allowedLeadStatusSchema.safeParse('CLOSED').success).toBe(false);
      expect(allowedLeadStatusSchema.safeParse('LOST').success).toBe(false);
    });
  });

  // ==========================================================================
  // Content Schemas
  // ==========================================================================

  describe('responseContentSchema', () => {
    it('should accept valid subject and body', () => {
      const result = responseContentSchema.safeParse({
        subject: 'Thank you for reaching out',
        body: 'We received your inquiry and will get back to you shortly.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty subject', () => {
      const result = responseContentSchema.safeParse({
        subject: '',
        body: 'Valid body',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty body', () => {
      const result = responseContentSchema.safeParse({
        subject: 'Valid subject',
        body: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject subject exceeding 100 characters', () => {
      const result = responseContentSchema.safeParse({
        subject: 'x'.repeat(101),
        body: 'Valid body',
      });
      expect(result.success).toBe(false);
    });

    it('should accept subject at exactly 100 characters', () => {
      const result = responseContentSchema.safeParse({
        subject: 'x'.repeat(100),
        body: 'Valid body',
      });
      expect(result.success).toBe(true);
    });

    it('should reject body exceeding 2000 characters', () => {
      const result = responseContentSchema.safeParse({
        subject: 'Valid subject',
        body: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept body at exactly 2000 characters', () => {
      const result = responseContentSchema.safeParse({
        subject: 'Valid subject',
        body: 'x'.repeat(2000),
      });
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Lead Info Schema
  // ==========================================================================

  describe('autoResponseLeadInfoSchema', () => {
    const validLead = {
      id: VALID_UUID,
      name: 'Jane Doe',
      email: 'jane@techcorp.com',
      status: 'NEW',
    };

    it('should accept valid lead info', () => {
      const result = autoResponseLeadInfoSchema.safeParse(validLead);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Jane Doe');
      }
    });

    it('should accept with optional company', () => {
      const lead = { ...validLead, company: 'TechCorp Ltd' };
      const result = autoResponseLeadInfoSchema.safeParse(lead);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const lead = { ...validLead, email: 'not-email' };
      const result = autoResponseLeadInfoSchema.safeParse(lead);
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const lead = { ...validLead, name: '' };
      const result = autoResponseLeadInfoSchema.safeParse(lead);
      expect(result.success).toBe(false);
    });

    it('should reject invalid UUID for id', () => {
      const lead = { ...validLead, id: 'bad-id' };
      const result = autoResponseLeadInfoSchema.safeParse(lead);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = autoResponseLeadInfoSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Tenant Settings Schema
  // ==========================================================================

  describe('tenantSettingsSchema', () => {
    const validSettings = {
      companyName: 'IntelliFlow CRM',
      tone: 'professional' as const,
    };

    it('should accept valid settings with required fields only', () => {
      const result = tenantSettingsSchema.safeParse(validSettings);
      expect(result.success).toBe(true);
    });

    it('should accept all valid tone values', () => {
      ['professional', 'friendly', 'casual', 'formal', 'helpful'].forEach((tone) => {
        const result = tenantSettingsSchema.safeParse({ ...validSettings, tone });
        expect(result.success).toBe(true);
      });
    });

    it('should accept with optional signatureTemplate and customInstructions', () => {
      const settings = {
        ...validSettings,
        signatureTemplate: 'Best regards,\nThe IntelliFlow Team',
        customInstructions: 'Always mention our free trial offer.',
      };
      const result = tenantSettingsSchema.safeParse(settings);
      expect(result.success).toBe(true);
    });

    it('should reject customInstructions exceeding 500 characters', () => {
      const settings = {
        ...validSettings,
        customInstructions: 'x'.repeat(501),
      };
      const result = tenantSettingsSchema.safeParse(settings);
      expect(result.success).toBe(false);
    });

    it('should accept customInstructions at exactly 500 characters', () => {
      const settings = {
        ...validSettings,
        customInstructions: 'x'.repeat(500),
      };
      const result = tenantSettingsSchema.safeParse(settings);
      expect(result.success).toBe(true);
    });

    it('should reject invalid tone value', () => {
      const settings = { ...validSettings, tone: 'aggressive' };
      const result = tenantSettingsSchema.safeParse(settings);
      expect(result.success).toBe(false);
    });

    it('should reject empty companyName', () => {
      const settings = { ...validSettings, companyName: '' };
      const result = tenantSettingsSchema.safeParse(settings);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Context Schema
  // ==========================================================================

  describe('autoResponseContextSchema', () => {
    it('should accept empty object (all fields optional)', () => {
      const result = autoResponseContextSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept email context', () => {
      const result = autoResponseContextSchema.safeParse({
        originalMessage: 'Hi, I am interested in your CRM.',
        originalSubject: 'CRM Inquiry',
        senderDomain: 'techcorp.com',
        messageType: 'inquiry',
      });
      expect(result.success).toBe(true);
    });

    it('should accept form context', () => {
      const result = autoResponseContextSchema.safeParse({
        formName: 'Contact Us',
        formFields: { name: 'Jane Doe', company: 'TechCorp' },
      });
      expect(result.success).toBe(true);
    });

    it('should accept chat context', () => {
      const result = autoResponseContextSchema.safeParse({
        chatHistory: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi, how can I help?' },
        ],
      });
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Create Auto-Response Draft
  // ==========================================================================

  describe('createAutoResponseDraftSchema', () => {
    const validDraft = {
      tenantId: VALID_UUID,
      leadId: VALID_UUID_2,
      triggerType: 'EMAIL_RECEIVED' as const,
      subject: 'Thank you for reaching out',
      body: 'We received your inquiry and will respond within 24 hours.',
      aiConfidence: 0.92,
      recipientEmail: 'jane@techcorp.com',
    };

    it('should accept valid draft with default expiryHours', () => {
      const result = createAutoResponseDraftSchema.safeParse(validDraft);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiryHours).toBe(24);
      }
    });

    it('should accept valid draft with custom expiryHours', () => {
      const draft = { ...validDraft, expiryHours: 48 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.expiryHours).toBe(48);
      }
    });

    it('should reject expiryHours below 1', () => {
      const draft = { ...validDraft, expiryHours: 0 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject expiryHours above 168 (1 week)', () => {
      const draft = { ...validDraft, expiryHours: 169 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should accept expiryHours at boundary 1', () => {
      const draft = { ...validDraft, expiryHours: 1 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(true);
    });

    it('should accept expiryHours at boundary 168', () => {
      const draft = { ...validDraft, expiryHours: 168 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(true);
    });

    it('should reject non-integer expiryHours', () => {
      const draft = { ...validDraft, expiryHours: 24.5 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject aiConfidence above 1', () => {
      const draft = { ...validDraft, aiConfidence: 1.1 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject aiConfidence below 0', () => {
      const draft = { ...validDraft, aiConfidence: -0.1 };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject empty subject', () => {
      const draft = { ...validDraft, subject: '' };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject subject exceeding 100 characters', () => {
      const draft = { ...validDraft, subject: 'x'.repeat(101) };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject body exceeding 2000 characters', () => {
      const draft = { ...validDraft, body: 'x'.repeat(2001) };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject invalid recipientEmail', () => {
      const draft = { ...validDraft, recipientEmail: 'not-email' };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject invalid triggerType', () => {
      const draft = { ...validDraft, triggerType: 'WEBHOOK' };
      const result = createAutoResponseDraftSchema.safeParse(draft);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = createAutoResponseDraftSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Approval Workflow Schemas
  // ==========================================================================

  describe('submitForApprovalSchema', () => {
    it('should accept valid submission', () => {
      const result = submitForApprovalSchema.safeParse({
        draftId: VALID_UUID,
        approverId: VALID_UUID_2,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid draftId', () => {
      const result = submitForApprovalSchema.safeParse({
        draftId: 'bad-id',
        approverId: VALID_UUID_2,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const result = submitForApprovalSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('approvalDecisionSchema', () => {
    const validDecision = {
      draftId: VALID_UUID,
      decision: 'APPROVED' as const,
      decidedBy: VALID_UUID_2,
    };

    it('should accept APPROVED decision', () => {
      const result = approvalDecisionSchema.safeParse(validDecision);
      expect(result.success).toBe(true);
    });

    it('should accept REJECTED decision with reason', () => {
      const decision = {
        ...validDecision,
        decision: 'REJECTED' as const,
        reason: 'Tone is too casual for this client.',
      };
      const result = approvalDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    it('should accept with modifications', () => {
      const decision = {
        ...validDecision,
        modifications: {
          subject: 'Updated Subject Line',
          body: 'Updated body content with more details.',
        },
      };
      const result = approvalDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    it('should accept modifications with only subject', () => {
      const decision = {
        ...validDecision,
        modifications: { subject: 'New Subject' },
      };
      const result = approvalDecisionSchema.safeParse(decision);
      expect(result.success).toBe(true);
    });

    it('should reject invalid decision value', () => {
      const decision = { ...validDecision, decision: 'MAYBE' };
      const result = approvalDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    it('should reject reason exceeding 500 characters', () => {
      const decision = { ...validDecision, reason: 'x'.repeat(501) };
      const result = approvalDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    it('should reject modification subject exceeding 100 chars', () => {
      const decision = {
        ...validDecision,
        modifications: { subject: 'x'.repeat(101) },
      };
      const result = approvalDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });

    it('should reject modification body exceeding 2000 chars', () => {
      const decision = {
        ...validDecision,
        modifications: { body: 'x'.repeat(2001) },
      };
      const result = approvalDecisionSchema.safeParse(decision);
      expect(result.success).toBe(false);
    });
  });

  describe('escalationSchema', () => {
    const validEscalation = {
      draftId: VALID_UUID,
      escalatedTo: VALID_UUID_2,
      reason: 'Customer is a VIP, requires manager review.',
      escalationExpiryHours: 48,
    };

    it('should accept valid escalation with explicit expiryHours', () => {
      const result = escalationSchema.safeParse(validEscalation);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.escalationExpiryHours).toBe(48);
      }
    });

    it('should use default escalationExpiryHours of 48', () => {
      const { escalationExpiryHours, ...withoutExpiry } = validEscalation;
      const result = escalationSchema.safeParse(withoutExpiry);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.escalationExpiryHours).toBe(48);
      }
    });

    it('should reject empty reason', () => {
      const escalation = { ...validEscalation, reason: '' };
      const result = escalationSchema.safeParse(escalation);
      expect(result.success).toBe(false);
    });

    it('should reject reason exceeding 500 characters', () => {
      const escalation = { ...validEscalation, reason: 'x'.repeat(501) };
      const result = escalationSchema.safeParse(escalation);
      expect(result.success).toBe(false);
    });

    it('should reject escalationExpiryHours below 1', () => {
      const escalation = { ...validEscalation, escalationExpiryHours: 0 };
      const result = escalationSchema.safeParse(escalation);
      expect(result.success).toBe(false);
    });

    it('should reject escalationExpiryHours above 168', () => {
      const escalation = { ...validEscalation, escalationExpiryHours: 169 };
      const result = escalationSchema.safeParse(escalation);
      expect(result.success).toBe(false);
    });
  });

  describe('markSentSchema', () => {
    it('should accept valid mark sent input', () => {
      const result = markSentSchema.safeParse({
        draftId: VALID_UUID,
        notificationId: VALID_UUID_2,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid draftId', () => {
      const result = markSentSchema.safeParse({
        draftId: 'bad',
        notificationId: VALID_UUID_2,
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing fields', () => {
      const result = markSentSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('markFailedSchema', () => {
    it('should accept valid mark failed input', () => {
      const result = markFailedSchema.safeParse({
        draftId: VALID_UUID,
        error: 'SMTP connection timeout.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject error exceeding 1000 characters', () => {
      const result = markFailedSchema.safeParse({
        draftId: VALID_UUID,
        error: 'x'.repeat(1001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept error at exactly 1000 characters', () => {
      const result = markFailedSchema.safeParse({
        draftId: VALID_UUID,
        error: 'x'.repeat(1000),
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing draftId', () => {
      const result = markFailedSchema.safeParse({ error: 'Some error' });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Query Schema
  // ==========================================================================

  describe('autoResponseQuerySchema', () => {
    it('should accept empty query with pagination defaults', () => {
      const result = autoResponseQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should accept query with all filters', () => {
      const query = {
        page: 2,
        limit: 50,
        sortBy: 'createdAt',
        sortOrder: 'asc' as const,
        tenantId: VALID_UUID,
        leadId: VALID_UUID_2,
        status: ['DRAFT' as const, 'PENDING_APPROVAL' as const],
        triggerType: ['EMAIL_RECEIVED' as const],
        pendingApproval: true,
        expired: false,
        createdFrom: '2026-01-01T00:00:00Z',
        createdTo: '2026-02-01T00:00:00Z',
      };
      const result = autoResponseQuerySchema.safeParse(query);
      expect(result.success).toBe(true);
    });

    it('should reject limit exceeding 100', () => {
      const result = autoResponseQuerySchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });

    it('should reject page of 0', () => {
      const result = autoResponseQuerySchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject negative limit', () => {
      const result = autoResponseQuerySchema.safeParse({ limit: -1 });
      expect(result.success).toBe(false);
    });

    it('should reject invalid status in status array', () => {
      const result = autoResponseQuerySchema.safeParse({ status: ['INVALID'] });
      expect(result.success).toBe(false);
    });

    it('should reject invalid triggerType in array', () => {
      const result = autoResponseQuerySchema.safeParse({ triggerType: ['WEBHOOK'] });
      expect(result.success).toBe(false);
    });

    it('should reject invalid tenantId format', () => {
      const result = autoResponseQuerySchema.safeParse({ tenantId: 'bad-uuid' });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Status Change Schema
  // ==========================================================================

  describe('statusChangeSchema', () => {
    it('should accept valid status change', () => {
      const result = statusChangeSchema.safeParse({
        status: 'APPROVED',
        changedAt: '2026-02-05T10:00:00Z',
        changedBy: VALID_UUID,
        reason: 'Looks good to send.',
      });
      expect(result.success).toBe(true);
    });

    it('should accept without optional changedBy and reason', () => {
      const result = statusChangeSchema.safeParse({
        status: 'DRAFT',
        changedAt: new Date(),
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const result = statusChangeSchema.safeParse({
        status: 'DELETED',
        changedAt: new Date(),
      });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // AI Chain Input/Output
  // ==========================================================================

  describe('autoResponseChainInputSchema', () => {
    const validInput = {
      triggerType: 'EMAIL_RECEIVED' as const,
      leadInfo: {
        id: VALID_UUID,
        name: 'Jane Doe',
        email: 'jane@techcorp.com',
        status: 'NEW',
      },
      context: {
        originalMessage: 'Hi, I am interested in your CRM.',
        originalSubject: 'CRM Inquiry',
      },
      tenantSettings: {
        companyName: 'IntelliFlow',
        tone: 'professional' as const,
      },
    };

    it('should accept valid chain input', () => {
      const result = autoResponseChainInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('should reject invalid triggerType', () => {
      const input = { ...validInput, triggerType: 'SMS' };
      const result = autoResponseChainInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid lead info', () => {
      const input = {
        ...validInput,
        leadInfo: { ...validInput.leadInfo, email: 'bad-email' },
      };
      const result = autoResponseChainInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing tenantSettings', () => {
      const { tenantSettings, ...withoutSettings } = validInput;
      const result = autoResponseChainInputSchema.safeParse(withoutSettings);
      expect(result.success).toBe(false);
    });
  });

  describe('autoResponseChainOutputSchema', () => {
    const validOutput = {
      subject: 'Thank you for your inquiry',
      body: 'We appreciate you reaching out to IntelliFlow.',
      confidence: 0.95,
      modelVersion: 'auto-response-v1.2',
    };

    it('should accept valid chain output', () => {
      const result = autoResponseChainOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('should accept with optional tone and suggestedFollowUp', () => {
      const output = {
        ...validOutput,
        tone: 'professional',
        suggestedFollowUp: 'Send product brochure in 2 days.',
      };
      const result = autoResponseChainOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it('should reject subject exceeding 100 characters', () => {
      const output = { ...validOutput, subject: 'x'.repeat(101) };
      const result = autoResponseChainOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject body exceeding 2000 characters', () => {
      const output = { ...validOutput, body: 'x'.repeat(2001) };
      const result = autoResponseChainOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject confidence above 1', () => {
      const output = { ...validOutput, confidence: 1.1 };
      const result = autoResponseChainOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject confidence below 0', () => {
      const output = { ...validOutput, confidence: -0.1 };
      const result = autoResponseChainOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
    });

    it('should reject missing modelVersion', () => {
      const { modelVersion, ...withoutVersion } = validOutput;
      const result = autoResponseChainOutputSchema.safeParse(withoutVersion);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Validation Result
  // ==========================================================================

  describe('autoResponseValidationResultSchema', () => {
    it('should accept valid result with no issues', () => {
      const result = autoResponseValidationResultSchema.safeParse({
        valid: true,
        issues: [],
      });
      expect(result.success).toBe(true);
    });

    it('should accept invalid result with issues', () => {
      const result = autoResponseValidationResultSchema.safeParse({
        valid: false,
        issues: ['Subject too short', 'Body contains prohibited terms'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.issues).toHaveLength(2);
      }
    });

    it('should reject missing valid field', () => {
      const result = autoResponseValidationResultSchema.safeParse({
        issues: [],
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing issues field', () => {
      const result = autoResponseValidationResultSchema.safeParse({
        valid: true,
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-boolean valid field', () => {
      const result = autoResponseValidationResultSchema.safeParse({
        valid: 'yes',
        issues: [],
      });
      expect(result.success).toBe(false);
    });
  });
});
