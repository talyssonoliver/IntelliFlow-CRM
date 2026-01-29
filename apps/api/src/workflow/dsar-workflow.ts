import { z } from 'zod';
import { randomBytes } from 'crypto';

/**
 * Data Subject Access Request (DSAR) Workflow - IFC-140
 *
 * Implements GDPR Article 15-22 data subject rights:
 * - Right to access
 * - Right to erasure
 * - Right to rectification
 * - Right to data portability
 * - Right to restrict processing
 * - Right to object
 *
 * SLA: 30 days from verified request
 */

// ============================================
// TYPES & SCHEMAS
// ============================================

export const dsarRequestSchema = z.object({
  requestType: z.enum(['access', 'erasure', 'rectification', 'portability', 'restriction', 'objection']),
  subjectId: z.string().uuid(),
  subjectEmail: z.string().email(),
  requestDetails: z.string().optional(),
  preferredFormat: z.enum(['json', 'csv', 'pdf']).default('json'),
});

export type DSARRequest = z.infer<typeof dsarRequestSchema>;

export interface DSARWorkflowState {
  requestId: string;
  status: 'pending' | 'verified' | 'processing' | 'completed' | 'rejected';
  verificationToken?: string;
  verificationSentAt?: Date;
  verifiedAt?: Date;
  processedAt?: Date;
  completedAt?: Date;
  dataExportUrl?: string;
  slaDeadline: Date;
  notes: string[];
}

export interface DataExportResult {
  format: 'json' | 'csv' | 'pdf';
  data: {
    leads?: unknown[];
    contacts?: unknown[];
    accounts?: unknown[];
    opportunities?: unknown[];
    tasks?: unknown[];
    audit_logs?: unknown[];
    consents?: unknown[];
  };
  metadata: {
    exportedAt: string;
    recordCount: number;
    tables: string[];
    dataSubjectId: string;
  };
}

// ============================================
// DSAR WORKFLOW CLASS
// ============================================

export class DSARWorkflow {
  private readonly db: any; // Replace with actual Prisma client
  private readonly emailService: any; // Replace with actual email service
  private readonly storageService: any; // Replace with S3/storage service

  constructor(db: any, emailService: any, storageService: any) {
    this.db = db;
    this.emailService = emailService;
    this.storageService = storageService;
  }

  /**
   * Step 1: Initiate DSAR request
   * Sends verification email to data subject
   */
  async initiateDSAR(request: DSARRequest): Promise<DSARWorkflowState> {
    // Validate request
    const validatedRequest = dsarRequestSchema.parse(request);

    // Generate verification token
    const verificationToken = this.generateVerificationToken();

    // Calculate SLA deadline (30 days from now)
    const slaDeadline = new Date();
    slaDeadline.setDate(slaDeadline.getDate() + 30);

    // Create DSAR request in database
    const dsarRecord = await this.db.data_subject_requests.create({
      data: {
        request_type: validatedRequest.requestType,
        subject_id: validatedRequest.subjectId,
        subject_email: validatedRequest.subjectEmail,
        verification_token: verificationToken,
        status: 'pending',
        sla_deadline: slaDeadline,
        notes: validatedRequest.requestDetails || '',
      },
    });

    // Send verification email
    await this.sendVerificationEmail(
      validatedRequest.subjectEmail,
      verificationToken,
      dsarRecord.id
    );

    // Log the request
    await this.logDSAREvent(dsarRecord.id, 'initiated', {
      requestType: validatedRequest.requestType,
      email: validatedRequest.subjectEmail,
    });

    return {
      requestId: dsarRecord.id,
      status: 'pending',
      verificationToken,
      verificationSentAt: new Date(),
      slaDeadline,
      notes: ['DSAR request initiated', 'Verification email sent'],
    };
  }

  /**
   * Step 2: Verify identity
   * User clicks link in email with verification token
   */
  async verifyIdentity(requestId: string, token: string): Promise<boolean> {
    const dsarRecord = await this.db.data_subject_requests.findUnique({
      where: { id: requestId },
    });

    if (!dsarRecord) {
      throw new Error('DSAR request not found');
    }

    if (dsarRecord.status !== 'pending') {
      throw new Error('DSAR request already processed');
    }

    if (dsarRecord.verification_token !== token) {
      await this.logDSAREvent(requestId, 'verification_failed', {
        reason: 'Invalid token',
      });
      return false;
    }

    // Check token age (expire after 48 hours)
    const tokenAge = Date.now() - new Date(dsarRecord.requested_at).getTime();
    const maxAge = 48 * 60 * 60 * 1000; // 48 hours

    if (tokenAge > maxAge) {
      await this.logDSAREvent(requestId, 'verification_failed', {
        reason: 'Token expired',
      });
      return false;
    }

    // Mark as verified
    await this.db.data_subject_requests.update({
      where: { id: requestId },
      data: {
        status: 'verified',
        verified_at: new Date(),
      },
    });

    await this.logDSAREvent(requestId, 'verified', {
      verifiedAt: new Date().toISOString(),
    });

    // Auto-process the request
    await this.processDSAR(requestId);

    return true;
  }

  /**
   * Step 3: Process DSAR request
   * Executes the actual data operation
   */
  async processDSAR(requestId: string): Promise<void> {
    const dsarRecord = await this.db.data_subject_requests.findUnique({
      where: { id: requestId },
    });

    if (!dsarRecord || dsarRecord.status !== 'verified') {
      throw new Error('DSAR request not ready for processing');
    }

    // Update status to processing
    await this.db.data_subject_requests.update({
      where: { id: requestId },
      data: { status: 'processing' },
    });

    await this.logDSAREvent(requestId, 'processing_started', {});

    try {
      // Execute based on request type
      switch (dsarRecord.request_type) {
        case 'access':
          await this.handleAccessRequest(requestId, dsarRecord);
          break;
        case 'erasure':
          await this.handleErasureRequest(requestId, dsarRecord);
          break;
        case 'rectification':
          await this.handleRectificationRequest(requestId, dsarRecord);
          break;
        case 'portability':
          await this.handlePortabilityRequest(requestId, dsarRecord);
          break;
        case 'restriction':
          await this.handleRestrictionRequest(requestId, dsarRecord);
          break;
        case 'objection':
          await this.handleObjectionRequest(requestId, dsarRecord);
          break;
      }

      // Mark as completed
      await this.db.data_subject_requests.update({
        where: { id: requestId },
        data: {
          status: 'completed',
          completed_at: new Date(),
        },
      });

      await this.logDSAREvent(requestId, 'completed', {
        completedAt: new Date().toISOString(),
      });

      // Send completion email
      await this.sendCompletionEmail(dsarRecord.subject_email, dsarRecord.request_type);
    } catch (error) {
      await this.logDSAREvent(requestId, 'processing_failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.db.data_subject_requests.update({
        where: { id: requestId },
        data: { status: 'rejected' },
      });

      throw error;
    }
  }

  /**
   * Handle access request (Article 15)
   * Provide copy of all personal data
   */
  private async handleAccessRequest(requestId: string, dsarRecord: any): Promise<void> {
    const subjectId = dsarRecord.subject_id;

    // Gather all data for this subject
    const exportData: DataExportResult = {
      format: 'json',
      data: {},
      metadata: {
        exportedAt: new Date().toISOString(),
        recordCount: 0,
        tables: [],
        dataSubjectId: subjectId,
      },
    };

    // Export leads
    const leads = await this.db.leads.findMany({
      where: { ownerId: subjectId },
    });
    if (leads.length > 0) {
      exportData.data.leads = leads;
      exportData.metadata.tables.push('leads');
      exportData.metadata.recordCount += leads.length;
    }

    // Export contacts
    const contacts = await this.db.contacts.findMany({
      where: { ownerId: subjectId },
    });
    if (contacts.length > 0) {
      exportData.data.contacts = contacts;
      exportData.metadata.tables.push('contacts');
      exportData.metadata.recordCount += contacts.length;
    }

    // Export accounts
    const accounts = await this.db.accounts.findMany({
      where: { ownerId: subjectId },
    });
    if (accounts.length > 0) {
      exportData.data.accounts = accounts;
      exportData.metadata.tables.push('accounts');
      exportData.metadata.recordCount += accounts.length;
    }

    // Export opportunities
    const opportunities = await this.db.opportunities.findMany({
      where: { ownerId: subjectId },
    });
    if (opportunities.length > 0) {
      exportData.data.opportunities = opportunities;
      exportData.metadata.tables.push('opportunities');
      exportData.metadata.recordCount += opportunities.length;
    }

    // Export tasks
    const tasks = await this.db.tasks.findMany({
      where: { ownerId: subjectId },
    });
    if (tasks.length > 0) {
      exportData.data.tasks = tasks;
      exportData.metadata.tables.push('tasks');
      exportData.metadata.recordCount += tasks.length;
    }

    // Export audit logs
    const auditLogs = await this.db.audit_logs.findMany({
      where: { userId: subjectId },
    });
    if (auditLogs.length > 0) {
      exportData.data.audit_logs = auditLogs;
      exportData.metadata.tables.push('audit_logs');
      exportData.metadata.recordCount += auditLogs.length;
    }

    // Export consents
    const consents = await this.db.consents.findMany({
      where: { subject_id: subjectId },
    });
    if (consents.length > 0) {
      exportData.data.consents = consents;
      exportData.metadata.tables.push('consents');
      exportData.metadata.recordCount += consents.length;
    }

    // Upload to storage
    const exportUrl = await this.uploadDataExport(requestId, exportData);

    // Update DSAR record with export URL
    await this.db.data_subject_requests.update({
      where: { id: requestId },
      data: { data_export_url: exportUrl },
    });

    await this.logDSAREvent(requestId, 'data_exported', {
      recordCount: exportData.metadata.recordCount,
      tables: exportData.metadata.tables,
      exportUrl,
    });
  }

  /**
   * Handle erasure request (Article 17)
   * Anonymize all personal data
   */
  private async handleErasureRequest(requestId: string, dsarRecord: any): Promise<void> {
    const subjectId = dsarRecord.subject_id;

    // Check for legal holds
    const legalHolds = await this.db.legal_holds.findMany({
      where: {
        record_id: subjectId,
        released_at: null,
      },
    });

    if (legalHolds.length > 0) {
      throw new Error(
        'Cannot erase data: subject is under legal hold in ' +
          legalHolds.map((h: any) => h.case_reference).join(', ')
      );
    }

    // Anonymize data using SQL function
    const tables = ['leads', 'contacts', 'accounts'];
    for (const table of tables) {
      await this.db.$executeRaw`SELECT anonymize_record(${table}, ${subjectId}::uuid)`;
    }

    await this.logDSAREvent(requestId, 'data_erased', {
      subjectId,
      tablesAnonymized: tables,
    });
  }

  /**
   * Handle rectification request (Article 16)
   * Allow correction of inaccurate data
   */
  private async handleRectificationRequest(requestId: string, dsarRecord: any): Promise<void> {
    // In practice, this would require user input for corrections
    // For now, we just log the request and send instructions

    await this.logDSAREvent(requestId, 'rectification_requested', {
      instructions: 'User will be provided with portal to update their data',
    });

    // Send email with link to update profile
    await this.emailService.send({
      to: dsarRecord.subject_email,
      subject: 'Data Rectification - Update Your Information',
      body: `You can update your personal information at: ${process.env.APP_URL}/profile`,
    });
  }

  /**
   * Handle portability request (Article 20)
   * Export in machine-readable format
   */
  private async handlePortabilityRequest(requestId: string, dsarRecord: any): Promise<void> {
    // Same as access request, but ensure machine-readable format
    await this.handleAccessRequest(requestId, dsarRecord);
  }

  /**
   * Handle restriction request (Article 18)
   * Temporarily halt processing
   */
  private async handleRestrictionRequest(requestId: string, dsarRecord: any): Promise<void> {
    const subjectId = dsarRecord.subject_id;

    // Place legal hold to prevent deletion
    await this.db.legal_holds.create({
      data: {
        case_reference: `DSAR-RESTRICTION-${requestId}`,
        table_name: 'users',
        record_id: subjectId,
        hold_reason: 'Data subject requested processing restriction (GDPR Article 18)',
        placed_by: subjectId, // Self-imposed hold
      },
    });

    await this.logDSAREvent(requestId, 'processing_restricted', {
      subjectId,
      holdPlaced: true,
    });
  }

  /**
   * Handle objection request (Article 21)
   * Stop processing for specific purposes
   */
  private async handleObjectionRequest(requestId: string, dsarRecord: any): Promise<void> {
    const subjectId = dsarRecord.subject_id;

    // Withdraw consent for marketing and analytics
    await this.db.consents.updateMany({
      where: {
        subject_id: subjectId,
        purpose: { in: ['marketing', 'analytics', 'profiling'] },
      },
      data: {
        given: false,
        withdrawn_at: new Date(),
      },
    });

    await this.logDSAREvent(requestId, 'objection_processed', {
      subjectId,
      consentsWithdrawn: ['marketing', 'analytics', 'profiling'],
    });
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  private generateVerificationToken(): string {
    return randomBytes(32).toString('hex');
  }

  private async sendVerificationEmail(
    email: string,
    token: string,
    requestId: string
  ): Promise<void> {
    const verificationUrl = `${process.env.APP_URL}/dsar/verify?requestId=${requestId}&token=${token}`;

    await this.emailService.send({
      to: email,
      subject: 'Verify Your Data Subject Access Request',
      body: `
        <p>We received a data subject access request for this email address.</p>
        <p>To verify your identity and proceed with the request, please click the link below:</p>
        <p><a href="${verificationUrl}">Verify Identity</a></p>
        <p>This link will expire in 48 hours.</p>
        <p>If you did not make this request, please ignore this email.</p>
      `,
    });
  }

  private async sendCompletionEmail(email: string, requestType: string): Promise<void> {
    await this.emailService.send({
      to: email,
      subject: `Your ${requestType} request has been completed`,
      body: `
        <p>Your data subject ${requestType} request has been successfully processed.</p>
        <p>If this was an access or portability request, you should have received a separate email with your data export.</p>
        <p>If you have any questions, please contact our Data Protection Officer.</p>
      `,
    });
  }

  private async uploadDataExport(requestId: string, data: DataExportResult): Promise<string> {
    const fileName = `dsar-export-${requestId}-${Date.now()}.json`;

    // In production, upload to S3/storage service
    // For now, return a placeholder URL
    const uploadUrl = await this.storageService.upload(fileName, JSON.stringify(data, null, 2));

    return uploadUrl;
  }

  private async logDSAREvent(
    requestId: string,
    event: string,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await this.db.audit_logs.create({
      data: {
        entity_type: 'data_subject_request',
        entity_id: requestId,
        action: event.toUpperCase(),
        metadata: metadata as any,
      },
    });

    console.log(`[DSAR] ${event}:`, { requestId, ...metadata });
  }

  /**
   * Get DSAR request status
   */
  async getStatus(requestId: string): Promise<DSARWorkflowState> {
    const dsarRecord = await this.db.data_subject_requests.findUnique({
      where: { id: requestId },
    });

    if (!dsarRecord) {
      throw new Error('DSAR request not found');
    }

    return {
      requestId: dsarRecord.id,
      status: dsarRecord.status,
      verifiedAt: dsarRecord.verified_at,
      completedAt: dsarRecord.completed_at,
      dataExportUrl: dsarRecord.data_export_url,
      slaDeadline: dsarRecord.sla_deadline,
      notes: dsarRecord.notes ? [dsarRecord.notes] : [],
    };
  }

  /**
   * Get overdue DSAR requests (past SLA)
   */
  async getOverdueRequests(): Promise<any[]> {
    return await this.db.data_subject_requests.findMany({
      where: {
        sla_deadline: { lt: new Date() },
        status: { notIn: ['completed', 'rejected'] },
      },
      orderBy: { sla_deadline: 'asc' },
    });
  }
}

/**
 * Factory function to create DSAR workflow instance
 */
export function createDSARWorkflow(db: any, emailService: any, storageService: any): DSARWorkflow {
  return new DSARWorkflow(db, emailService, storageService);
}
