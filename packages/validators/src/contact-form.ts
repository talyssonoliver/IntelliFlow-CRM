import { z } from 'zod';
import { emailSchema, nameSchema, phoneSchema } from './common';

/**
 * Contact form validation schema
 * Used for public-facing contact page submissions
 */
export const contactFormSchema = z.object({
  // Required fields
  name: nameSchema,
  email: emailSchema,

  // Optional fields
  phone: phoneSchema,
  company: z.string().max(100).optional().nullable(),
  subject: z.string().min(3, 'Subject must be at least 3 characters').max(200).optional().nullable(),
  message: z.string().min(10, 'Message must be at least 10 characters').max(2000, 'Message is too long'),

  // Spam prevention (honeypot field - should remain empty)
  website: z.string().max(0, 'Invalid submission').optional().default(''),
});

export type ContactFormInput = z.infer<typeof contactFormSchema>;

/**
 * Email payload schema (for email handler service)
 */
export const contactEmailPayloadSchema = z.object({
  to: emailSchema,
  from: emailSchema,
  replyTo: emailSchema,
  subject: z.string().min(1),
  htmlBody: z.string().min(1),
  textBody: z.string().min(1),
  metadata: z.object({
    source: z.literal('contact-form'),
    submittedAt: z.string().datetime(),
    name: z.string(),
    company: z.string().optional().nullable(),
  }),
});

export type ContactEmailPayload = z.infer<typeof contactEmailPayloadSchema>;
