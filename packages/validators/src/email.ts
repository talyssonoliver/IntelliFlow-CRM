import { z } from 'zod';

// Email ID uses cuid() not UUID — use z.string()
export const MarkAsReadInputSchema = z.object({
  emailId: z.string(),
  threadId: z.string().optional(),
});

export const GetUnreadCountsInputSchema = z.object({
  folders: z.array(z.string()).optional(),
});

export const UnreadCountsSchema = z.record(z.string(), z.number().int().nonnegative());
