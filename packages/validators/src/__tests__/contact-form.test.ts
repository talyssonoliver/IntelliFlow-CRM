/**
 * Contact Form Validators Tests
 *
 * Tests the Zod validation schemas for public contact form submissions
 * and email payload generation.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import { contactFormSchema, contactEmailPayloadSchema } from '../contact-form';

describe('Contact Form Validators', () => {
  // =============================================================================
  // contactFormSchema
  // =============================================================================

  describe('contactFormSchema', () => {
    const validInput = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      message: 'Hello, I would like to learn more about your CRM product.',
    };

    it('should accept valid input with required fields only', () => {
      const result = contactFormSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Jane Doe');
        expect(result.data.email).toBe('jane@example.com');
        expect(result.data.message).toBe(
          'Hello, I would like to learn more about your CRM product.'
        );
        // website honeypot should default to ''
        expect(result.data.website).toBe('');
      }
    });

    it('should accept valid input with all optional fields', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        phone: '+44 7700 900000',
        company: 'Acme Corp',
        subject: 'Product inquiry',
      });
      expect(result.success).toBe(true);
    });

    it('should accept null for nullable optional fields', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        company: null,
        subject: null,
      });
      expect(result.success).toBe(true);
    });

    it('should lowercase email', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        email: 'Jane@Example.COM',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.email).toBe('jane@example.com');
      }
    });

    it('should trim name', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        name: '  Jane Doe  ',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Jane Doe');
      }
    });

    it('should reject empty name', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        name: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject name exceeding 100 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        name: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid email format', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty email', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        email: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject message shorter than 10 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        message: 'Hi',
      });
      expect(result.success).toBe(false);
    });

    it('should accept message at exactly 10 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        message: 'Hello, hi!',
      });
      expect(result.success).toBe(true);
    });

    it('should reject message exceeding 2000 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        message: 'x'.repeat(2001),
      });
      expect(result.success).toBe(false);
    });

    it('should accept message at exactly 2000 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        message: 'x'.repeat(2000),
      });
      expect(result.success).toBe(true);
    });

    it('should reject subject shorter than 3 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        subject: 'Hi',
      });
      expect(result.success).toBe(false);
    });

    it('should accept subject at exactly 3 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        subject: 'Hey',
      });
      expect(result.success).toBe(true);
    });

    it('should reject subject exceeding 200 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        subject: 'x'.repeat(201),
      });
      expect(result.success).toBe(false);
    });

    it('should reject company exceeding 100 characters', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        company: 'C'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('should reject non-empty website (honeypot field)', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        website: 'http://spam.com',
      });
      expect(result.success).toBe(false);
    });

    it('should accept empty string for website (honeypot)', () => {
      const result = contactFormSchema.safeParse({
        ...validInput,
        website: '',
      });
      expect(result.success).toBe(true);
    });

    it('should default website to empty string when omitted', () => {
      const result = contactFormSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.website).toBe('');
      }
    });

    it('should reject missing required fields', () => {
      const result = contactFormSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject missing email', () => {
      const { email, ...rest } = validInput;
      const result = contactFormSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing message', () => {
      const { message, ...rest } = validInput;
      const result = contactFormSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });
  });

  // =============================================================================
  // contactEmailPayloadSchema
  // =============================================================================

  describe('contactEmailPayloadSchema', () => {
    const validPayload = {
      to: 'support@intelliflow.com',
      from: 'noreply@intelliflow.com',
      replyTo: 'jane@example.com',
      subject: 'New contact form submission',
      htmlBody: '<h1>New message from Jane</h1>',
      textBody: 'New message from Jane',
      metadata: {
        source: 'contact-form' as const,
        submittedAt: '2025-12-20T14:00:00.000Z',
        name: 'Jane Doe',
      },
    };

    it('should accept valid email payload', () => {
      const result = contactEmailPayloadSchema.safeParse(validPayload);
      expect(result.success).toBe(true);
    });

    it('should accept payload with optional company in metadata', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          company: 'Acme Corp',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should accept null company in metadata', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          company: null,
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid "to" email', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        to: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid "from" email', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        from: 'not-an-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid "replyTo" email', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        replyTo: 'bad-email',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty subject', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        subject: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty htmlBody', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        htmlBody: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty textBody', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        textBody: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject wrong source literal in metadata', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          source: 'newsletter',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid datetime in metadata.submittedAt', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        metadata: {
          ...validPayload.metadata,
          submittedAt: 'not-a-datetime',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing metadata', () => {
      const { metadata, ...rest } = validPayload;
      const result = contactEmailPayloadSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('should reject missing metadata.name', () => {
      const result = contactEmailPayloadSchema.safeParse({
        ...validPayload,
        metadata: {
          source: 'contact-form',
          submittedAt: '2025-12-20T14:00:00.000Z',
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = contactEmailPayloadSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });
});
