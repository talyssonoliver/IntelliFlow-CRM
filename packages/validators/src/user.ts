/**
 * User Validators
 *
 * Zod schemas for user profile and timezone operations.
 *
 * Task: IFC-191 — User Timezone Support
 */

import { z } from 'zod';

/**
 * Validates a canonical IANA timezone string.
 * Requires either a region/city format (contains '/') or exactly 'UTC'.
 * Rejects non-canonical aliases like 'EST', 'GMT', 'PST' that Node.js Intl accepts.
 */
export const timezoneSchema = z
  .string()
  .min(1, 'Timezone is required')
  .refine((tz) => tz === 'UTC' || tz.includes('/'), {
    message: 'Timezone must be a canonical IANA identifier (e.g. America/New_York) or UTC',
  })
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid IANA timezone identifier' }
  );

/**
 * Input schema for updating user timezone.
 */
export const updateTimezoneInputSchema = z.object({
  timezone: timezoneSchema,
});

export type UpdateTimezoneInput = z.infer<typeof updateTimezoneInputSchema>;

/**
 * User profile response schema.
 */
export const userProfileSchema = z.object({
  name: z.string().nullable(),
  email: z.string(),
  role: z.string(),
  timezone: z.string().nullable(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;

/**
 * Input schema for updating user profile.
 * All fields are optional — only provided fields are updated.
 */
export const updateProfileInputSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  givenName: z.string().max(80).nullable().optional(),
  familyName: z.string().max(80).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  company: z.string().max(120).nullable().optional(),
  department: z.string().max(120).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  website: z.string().max(255).nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  locale: z.string().max(20).nullable().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>;
