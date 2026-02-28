import type { Metadata } from 'next';
import { AuthGuides } from '@/components/developer/auth-guides';

export const metadata: Metadata = {
  title: 'Authentication | IntelliFlow CRM',
  description:
    'Authentication guides for IntelliFlow CRM — OAuth 2.0, JWT tokens, MFA setup, session management, and API key reference.',
};

export default function AuthGuidesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Authentication</h1>
          <p className="text-muted-foreground mt-1">
            Secure access and identity management — OAuth 2.0 providers, JWT bearer tokens,
            multi-factor authentication, and session management.
          </p>
        </div>
        <AuthGuides />
      </div>
    </div>
  );
}
