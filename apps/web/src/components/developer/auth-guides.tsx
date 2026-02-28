'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@intelliflow/ui';
import { Card } from '@intelliflow/ui';
import { Badge } from '@intelliflow/ui';
import { AuthExamples } from '@/components/developer/auth-examples';

function CodeBlock({ code, label }: { code: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {label && <div className="text-xs text-muted-foreground mb-1 font-medium">{label}</div>}
      <pre className="font-mono bg-muted rounded-lg p-4 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`Copy ${label || 'code'} to clipboard`}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: 'available' | 'coming-soon' }) {
  if (status === 'coming-soon') {
    return <Badge variant="warning">Coming Soon</Badge>;
  }
  return null;
}

function SecurityWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20 p-4 rounded-r-lg">
      <div className="flex items-start gap-2">
        <span className="material-symbols-outlined text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" aria-hidden="true">
          warning
        </span>
        <div className="text-sm text-yellow-800 dark:text-yellow-200">{children}</div>
      </div>
    </div>
  );
}

function OverviewTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="overview-methods">
        <h2 id="overview-methods" className="text-lg font-semibold text-foreground mb-3">
          Authentication Methods
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
                  language
                </span>
              </div>
              <div>
                <div className="font-medium text-foreground">OAuth 2.0</div>
                <p className="text-sm text-muted-foreground">
                  Single sign-on with Google Workspace and Microsoft Azure AD via PKCE authorization
                  code flow.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
                  token
                </span>
              </div>
              <div>
                <div className="font-medium text-foreground">JWT / Bearer Tokens</div>
                <p className="text-sm text-muted-foreground">
                  Email/password login returns JWT access tokens. Default TTL: 24 hours (30 days
                  with remember-me).
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
                  security
                </span>
              </div>
              <div>
                <div className="font-medium text-foreground">Multi-Factor Authentication</div>
                <p className="text-sm text-muted-foreground">
                  TOTP-based 2FA with backup codes. SMS and Email OTP coming soon.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-4 opacity-70">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-orange-500 rounded-lg flex items-center justify-center">
                <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
                  key
                </span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">API Keys</span>
                  <StatusBadge status="coming-soon" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Programmatic access with <code className="text-xs bg-muted px-1 py-0.5 rounded">ifc_live_*</code> and{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">ifc_test_*</code> prefixes.
                </p>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section aria-labelledby="overview-security">
        <h2 id="overview-security" className="text-lg font-semibold text-foreground mb-3">
          Security Model
        </h2>
        <div className="space-y-3">
          <p className="text-muted-foreground">
            IntelliFlow CRM uses a multi-layered security model combining Supabase authentication
            with application-level session management and rate limiting.
          </p>
          <SecurityWarning>
            <strong>Token Storage:</strong> Store access tokens in httpOnly cookies. Never store
            refresh tokens in localStorage — use secure, same-site cookies instead.
          </SecurityWarning>
        </div>
      </section>

      <AuthExamples />
    </div>
  );
}

function OAuthTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="oauth-providers">
        <h2 id="oauth-providers" className="text-lg font-semibold text-foreground mb-3">
          Supported Providers
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-4">
            <div className="font-medium text-foreground mb-1">Google Workspace</div>
            <p className="text-sm text-muted-foreground">
              SSO via Google OAuth 2.0. Supports organizational accounts with Google Workspace
              domains.
            </p>
          </Card>
          <Card className="p-4">
            <div className="font-medium text-foreground mb-1">Microsoft Azure AD</div>
            <p className="text-sm text-muted-foreground">
              SSO via Microsoft identity platform. Supports Azure Active Directory tenants and
              Microsoft 365 accounts.
            </p>
          </Card>
        </div>
      </section>

      <section aria-labelledby="oauth-pkce">
        <h2 id="oauth-pkce" className="text-lg font-semibold text-foreground mb-3">
          PKCE Authorization Code Flow
        </h2>
        <p className="text-muted-foreground mb-3">
          IntelliFlow uses the PKCE (Proof Key for Code Exchange) extension for all OAuth flows:
        </p>
        <ol className="list-decimal list-inside space-y-2 text-muted-foreground mb-4">
          <li>
            Generate a <code className="text-xs bg-muted px-1 py-0.5 rounded">code_verifier</code> and{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">code_challenge</code>
          </li>
          <li>Redirect user to the provider&apos;s authorization endpoint with the challenge</li>
          <li>Provider authenticates user and redirects back with an authorization code</li>
          <li>Exchange the code + verifier for access and refresh tokens</li>
          <li>Store tokens securely and use for API requests</li>
        </ol>

        <CodeBlock
          code={`// Step 1: Generate PKCE challenge
const codeVerifier = generateRandomString(128);
const codeChallenge = await sha256(codeVerifier);

// Step 2: Redirect to OAuth provider
const authUrl = new URL('https://your-intelliflow.example.com/auth/callback');
authUrl.searchParams.set('provider', 'google');
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
authUrl.searchParams.set('redirect_to', 'https://your-app.example.com/auth/callback');
window.location.href = authUrl.toString();`}
          label="PKCE Flow Example"
        />

        <div className="mt-4">
          <SecurityWarning>
            <strong>State Parameter Warning:</strong> The PKCE state parameter is not validated
            server-side. Your client application must validate the state parameter locally to prevent
            CSRF attacks. Always compare the returned state with the value you stored before
            initiating the OAuth flow.
          </SecurityWarning>
        </div>

        <div className="mt-4">
          <SecurityWarning>
            <strong>Redirect URL Validation:</strong> The{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">redirect_to</code> parameter must
            be validated against an allowlist of registered redirect URLs. Do not accept arbitrary
            redirect targets.
          </SecurityWarning>
        </div>
      </section>
    </div>
  );
}

function TokensTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="tokens-login">
        <h2 id="tokens-login" className="text-lg font-semibold text-foreground mb-3">
          Login Flow
        </h2>
        <p className="text-muted-foreground mb-3">
          The email/password login flow returns a JWT access token. If MFA is enabled, the initial
          response includes a challenge that must be verified before receiving tokens.
        </p>

        <CodeBlock
          code={`POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your_password_here"
}

// Response (no MFA):
{
  "accessToken": "YOUR_ACCESS_TOKEN_HERE",
  "refreshToken": "YOUR_REFRESH_TOKEN_HERE",
  "expiresIn": 86400
}

// Response (MFA required):
{
  "mfaRequired": true,
  "challengeId": "challenge_id_here",
  "methods": ["totp"]
}`}
          label="Login Request"
        />
      </section>

      <section aria-labelledby="tokens-format">
        <h2 id="tokens-format" className="text-lg font-semibold text-foreground mb-3">
          Token Format
        </h2>
        <p className="text-muted-foreground mb-3">
          Include the access token in the <code className="text-xs bg-muted px-1 py-0.5 rounded">Authorization</code> header:
        </p>
        <CodeBlock
          code={`Authorization: Bearer YOUR_ACCESS_TOKEN_HERE`}
          label="Bearer Token Header"
        />
      </section>

      <section aria-labelledby="tokens-password">
        <h2 id="tokens-password" className="text-lg font-semibold text-foreground mb-3">
          Password Requirements
        </h2>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>Minimum 8 characters, maximum 128 characters</li>
          <li>Must contain at least one uppercase letter</li>
          <li>Must contain at least one lowercase letter</li>
          <li>Must contain at least one digit</li>
          <li>Must contain at least one special character</li>
        </ul>
      </section>

      <section aria-labelledby="tokens-rate-limits">
        <h2 id="tokens-rate-limits" className="text-lg font-semibold text-foreground mb-3">
          Rate Limits
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-foreground">Endpoint</th>
                <th className="text-left py-2 pr-4 font-medium text-foreground">Limit</th>
                <th className="text-left py-2 font-medium text-foreground">Lockout</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4">Login</td>
                <td className="py-2 pr-4">5 failed attempts</td>
                <td className="py-2">15-minute lockout</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Password Reset</td>
                <td className="py-2 pr-4">3 per email</td>
                <td className="py-2">15-minute window</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Email Verification Resend</td>
                <td className="py-2 pr-4">3 per email</td>
                <td className="py-2">15-minute window</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <SecurityWarning>
            <strong>Email Enumeration Prevention:</strong> Login error messages are identical for
            invalid email and invalid password to prevent user enumeration attacks.
          </SecurityWarning>
        </div>
      </section>
    </div>
  );
}

function MfaTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="mfa-totp">
        <h2 id="mfa-totp" className="text-lg font-semibold text-foreground mb-3">
          TOTP Setup
        </h2>
        <p className="text-muted-foreground mb-3">
          IntelliFlow supports TOTP (Time-based One-Time Password) per RFC 6238 with the following
          parameters: SHA1 algorithm, 6 digits, 30-second period, ±1 window tolerance.
        </p>

        <div className="space-y-3 mb-4">
          <h3 className="text-base font-medium text-foreground">Setup Steps</h3>
          <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
            <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
            <li>Scan the QR code or enter the secret key manually</li>
            <li>Enter the 6-digit code from your authenticator app to verify</li>
            <li>Save the 8 backup codes in a secure location</li>
          </ol>
        </div>

        <CodeBlock
          code={`POST /api/auth/mfa/setup
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE

// Response:
{
  "secret": "BASE32_SECRET_HERE",
  "qrCodeUrl": "otpauth://totp/IntelliFlow:user@example.com?secret=BASE32_SECRET_HERE&issuer=IntelliFlow",
  "backupCodes": [
    "A1B2C3D4E5", "F6A7B8C9D0", "E1F2A3B4C5", "D6E7F8A9B0",
    "C1D2E3F4A5", "B6C7D8E9F0", "A1D2F3B4C5", "E6F7A8B9C0"
  ]
}`}
          label="MFA Setup"
        />
      </section>

      <section aria-labelledby="mfa-backup">
        <h2 id="mfa-backup" className="text-lg font-semibold text-foreground mb-3">
          Backup Codes
        </h2>
        <p className="text-muted-foreground mb-3">
          When MFA is enabled, 8 backup codes are generated. Each code is 10 characters of uppercase
          hex and can only be used once.
        </p>
        <SecurityWarning>
          <strong>Store Securely:</strong> Backup codes are shown only once during setup. Store them
          in a password manager or secure offline location.
        </SecurityWarning>
      </section>

      <section aria-labelledby="mfa-challenge">
        <h2 id="mfa-challenge" className="text-lg font-semibold text-foreground mb-3">
          Challenge Lifecycle
        </h2>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>Challenge expires after 5 minutes</li>
          <li>Maximum 3 attempts per challenge</li>
          <li>After 3 failed attempts, a new challenge must be requested</li>
        </ul>
      </section>

      <section aria-labelledby="mfa-sms-email">
        <h2 id="mfa-sms-email" className="text-lg font-semibold text-foreground mb-3">
          SMS & Email OTP
        </h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">SMS OTP</span>
            <StatusBadge status="coming-soon" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Email OTP</span>
            <StatusBadge status="coming-soon" />
          </div>
          <p className="text-sm text-muted-foreground">
            SMS and Email OTP methods are defined in the system but require a delivery provider to be
            connected. When available: SMS OTP expires in 5 minutes, Email OTP expires in 10 minutes.
          </p>
        </div>
      </section>

      <SecurityWarning>
        <strong>In-Memory State:</strong> MFA challenges are stored in an in-memory challenge store.
        Challenges will be lost if the server restarts. Plan for re-authentication in production
        deployments.
      </SecurityWarning>
    </div>
  );
}

function SessionsKeysTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="sessions-limits">
        <h2 id="sessions-limits" className="text-lg font-semibold text-foreground mb-3">
          Session Management
        </h2>
        <p className="text-muted-foreground mb-3">
          IntelliFlow enforces strict session limits for security:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 pr-4 font-medium text-foreground">Setting</th>
                <th className="text-left py-2 font-medium text-foreground">Value</th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              <tr className="border-b">
                <td className="py-2 pr-4">Max 3 concurrent sessions</td>
                <td className="py-2">Oldest session is revoked when limit is exceeded</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Default TTL</td>
                <td className="py-2">24-hour expiry</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Remember Me</td>
                <td className="py-2">30-day extended session</td>
              </tr>
              <tr className="border-b">
                <td className="py-2 pr-4">Inactivity Timeout</td>
                <td className="py-2">4-hour idle threshold</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 space-y-3">
          <SecurityWarning>
            <strong>In-Memory Sessions:</strong> Application-level sessions are stored in memory.
            All sessions will be lost on server restart. Consider using a persistent session store
            in production.
          </SecurityWarning>
          <SecurityWarning>
            <strong>Dual-Layer Sessions:</strong> Calling{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">revokeSession</code> removes
            the application-level session but does <strong>not</strong> invalidate the Supabase JWT.
            The JWT remains valid until its natural expiry. For immediate invalidation, both layers
            must be addressed.
          </SecurityWarning>
        </div>
      </section>

      <section aria-labelledby="sessions-api-keys">
        <h2 id="sessions-api-keys" className="text-lg font-semibold text-foreground mb-3">
          API Keys
        </h2>
        <div className="flex items-center gap-2 mb-3">
          <StatusBadge status="coming-soon" />
        </div>
        <p className="text-muted-foreground mb-3">
          API keys provide programmatic access to IntelliFlow CRM. Keys use environment-specific prefixes:
        </p>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground mb-3">
          <li>
            Live: <code className="text-xs bg-muted px-1 py-0.5 rounded">ifc_live_*</code>
          </li>
          <li>
            Test: <code className="text-xs bg-muted px-1 py-0.5 rounded">ifc_test_*</code>
          </li>
        </ul>

        <h3 className="text-base font-medium text-foreground mb-2">Scopes</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">read</code> — Read-only access to CRM data
          </li>
          <li>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">write</code> — Create and update records
          </li>
          <li>
            <code className="text-xs bg-muted px-1 py-0.5 rounded">admin</code> — Full access including team and settings
          </li>
        </ul>
      </section>
    </div>
  );
}

export function AuthGuides() {
  return (
    <div data-testid="auth-guides">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="oauth">OAuth 2.0</TabsTrigger>
          <TabsTrigger value="tokens">JWT / Bearer</TabsTrigger>
          <TabsTrigger value="mfa">MFA</TabsTrigger>
          <TabsTrigger value="sessions">Sessions & Keys</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="oauth">
          <OAuthTab />
        </TabsContent>

        <TabsContent value="tokens">
          <TokensTab />
        </TabsContent>

        <TabsContent value="mfa">
          <MfaTab />
        </TabsContent>

        <TabsContent value="sessions">
          <SessionsKeysTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
