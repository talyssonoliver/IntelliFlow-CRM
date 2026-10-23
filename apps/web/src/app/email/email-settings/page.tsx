/**
 * Email Settings — PG-207 (/email/email-settings, ADR-085).
 *
 * Server Component shell: streams the skeleton, then hydrates the client
 * content inside Suspense (it reads the OAuth return query).
 */
import { Suspense } from 'react';
import EmailSettingsContent from './EmailSettingsContent';
import { EmailSettingsLoading } from './EmailSettingsLoading';

export const metadata = {
  title: 'Email Settings — Aurora',
  description:
    'Connect the mailbox your email is sent from, and set the reply-to address, tracking and bounce handling.',
};

export default function EmailSettingsPage() {
  return (
    <Suspense fallback={<EmailSettingsLoading />}>
      <EmailSettingsContent />
    </Suspense>
  );
}
