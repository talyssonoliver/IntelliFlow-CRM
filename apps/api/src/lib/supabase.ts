/**
 * Supabase Client Library for IntelliFlow CRM
 * Task: IFC-006 - Supabase Integration Test
 * Task: IFC-169 - Fix Supabase auth (remove mock key fallback)
 *
 * This module provides initialized Supabase clients for:
 * - Authentication (auth)
 * - Real-time subscriptions (realtime)
 * - Database operations (from)
 * - Storage (storage)
 * - pgvector operations (rpc)
 *
 * Configuration:
 * - Production: Requires SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
 * - Development: Falls back to local Supabase (127.0.0.1:54321) with warning
 * - Test (NODE_ENV=test or VITEST): Allows mock keys for unit testing
 */

import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';

// ============================================
// ENVIRONMENT CONFIGURATION
// ============================================

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_TEST = NODE_ENV === 'test' || process.env.VITEST === 'true';
const IS_PRODUCTION = NODE_ENV === 'production';

// Mock key for test environment ONLY
const TEST_MOCK_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

/**
 * Validate and get Supabase configuration
 * Fails fast in production if not properly configured
 */
function getSupabaseConfig(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  usingMockKeys: boolean;
} {
  const envUrl = process.env.SUPABASE_URL;
  const envAnonKey = process.env.SUPABASE_ANON_KEY;
  const envServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Production: MUST have all environment variables
  if (IS_PRODUCTION) {
    const missing: string[] = [];
    if (!envUrl) missing.push('SUPABASE_URL');
    if (!envAnonKey) missing.push('SUPABASE_ANON_KEY');
    if (!envServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

    if (missing.length > 0 || !envUrl || !envAnonKey || !envServiceRoleKey) {
      throw new Error(
        `[CRITICAL] Supabase configuration error in production: Missing required environment variables: ${missing.join(', ')}. ` +
          'Authentication will not work. Set these variables before deploying.'
      );
    }

    // TypeScript now knows these are defined after the throw
    return {
      url: envUrl,
      anonKey: envAnonKey,
      serviceRoleKey: envServiceRoleKey,
      usingMockKeys: false,
    };
  }

  // Test environment: Allow mock keys silently
  if (IS_TEST) {
    return {
      url: envUrl || 'http://127.0.0.1:54321',
      anonKey: envAnonKey || TEST_MOCK_KEY,
      serviceRoleKey: envServiceRoleKey || TEST_MOCK_KEY,
      usingMockKeys: !envAnonKey || !envServiceRoleKey,
    };
  }

  // Development: Allow fallback but warn clearly
  const usingDefaultUrl = !envUrl;
  const usingMockAnonKey = !envAnonKey;
  const usingMockServiceKey = !envServiceRoleKey;

  if (usingDefaultUrl || usingMockAnonKey || usingMockServiceKey) {
    const warnings: string[] = [];
    if (usingDefaultUrl) warnings.push('SUPABASE_URL (using local 127.0.0.1:54321)');
    if (usingMockAnonKey) warnings.push('SUPABASE_ANON_KEY (using mock key - AUTH WILL NOT WORK)');
    if (usingMockServiceKey)
      warnings.push('SUPABASE_SERVICE_ROLE_KEY (using mock key - ADMIN OPS WILL NOT WORK)');

    console.warn(
      `\n⚠️  [Supabase] Development mode - missing environment variables:\n` +
        warnings.map((w) => `   - ${w}`).join('\n') +
        '\n   Run local Supabase: npx supabase start\n' +
        '   Or set environment variables in .env.local\n'
    );
  }

  return {
    url: envUrl || 'http://127.0.0.1:54321',
    anonKey: envAnonKey || TEST_MOCK_KEY,
    serviceRoleKey: envServiceRoleKey || TEST_MOCK_KEY,
    usingMockKeys: usingMockAnonKey || usingMockServiceKey,
  };
}

// Get validated configuration
const config = getSupabaseConfig();
const SUPABASE_URL = config.url;
const SUPABASE_ANON_KEY = config.anonKey;
const SUPABASE_SERVICE_ROLE_KEY = config.serviceRoleKey;

/**
 * Database types for type-safe Supabase operations
 * These types mirror the Prisma schema for consistency
 */
export interface Database {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          email: string;
          firstName: string | null;
          lastName: string | null;
          company: string | null;
          title: string | null;
          phone: string | null;
          source: string;
          status: string;
          score: number;
          ownerId: string;
          embedding: number[] | null;
          createdAt: string;
          updatedAt: string;
        };
        Insert: Omit<
          Database['public']['Tables']['leads']['Row'],
          'id' | 'createdAt' | 'updatedAt'
        >;
        Update: Partial<Database['public']['Tables']['leads']['Insert']>;
      };
      contacts: {
        Row: {
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          title: string | null;
          phone: string | null;
          department: string | null;
          ownerId: string;
          accountId: string | null;
          leadId: string | null;
          embedding: number[] | null;
          createdAt: string;
          updatedAt: string;
        };
        Insert: Omit<
          Database['public']['Tables']['contacts']['Row'],
          'id' | 'createdAt' | 'updatedAt'
        >;
        Update: Partial<Database['public']['Tables']['contacts']['Insert']>;
      };
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          avatarUrl: string | null;
          role: string;
          createdAt: string;
          updatedAt: string;
        };
        Insert: Omit<
          Database['public']['Tables']['users']['Row'],
          'id' | 'createdAt' | 'updatedAt'
        >;
        Update: Partial<Database['public']['Tables']['users']['Insert']>;
      };
    };
    Functions: {
      match_leads_by_embedding: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
        };
        Returns: Array<{
          id: string;
          email: string;
          firstName: string | null;
          lastName: string | null;
          company: string | null;
          similarity: number;
        }>;
      };
      match_contacts_by_embedding: {
        Args: {
          query_embedding: number[];
          match_threshold: number;
          match_count: number;
        };
        Returns: Array<{
          id: string;
          email: string;
          firstName: string;
          lastName: string;
          similarity: number;
        }>;
      };
    };
  };
}

/**
 * Anonymous/public Supabase client
 * Uses anon key - respects Row Level Security (RLS) policies
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Admin Supabase client
 * Uses service role key - bypasses RLS for admin operations
 * WARNING: Use with caution, only for server-side admin operations
 */
export const supabaseAdmin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Create a Supabase client with a user's JWT token
 * Used for authenticated API requests
 */
export function createAuthenticatedClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

// ============================================
// AUTH HELPERS
// ============================================

export interface SignUpResult {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

export interface SignInResult {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  return {
    user: data.user,
    session: data.session,
    error: error,
  };
}

/**
 * Sign in an existing user with email and password
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  return {
    user: data.user,
    session: data.session,
    error: error,
  };
}

/**
 * Sign out the current user
 */
export async function signOut(): Promise<{ error: Error | null }> {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Get the current session
 */
export async function getSession(): Promise<{ session: Session | null; error: Error | null }> {
  const { data, error } = await supabase.auth.getSession();
  return { session: data.session, error };
}

/**
 * Get the current user
 */
export async function getUser(): Promise<{ user: User | null; error: Error | null }> {
  const { data, error } = await supabase.auth.getUser();
  return { user: data.user, error };
}

/**
 * Verify a JWT token and return the user
 */
export async function verifyToken(
  token: string
): Promise<{ user: User | null; error: Error | null }> {
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return { user: data.user, error };
}

// ============================================
// REALTIME HELPERS
// ============================================

export type RealtimeChannel = ReturnType<typeof supabase.channel>;
export type RealtimeCallback<T> = (payload: { new: T; old: T | null; eventType: string }) => void;

/**
 * Subscribe to real-time changes on a table
 */
export function subscribeToTable<T extends keyof Database['public']['Tables']>(
  table: T,
  callback: RealtimeCallback<Database['public']['Tables'][T]['Row']>,
  filter?: string
): RealtimeChannel {
  const channel = supabase
    .channel(`${table}-changes`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: table as string,
        filter,
      },
      (payload) => {
        callback({
          new: payload.new as Database['public']['Tables'][T]['Row'],
          old: payload.old as Database['public']['Tables'][T]['Row'] | null,
          eventType: payload.eventType,
        });
      }
    )
    .subscribe();

  return channel;
}

/**
 * Subscribe to lead score updates
 */
export function subscribeToLeadScores(
  callback: RealtimeCallback<Database['public']['Tables']['leads']['Row']>
): RealtimeChannel {
  return subscribeToTable('leads', callback);
}

/**
 * Unsubscribe from a channel
 */
export async function unsubscribe(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}

// ============================================
// VECTOR SEARCH HELPERS (pgvector)
// ============================================

export interface VectorSearchResult<T> {
  data: T[];
  error: Error | null;
}

/**
 * Lead search result from pgvector
 */
export interface LeadSearchResult {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  similarity: number;
}

/**
 * Contact search result from pgvector
 */
export interface ContactSearchResult {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  similarity: number;
}

/**
 * Search leads by semantic similarity using pgvector
 * Requires the match_leads_by_embedding function to be created in Supabase
 */
export async function searchLeadsByEmbedding(
  embedding: number[],
  threshold = 0.7,
  limit = 10
): Promise<VectorSearchResult<LeadSearchResult>> {
  // @ts-expect-error - RPC function types not generated, will work at runtime
  const { data, error } = await supabase.rpc('match_leads_by_embedding', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  });

  return {
    data: (data as unknown as LeadSearchResult[]) ?? [],
    error: error,
  };
}

/**
 * Search contacts by semantic similarity using pgvector
 * Requires the match_contacts_by_embedding function to be created in Supabase
 */
export async function searchContactsByEmbedding(
  embedding: number[],
  threshold = 0.7,
  limit = 10
): Promise<VectorSearchResult<ContactSearchResult>> {
  // @ts-expect-error - RPC function types not generated, will work at runtime
  const { data, error } = await supabase.rpc('match_contacts_by_embedding', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: limit,
  });

  return {
    data: (data as unknown as ContactSearchResult[]) ?? [],
    error: error,
  };
}

/**
 * Update a lead's embedding vector
 */
export async function updateLeadEmbedding(
  leadId: string,
  embedding: number[]
): Promise<{ error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('leads') as any)
    .update({ embedding })
    .eq('id', leadId);

  return { error };
}

/**
 * Update a contact's embedding vector
 */
export async function updateContactEmbedding(
  contactId: string,
  embedding: number[]
): Promise<{ error: Error | null }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabaseAdmin.from('contacts') as any)
    .update({ embedding })
    .eq('id', contactId);

  return { error };
}

// ============================================
// OAUTH HELPERS
// ============================================

/**
 * OAuth provider types supported by Supabase
 */
export type OAuthProvider =
  | 'google'
  | 'github'
  | 'facebook'
  | 'twitter'
  | 'azure'
  | 'linkedin'
  | 'gitlab'
  | 'bitbucket'
  | 'discord'
  | 'slack'
  | 'spotify'
  | 'twitch'
  | 'notion'
  | 'apple';

export interface OAuthSignInResult {
  url: string | null;
  error: Error | null;
}

export interface OAuthSessionResult {
  session: Session | null;
  user: User | null;
  error: Error | null;
}

/**
 * Initiate OAuth sign-in with a provider
 * Returns a URL to redirect the user to
 */
export async function signInWithOAuth(
  provider: OAuthProvider,
  options?: {
    redirectTo?: string;
    scopes?: string;
    queryParams?: Record<string, string>;
  }
): Promise<OAuthSignInResult> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: options?.redirectTo,
      scopes: options?.scopes,
      queryParams: options?.queryParams,
    },
  });

  return {
    url: data.url,
    error: error,
  };
}

/**
 * Exchange an OAuth authorization code for a session
 */
export async function exchangeCodeForSession(code: string): Promise<OAuthSessionResult> {
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  return {
    session: data.session,
    user: data.user,
    error: error,
  };
}

// ============================================
// STORAGE HELPERS
// ============================================

/**
 * Upload a file to Supabase Storage
 */
export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob | Buffer,
  options?: { contentType?: string; upsert?: boolean }
): Promise<{ path: string | null; error: Error | null }> {
  const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: options?.contentType,
    upsert: options?.upsert ?? false,
  });

  return {
    path: data?.path ?? null,
    error,
  };
}

/**
 * Get a public URL for a file
 */
export function getPublicUrl(bucket: string, path: string): string {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFile(
  bucket: string,
  paths: string[]
): Promise<{ error: Error | null }> {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  return { error };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if Supabase is properly configured (not using mock keys)
 */
export function isConfigured(): boolean {
  return !config.usingMockKeys;
}

/**
 * Check if Supabase auth is fully functional
 * Returns false if using mock keys (auth will fail)
 */
export function isAuthFunctional(): boolean {
  return Boolean(process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Get Supabase configuration (for debugging)
 */
export function getConfig(): {
  url: string;
  hasAnonKey: boolean;
  hasServiceKey: boolean;
  usingMockKeys: boolean;
  environment: string;
} {
  return {
    url: SUPABASE_URL,
    hasAnonKey: Boolean(process.env.SUPABASE_ANON_KEY),
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    usingMockKeys: config.usingMockKeys,
    environment: NODE_ENV,
  };
}

// Export types for external use
export type { User, Session, SupabaseClient };
