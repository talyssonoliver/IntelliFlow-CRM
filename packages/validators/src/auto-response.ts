import { z } from 'zod';
import { idSchema, paginationSchema } from './common';
import {
  AUTO_RESPONSE_STATUSES,
  TRIGGER_TYPES,
  ALLOWED_LEAD_STATUSES,
} from '@intelliflow/domain';

// Re-export common schemas used by API routers
export { idSchema } from './common';

// Enums - derived from domain constants (single source of truth)
export const autoResponseStatusSchema = z.enum(AUTO_RESPONSE_STATUSES);
export const triggerTypeSchema = z.enum(TRIGGER_TYPES);
export const allowedLeadStatusSchema = z.enum(ALLOWED_LEAD_STATUSES);

export type AutoResponseStatus = z.infer<typeof autoResponseStatusSchema>;
export type TriggerType = z.infer<typeof triggerTypeSchema>;
export type AllowedLeadStatus = z.infer<typeof allowedLeadStatusSchema>;

// Response Content Schema (matches ResponseContent value object constraints)
export const responseContentSchema = z.object({
  subject: z.string().min(1).max(100),
  body: z.string().min(1).max(2000),
});

export type ResponseContentInput = z.infer<typeof responseContentSchema>;

// Lead Info Schema (for AI chain input)
export const autoResponseLeadInfoSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().optional(),
  status: z.string(), // Validated separately against allowed statuses
});

export type AutoResponseLeadInfo = z.infer<typeof autoResponseLeadInfoSchema>;

// Tenant Settings Schema
export const tenantSettingsSchema = z.object({
  companyName: z.string().min(1),
  tone: z.enum(['professional', 'friendly', 'casual', 'formal', 'helpful']),
  signatureTemplate: z.string().optional(),
  customInstructions: z.string().max(500).optional(),
});

export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

// Context Schema (varies by trigger type)
export const autoResponseContextSchema = z.object({
  // For EMAIL_RECEIVED
  originalMessage: z.string().optional(),
  originalSubject: z.string().optional(),
  senderDomain: z.string().optional(),
  messageType: z.string().optional(),
  // For FORM_SUBMIT
  formName: z.string().optional(),
  formFields: z.record(z.string()).optional(),
  // For CHAT_MESSAGE
  chatHistory: z
    .array(
      z.object({
        role: z.string(),
        content: z.string(),
      })
    )
    .optional(),
});

export type AutoResponseContext = z.infer<typeof autoResponseContextSchema>;

// Create Auto-Response Draft Schema
export const createAutoResponseDraftSchema = z.object({
  tenantId: idSchema,
  leadId: idSchema,
  triggerType: triggerTypeSchema,
  subject: z.string().min(1).max(100),
  body: z.string().min(1).max(2000),
  aiConfidence: z.number().min(0).max(1),
  recipientEmail: z.string().email(),
  expiryHours: z.number().int().min(1).max(168).default(24), // 1 hour to 1 week
});

export type CreateAutoResponseDraftInput = z.infer<typeof createAutoResponseDraftSchema>;

// Submit for Approval Schema
export const submitForApprovalSchema = z.object({
  draftId: idSchema,
  approverId: idSchema,
});

export type SubmitForApprovalInput = z.infer<typeof submitForApprovalSchema>;

// Approval Decision Schema
export const approvalDecisionSchema = z.object({
  draftId: idSchema,
  decision: z.enum(['APPROVED', 'REJECTED']),
  decidedBy: idSchema,
  reason: z.string().max(500).optional(),
  modifications: z
    .object({
      subject: z.string().min(1).max(100).optional(),
      body: z.string().min(1).max(2000).optional(),
    })
    .optional(),
});

export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;

// Escalation Schema
export const escalationSchema = z.object({
  draftId: idSchema,
  escalatedTo: idSchema,
  reason: z.string().min(1).max(500),
  escalationExpiryHours: z.number().int().min(1).max(168).default(48),
});

export type EscalationInput = z.infer<typeof escalationSchema>;

// Mark Sent Schema
export const markSentSchema = z.object({
  draftId: idSchema,
  notificationId: idSchema,
});

export type MarkSentInput = z.infer<typeof markSentSchema>;

// Mark Failed Schema
export const markFailedSchema = z.object({
  draftId: idSchema,
  error: z.string().max(1000),
});

export type MarkFailedInput = z.infer<typeof markFailedSchema>;

// Auto-Response Query Schema
export const autoResponseQuerySchema = paginationSchema.extend({
  tenantId: idSchema.optional(),
  leadId: idSchema.optional(),
  status: z.array(autoResponseStatusSchema).optional(),
  triggerType: z.array(triggerTypeSchema).optional(),
  pendingApproval: z.boolean().optional(),
  expired: z.boolean().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
});

export type AutoResponseQueryInput = z.infer<typeof autoResponseQuerySchema>;

// Status Change Schema (for history)
export const statusChangeSchema = z.object({
  status: autoResponseStatusSchema,
  changedAt: z.coerce.date(),
  changedBy: idSchema.optional(),
  reason: z.string().optional(),
});

export type StatusChange = z.infer<typeof statusChangeSchema>;

// Auto-Response Draft Response Schema
export const autoResponseDraftResponseSchema = z.object({
  id: idSchema,
  tenantId: idSchema,
  leadId: idSchema,
  triggerType: triggerTypeSchema,
  subject: z.string(),
  body: z.string(),
  aiConfidence: z.number(),
  status: autoResponseStatusSchema,
  statusHistory: z.array(statusChangeSchema),
  approvalDecision: z
    .object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      decidedBy: idSchema,
      decidedAt: z.coerce.date(),
      reason: z.string().optional(),
      modifications: z
        .object({
          subject: z.string().optional(),
          body: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  escalation: z
    .object({
      reason: z.string(),
      escalatedTo: idSchema,
      escalatedBy: idSchema,
      escalatedAt: z.coerce.date(),
      expiresAt: z.coerce.date(),
      resolvedAt: z.coerce.date().optional(),
    })
    .optional(),
  recipientEmail: z.string().email(),
  createdAt: z.coerce.date(),
  expiresAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  isExpired: z.boolean(),
  isPendingApproval: z.boolean(),
  canBeSent: z.boolean(),
});

export type AutoResponseDraftResponse = z.infer<typeof autoResponseDraftResponseSchema>;

// Auto-Response List Response Schema
export const autoResponseListResponseSchema = z.object({
  drafts: z.array(autoResponseDraftResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  hasMore: z.boolean(),
});

export type AutoResponseListResponse = z.infer<typeof autoResponseListResponseSchema>;

// AI Chain Input Schema (for AutoResponseChain)
export const autoResponseChainInputSchema = z.object({
  triggerType: triggerTypeSchema,
  leadInfo: autoResponseLeadInfoSchema,
  context: autoResponseContextSchema,
  tenantSettings: tenantSettingsSchema,
});

export type AutoResponseChainInput = z.infer<typeof autoResponseChainInputSchema>;

// AI Chain Output Schema (for AutoResponseChain)
export const autoResponseChainOutputSchema = z.object({
  subject: z.string().max(100),
  body: z.string().max(2000),
  confidence: z.number().min(0).max(1),
  modelVersion: z.string(),
  tone: z.string().optional(),
  suggestedFollowUp: z.string().optional(),
});

export type AutoResponseChainOutput = z.infer<typeof autoResponseChainOutputSchema>;

// Auto-Response Validation Result Schema
export const autoResponseValidationResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.string()),
});

export type AutoResponseValidationResult = z.infer<typeof autoResponseValidationResultSchema>;
