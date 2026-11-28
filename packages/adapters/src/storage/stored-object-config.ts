/**
 * Where this deployment's stored files live (IFC-316): the storage host and the one bucket the
 * CRM writes files to (email attachments, honouring EMAIL_ATTACHMENTS_BUCKET). The erasure sorts
 * locators with it and the storage adapter deletes only from that bucket. Read from the environment each call, so a test can set it.
 */
import type { StoredObjectConfig } from '@intelliflow/domain';

export function storedObjectConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): StoredObjectConfig {
  let storageHost: string | null = null;
  try {
    if (env.SUPABASE_URL) storageHost = new URL(env.SUPABASE_URL).host;
  } catch {
    storageHost = null;
  }
  return {
    storageHost,
    emailBucket: env.EMAIL_ATTACHMENTS_BUCKET || 'email-attachments',
  };
}
