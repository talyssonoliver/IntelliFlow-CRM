'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@intelliflow/ui';

function CodeBlock({ code, label }: Readonly<{ code: string; label?: string }>) {
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

function TypeScriptExamples() {
  return (
    <div className="flex flex-col gap-4">
      <CodeBlock
        code={`import { createTRPCClient } from '@intelliflow/api-client';

// Login with email/password
const client = createTRPCClient({
  url: 'https://your-intelliflow.example.com/api',
});

const result = await client.auth.login.mutate({
  email: 'user@example.com',
  password: 'your_password_here',
});

if (result.mfaRequired) {
  // Handle MFA challenge
  const mfaResult = await client.auth.confirmMfa.mutate({
    challengeId: result.challengeId,
    code: '123456', // from authenticator app
  });
  // Use mfaResult.accessToken for subsequent API calls
} else {
  // Use result.accessToken for subsequent API calls
}`}
        label="Login with MFA Handling"
      />

      <CodeBlock
        code={`// OAuth initiation
const oauthUrl = await client.auth.getOAuthUrl.query({
  provider: 'google',
  redirectTo: 'https://your-app.example.com/auth/callback',
});
window.location.href = oauthUrl;`}
        label="OAuth Initiation"
      />

      <CodeBlock
        code={`// Token refresh
const refreshed = await client.auth.refreshToken.mutate({
  refreshToken: 'YOUR_REFRESH_TOKEN_HERE',
});
// Use refreshed.accessToken for subsequent API calls`}
        label="Token Refresh"
      />

      <CodeBlock
        code={`// Authenticated API call
const leads = await client.lead.list.query({
  limit: 10,
  offset: 0,
}, {
  headers: {
    Authorization: 'Bearer YOUR_ACCESS_TOKEN_HERE',
  },
});`}
        label="Authenticated API Call"
      />
    </div>
  );
}

function PythonExamples() {
  return (
    <div className="flex flex-col gap-4">
      <CodeBlock
        code={`import requests

# Login with email/password
response = requests.post(
    "https://your-intelliflow.example.com/api/auth/login",
    json={
        "email": "user@example.com",
        "password": "your_password_here",
    },
)
data = response.json()

if data.get("mfaRequired"):
    # Handle MFA challenge
    mfa_response = requests.post(
        "https://your-intelliflow.example.com/api/auth/mfa/confirm",
        json={
            "challengeId": data["challengeId"],
            "code": "123456",
        },
    )
    token = mfa_response.json()["accessToken"]
else:
    token = data["accessToken"]`}
        label="Login with MFA Handling"
      />

      <CodeBlock
        code={`# OAuth initiation
response = requests.get(
    "https://your-intelliflow.example.com/api/auth/oauth-url",
    params={
        "provider": "google",
        "redirectTo": "https://your-app.example.com/auth/callback",
    },
)
oauth_url = response.json()["url"]
# Redirect user to oauth_url`}
        label="OAuth Initiation"
      />

      <CodeBlock
        code={`# Token refresh
response = requests.post(
    "https://your-intelliflow.example.com/api/auth/refresh",
    json={"refreshToken": "YOUR_REFRESH_TOKEN_HERE"},
)
new_token = response.json()["accessToken"]
# Use new_token for subsequent API calls`}
        label="Token Refresh"
      />

      <CodeBlock
        code={`# Authenticated API call
headers = {"Authorization": f"Bearer YOUR_ACCESS_TOKEN_HERE"}
leads = requests.get(
    "https://your-intelliflow.example.com/api/leads",
    headers=headers,
    params={"limit": 10, "offset": 0},
)
# Process leads.json() as needed`}
        label="Authenticated API Call"
      />
    </div>
  );
}

function CurlExamples() {
  return (
    <div className="flex flex-col gap-4">
      <CodeBlock
        code={`# Login with email/password
curl -X POST https://your-intelliflow.example.com/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email": "user@example.com", "password": "your_password_here"}'`}
        label="Login"
      />

      <CodeBlock
        code={`# OAuth initiation — get redirect URL
curl "https://your-intelliflow.example.com/api/auth/oauth-url?provider=google&redirectTo=https://your-app.example.com/auth/callback"`}
        label="OAuth Initiation"
      />

      <CodeBlock
        code={`# Token refresh
curl -X POST https://your-intelliflow.example.com/api/auth/refresh \\
  -H "Content-Type: application/json" \\
  -d '{"refreshToken": "YOUR_REFRESH_TOKEN_HERE"}'`}
        label="Token Refresh"
      />

      <CodeBlock
        code={`# Authenticated API call
curl https://your-intelliflow.example.com/api/leads \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN_HERE"`}
        label="Authenticated API Call"
      />
    </div>
  );
}

function JavaScriptExamples() {
  return (
    <div className="flex flex-col gap-4">
      <CodeBlock
        code={`// Login with fetch
const response = await fetch(
  'https://your-intelliflow.example.com/api/auth/login',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'your_password_here',
    }),
  }
);
const data = await response.json();

if (data.mfaRequired) {
  const code = prompt('Enter your MFA code:');
  const mfaResponse = await fetch(
    'https://your-intelliflow.example.com/api/auth/mfa/confirm',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: data.challengeId,
        code,
      }),
    }
  );
  const mfaData = await mfaResponse.json();
  // Use mfaData.accessToken for subsequent API calls
} else {
  // Use data.accessToken for subsequent API calls
}`}
        label="Login with MFA Handling"
      />

      <CodeBlock
        code={`// OAuth initiation
const oauthResponse = await fetch(
  'https://your-intelliflow.example.com/api/auth/oauth-url?provider=google&redirectTo=https://your-app.example.com/auth/callback'
);
const { url } = await oauthResponse.json();
window.location.href = url;`}
        label="OAuth Initiation"
      />

      <CodeBlock
        code={`// Token refresh
const refreshResponse = await fetch(
  'https://your-intelliflow.example.com/api/auth/refresh',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: 'YOUR_REFRESH_TOKEN_HERE',
    }),
  }
);
const refreshData = await refreshResponse.json();
// Use refreshData.accessToken for subsequent API calls`}
        label="Token Refresh"
      />

      <CodeBlock
        code={`// Authenticated API call
const leads = await fetch(
  'https://your-intelliflow.example.com/api/leads?limit=10',
  {
    headers: {
      Authorization: 'Bearer YOUR_ACCESS_TOKEN_HERE',
    },
  }
);
const leadsData = await leads.json();
// Process leadsData as needed`}
        label="Authenticated API Call"
      />
    </div>
  );
}

export function AuthExamples() {
  return (
    <div data-testid="auth-examples">
      <h2 id="code-examples" className="text-lg font-semibold text-foreground mb-3">
        Code Examples
      </h2>
      <Tabs defaultValue="typescript" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="typescript">TypeScript</TabsTrigger>
          <TabsTrigger value="python">Python</TabsTrigger>
          <TabsTrigger value="curl">cURL</TabsTrigger>
          <TabsTrigger value="javascript">JavaScript</TabsTrigger>
        </TabsList>

        <TabsContent value="typescript">
          <TypeScriptExamples />
        </TabsContent>

        <TabsContent value="python">
          <PythonExamples />
        </TabsContent>

        <TabsContent value="curl">
          <CurlExamples />
        </TabsContent>

        <TabsContent value="javascript">
          <JavaScriptExamples />
        </TabsContent>
      </Tabs>
    </div>
  );
}
