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
  .refine(
    (tz) => tz === 'UTC' || tz.includes('/'),
    { message: 'Timezone must be a canonical IANA identifier (e.g. America/New_York) or UTC' }
  )
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
