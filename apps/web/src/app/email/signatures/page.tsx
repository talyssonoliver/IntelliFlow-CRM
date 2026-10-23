/**
 * Email Signatures — PG-207 (/email/signatures, owner ruling Q2).
 *
 * Server Component shell: streams the skeleton, then hydrates the client
 * content inside Suspense.
 */
import { Suspense } from 'react';
import SignaturesContent from './SignaturesContent';
import { SignaturesLoading } from './SignaturesLoading';

export const metadata = {
  title: 'Signatures — Aurora',
  description: 'Personal and organisation email signatures, added when you write a new email.',
};

export default function SignaturesPage() {
  return (
    <Suspense fallback={<SignaturesLoading />}>
      <SignaturesContent />
    </Suspense>
  );
}
