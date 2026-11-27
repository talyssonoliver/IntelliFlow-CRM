/** MVP-001: one SMTP sign-in check, used before saving and by the settings test. */
import { MailboxTransportError } from '@intelliflow/adapters';
import type { MailboxErrorCode } from '@intelliflow/domain';
import {
  smtpAccountConfig,
  smtpAccountFields,
  smtpEndpointConfig,
  type SaveSmtpMailboxInput,
} from '@intelliflow/validators';
import type { MailboxTransports } from './mailbox-transport';

/** The code an SMTP sign-in fails with, or null when it works (MailboxTransportError codes). */
export async function smtpFailure(
  transports: Pick<MailboxTransports, 'smtp'>,
  input: SaveSmtpMailboxInput,
  secret: string
): Promise<MailboxErrorCode | null> {
  try {
    await transports.smtp.verify({
      ...smtpEndpointConfig(input),
      ...smtpAccountConfig(smtpAccountFields(input.smtpUsername, secret)),
    });
    return null;
  } catch (error) {
    return error instanceof MailboxTransportError ? error.code : 'CONNECT_FAILED';
  }
}
