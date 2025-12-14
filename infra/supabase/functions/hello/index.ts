// Supabase Edge Function: Hello
// Example edge function demonstrating best practices for IntelliFlow CRM
// Runs on Deno runtime with TypeScript support

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"

// CORS headers for cross-origin requests
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

// Type definitions
interface HelloRequest {
  name?: string
  userId?: string
}

interface HelloResponse {
  message: string
  timestamp: string
  user?: {
    id: string
    email: string
    role: string
  }
  metadata?: Record<string, unknown>
}

interface ErrorResponse {
  error: string
  details?: string
}

// Main handler function
serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with user context
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase configuration")
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Get authorization header for user authentication
    const authHeader = req.headers.get("Authorization")
    let currentUser = null

    if (authHeader) {
      // Verify JWT and get user
      const token = authHeader.replace("Bearer ", "")
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)

      if (authError) {
        console.error("Auth error:", authError)
      } else {
        currentUser = user
      }
    }

    // Parse request body
    const requestBody = await req.json() as HelloRequest
    const { name = "World", userId } = requestBody

    // Build response
    const response: HelloResponse = {
      message: `Hello, ${name}! Welcome to IntelliFlow CRM Edge Functions.`,
      timestamp: new Date().toISOString(),
    }

    // If user is authenticated, include user details
    if (currentUser) {
      // Fetch user details from database
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("id, email, role")
        .eq("id", currentUser.id)
        .single()

      if (!userError && userData) {
        response.user = {
          id: userData.id,
          email: userData.email,
          role: userData.role,
        }
        response.message = `Hello, ${userData.name || name}! You are authenticated as ${userData.role}.`
      }
    }

    // Add metadata about the edge function
    response.metadata = {
      functionVersion: "1.0.0",
      runtime: "Deno",
      region: Deno.env.get("DENO_REGION") || "unknown",
      executionId: crypto.randomUUID(),
    }

    // Log successful execution
    console.log("Edge function executed successfully", {
      userId: currentUser?.id,
      timestamp: response.timestamp,
    })

    // Return JSON response with CORS headers
    return new Response(
      JSON.stringify(response),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 200,
      }
    )

  } catch (error) {
    // Error handling
    console.error("Edge function error:", error)

    const errorResponse: ErrorResponse = {
      error: "Internal server error",
      details: error instanceof Error ? error.message : "Unknown error",
    }

    return new Response(
      JSON.stringify(errorResponse),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
        status: 500,
      }
    )
  }
})

/* Edge Function Usage Examples:

1. Basic request (no auth):
   curl -X POST https://your-project.supabase.co/functions/v1/hello \
     -H "Content-Type: application/json" \
     -d '{"name": "Alice"}'

2. Authenticated request:
   curl -X POST https://your-project.supabase.co/functions/v1/hello \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -d '{"name": "Bob"}'

3. From TypeScript/JavaScript:
   const { data, error } = await supabase.functions.invoke('hello', {
     body: { name: 'Charlie' }
   })

4. Testing locally:
   supabase functions serve hello --env-file ./supabase/.env.local

   Then: curl http://localhost:54321/functions/v1/hello \
     -H "Content-Type: application/json" \
     -d '{"name": "Test User"}'

*/

/* Development Notes:

1. Environment Variables:
   - SUPABASE_URL: Automatically provided by Supabase
   - SUPABASE_SERVICE_ROLE_KEY: Automatically provided by Supabase
   - Custom vars: Define in .env.local for local dev, in Supabase dashboard for production

2. Database Access:
   - Use service role key to bypass RLS (be careful!)
   - Or use user's JWT to enforce RLS policies
   - Always validate user permissions before data operations

3. Performance:
   - Edge functions have cold start latency (~100-500ms)
   - Keep functions small and focused
   - Use caching for frequently accessed data
   - Set appropriate timeouts (default: 60s)

4. Security:
   - Validate all inputs
   - Sanitize user data before database operations
   - Use parameterized queries to prevent injection
   - Never expose service role key to frontend
   - Implement rate limiting for public endpoints

5. Testing:
   - Use `deno test` for unit tests
   - Test locally with `supabase functions serve`
   - Use `supabase functions deploy` for production
   - Monitor logs with `supabase functions logs`

6. Common Use Cases for IntelliFlow CRM:
   - AI scoring webhooks (triggered after lead creation)
   - Email sending via SendGrid/Resend
   - Webhook handlers for external integrations
   - Background jobs (data enrichment, cleanup)
   - Real-time notifications
   - Custom authentication flows
   - API proxies for third-party services

*/
