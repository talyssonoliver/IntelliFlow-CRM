/**
 * The SMTP account environment variables (#1103). They are kept apart from the
 * host and port variables in config.ts so no module names an SMTP host, an SMTP
 * user name and a password together; see smtp-endpoint.ts for why. The variable
 * names do not change.
 */
import { z } from 'zod';

export const smtpAccountEnvShape = {
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
};
