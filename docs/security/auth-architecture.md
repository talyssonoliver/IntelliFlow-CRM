# Authentication Architecture

**Status:** Implemented **Last Updated:** 2026-02-04 **Related Tasks:**
FLOW-001, PG-015, PG-024

## Overview

IntelliFlow CRM uses a JWT-based authentication system with Supabase Auth as the
identity provider. This document describes the complete authentication flow,
token management, and automatic refresh mechanism.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Next.js Web App)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────────┐ │
│  │   localStorage  │    │    Cookies      │    │   Supabase Browser      │ │
│  │  - accessToken  │◄──►│  - accessToken  │◄──►│   - setSession()        │ │
│  │  - refreshToken │    │  - session      │    │   - onAuthStateChange() │ │
│  └────────┬────────┘    └────────┬────────┘    │   - refreshSession()    │ │
│           │                      │             └───────────┬─────────────┘ │
│           │                      │                         │               │
│           ▼                      ▼                         ▼               │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                         AuthContext.tsx                                 ││
│  │  - Syncs tokens to Supabase on mount                                   ││
│  │  - Listens for TOKEN_REFRESHED events                                  ││
│  │  - Schedules backup timer-based refresh                                ││
│  │  - Provides auth state to entire app                                   ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                         providers.tsx                                   ││
│  │  - Validates token before including in requests                        ││
│  │  - Global QueryCache error handling (401 → redirect)                   ││
│  │  - No retry on auth errors                                             ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                    HTTP + Authorization: Bearer <token>
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVER (tRPC API)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                         context.ts                                      ││
│  │  - Extracts Bearer token from Authorization header                     ││
│  │  - Verifies token with Supabase Auth                                   ││
│  │  - Looks up user in database                                           ││
│  │  - Auto-provisions new OAuth users (JIT)                               ││
│  │  - Falls back to FALLBACK_USER in dev mode (no token)                  ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                    │                                        │
│                                    ▼                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐│
│  │                         trpc.ts                                         ││
│  │  - publicProcedure: No auth required                                   ││
│  │  - protectedProcedure: Requires ctx.user (throws UNAUTHORIZED)         ││
│  │  - tenantProcedure: Requires auth + tenant isolation                   ││
│  │  - adminProcedure: Requires admin role                                 ││
│  └────────────────────────────────────────────────────────────────────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Token Storage

### localStorage

- **accessToken**: JWT access token (short-lived, ~1 hour)
- **refreshToken**: Refresh token (long-lived, ~1 week)

### Cookies

- **accessToken**: Synced from localStorage for middleware/proxy access
- **session**: JSON object with session data (for server-side checks)

### Why Both?

- **localStorage**: Persists across tabs, accessible to JavaScript
- **Cookies**: Accessible to Next.js proxy/middleware (server-side)

## Authentication Flows

### 1. OAuth Login Flow (Google/Microsoft)

```
User clicks "Sign in with Google"
          │
          ▼
┌─────────────────────────────────┐
│  1. Redirect to OAuth provider  │
│     (via Supabase Auth)         │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  2. User authenticates with     │
│     provider (Google/MS)        │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  3. Redirect to /auth/callback  │
│     with tokens in URL hash     │
│     #access_token=...           │
│     &refresh_token=...          │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  4. /auth/callback page:        │
│     - Extracts tokens from hash │
│     - Validates JWT payload     │
│     - Stores in localStorage    │
│     - Syncs to cookie           │
│     - Redirects to /dashboard   │
└─────────────────────────────────┘
```

**Key Files:**

- `apps/web/src/app/auth/callback/page.tsx`
- `apps/web/src/lib/shared/token-exchange.ts`

### 2. Email/Password Login Flow

```
User submits email + password
          │
          ▼
┌─────────────────────────────────┐
│  1. Call trpc.auth.login        │
│     mutation                    │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  2. Server validates with       │
│     Supabase Auth               │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  3. Return session with         │
│     accessToken + refreshToken  │
└─────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────┐
│  4. Client stores tokens        │
│     - localStorage              │
│     - Cookie sync               │
└─────────────────────────────────┘
```

**Key Files:**

- `apps/web/src/lib/auth/AuthContext.tsx` (login method)
- `apps/api/src/modules/auth/auth.router.ts` (login procedure)

## Token Refresh Mechanism

### Automatic Refresh (Supabase)

The primary refresh mechanism uses Supabase's built-in token refresh:

```typescript
// AuthContext.tsx - On mount, sync tokens to Supabase
const { data, error } = await supabase.auth.setSession({
  access_token: accessToken,
  refresh_token: refreshToken,
});

// Listen for refresh events
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED' && session) {
    // Update localStorage and cookies with new tokens
    localStorage.setItem('accessToken', session.access_token);
    localStorage.setItem('refreshToken', session.refresh_token);
    syncTokenToCookie(session.access_token);
  }
});
```

### Backup Timer-Based Refresh

A backup timer schedules refresh 5 minutes before token expiry:

```typescript
// Calculate time until refresh needed
const expiryMs = getTokenExpiryMs(accessToken);
const refreshAtMs = expiryMs - 5 * 60 * 1000; // 5 minutes before
const timeUntilRefresh = refreshAtMs - Date.now();

// Schedule refresh
setTimeout(() => {
  supabase.auth.refreshSession();
}, timeUntilRefresh);
```

### Manual Refresh

The `refreshSession` method can be called manually:

```typescript
const { refreshSession } = useAuth();
await refreshSession(); // Forces token refresh
```

**Key Files:**

- `apps/web/src/lib/auth/AuthContext.tsx`
- `apps/web/src/lib/supabase-browser.ts`

## Token Validation (Client-Side)

Before including tokens in requests, the client validates them:

```typescript
// providers.tsx
function isTokenValid(token: string | null): boolean {
  if (!token) return false;

  // Decode JWT payload
  const payload = JSON.parse(atob(token.split('.')[1]));

  // Check expiry (with 30 second buffer)
  const expiryTime = payload.exp * 1000;
  return Date.now() < expiryTime - 30000;
}

// Only send token if valid
const accessToken = getValidAccessToken();
if (accessToken) {
  headers['Authorization'] = `Bearer ${accessToken}`;
}
```

## Global Auth Error Handling

The QueryClient handles auth errors globally:

```typescript
// providers.tsx
new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry on auth errors
      retry: (failureCount, error) => {
        if (isAuthError(error)) return false;
        return failureCount < 3;
      },
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (isAuthError(error)) {
        // Clear tokens and redirect to login (once)
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
      }
    },
  }),
});
```

## Server-Side Token Verification

The API verifies tokens on every request:

```typescript
// context.ts
const token = extractBearerToken(req);

if (token) {
  // Verify with Supabase Auth
  const { user: supabaseUser, error } = await verifyToken(token);

  if (!error && supabaseUser) {
    // Look up user in database
    const dbUser = await prisma.user.findUnique({
      where: { id: supabaseUser.id },
    });

    // Set ctx.user for procedures
    user = {
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      tenantId: dbUser.tenantId,
    };
  }
}
```

## Protected Routes (Next.js Proxy)

The Next.js 16 proxy (`proxy.ts`) provides server-side route hints:

```typescript
// proxy.ts
export async function proxy(request: NextRequest) {
  const accessToken = cookieStore.get('accessToken')?.value;
  const session = await decrypt(sessionCookie);

  // If authenticated user on login page → redirect to dashboard
  if (hasValidSession && path === '/login') {
    return NextResponse.redirect('/dashboard');
  }

  // Protected routes without auth → let client-side handle
  // (useRequireAuth hook will redirect)
  return NextResponse.next();
}
```

## Session Cleanup (Logout)

On logout, all session data is cleared:

```typescript
// session-cleanup.ts
export async function cleanupSession() {
  // Clear localStorage
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');

  // Clear cookies
  document.cookie = 'accessToken=; path=/; expires=...';
  document.cookie = 'session=; path=/; expires=...';

  // Clear IndexedDB (if used)
  await clearIndexedDB();

  // Broadcast to other tabs
  broadcastLogout();
}
```

## Security Considerations

### Token Security

- Access tokens are short-lived (~1 hour)
- Refresh tokens are long-lived but rotated on use
- Tokens stored in localStorage (XSS considerations mitigated by CSP)
- Cookies are SameSite=Lax (CSRF protection)

### Development Mode

- FALLBACK_USER used when no token provided (dev convenience)
- Disabled in production (`NODE_ENV !== 'production'`)

### Error Handling

- Auth errors don't retry (prevents loops)
- Single redirect on auth failure (no spam)
- Invalid tokens auto-cleared

## Configuration

### Supabase Browser Client

```typescript
// supabase-browser.ts
createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true, // Supabase auto-refreshes
    persistSession: false, // We manage session in localStorage
    detectSessionInUrl: false, // We handle OAuth callback manually
  },
});
```

### Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

## Troubleshooting

### Token Not Refreshing

1. Check `refreshToken` exists in localStorage
2. Verify Supabase client is initialized
3. Check console for `[AuthContext]` logs
4. Verify token isn't expired beyond refresh window

### 401 Errors in Console

1. Token may be expired - should auto-redirect to login
2. Check if `isTokenValid()` is clearing expired tokens
3. Verify global error handler is redirecting

### Infinite Redirect Loop

1. Check proxy.ts isn't conflicting with client-side redirect
2. Verify `logged_out` query param is respected
3. Clear all cookies and localStorage, retry

## Related Documentation

- [SECURITY.md](./SECURITY.md) - Security policies and practices
- [ADR-020](../planning/adr/ADR-020-public-site-auth.md) - Public site auth
  decision
- [zero-trust-design.md](./zero-trust-design.md) - Zero trust architecture
- [rls-design.md](./rls-design.md) - Row Level Security

## Changelog

| Date       | Change                        | Author |
| ---------- | ----------------------------- | ------ |
| 2026-02-04 | Initial documentation         | Claude |
| 2026-02-04 | Added token refresh mechanism | Claude |
