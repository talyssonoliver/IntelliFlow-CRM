# Supabase Integration for IntelliFlow CRM

This directory contains all Supabase-related configuration, migrations, RLS policies, storage configuration, and edge functions for the IntelliFlow CRM system.

## Directory Structure

```
supabase/
├── config.toml                    # Supabase project configuration
├── migrations/                    # Database migrations
│   └── 20250101000000_initial_schema.sql
├── rls-policies.sql              # Row Level Security policies
├── storage-config.json           # Storage bucket configuration
├── functions/                    # Edge functions (Deno runtime)
│   ├── deno.json                # Deno configuration
│   ├── README.md                # Edge functions documentation
│   └── hello/                   # Example edge function
│       └── index.ts
├── .env.local.example           # Environment variables template
└── README.md                    # This file
```

## Prerequisites

1. **Supabase CLI**
   ```bash
   npm install -g supabase
   ```

2. **Deno Runtime** (for edge functions)
   ```bash
   # macOS/Linux
   curl -fsSL https://deno.land/x/install/install.sh | sh

   # Windows (PowerShell)
   irm https://deno.land/install.ps1 | iex
   ```

3. **Docker** (for local development)
   - Supabase local development requires Docker

## Quick Start

### 1. Local Development Setup

Start Supabase locally with all services (Postgres, Auth, Storage, Edge Functions):

```bash
# From project root
cd C:\taly\intelliFlow-CRM

# Initialize Supabase (first time only)
supabase init

# Start Supabase services
supabase start
```

This will start:
- PostgreSQL database on port `54322`
- Supabase API on port `54321`
- Supabase Studio (GUI) on port `54323`
- Inbucket (email testing) on port `54324`

### 2. Apply Database Migrations

```bash
# Apply all migrations
supabase db reset

# Or apply specific migration
supabase migration up
```

### 3. Apply RLS Policies

```bash
# RLS policies are separate from migrations for flexibility
psql -h localhost -p 54322 -U postgres -d postgres -f infra/supabase/rls-policies.sql
```

### 4. Configure Storage Buckets

Storage buckets need to be created manually or via SQL:

```sql
-- Create buckets
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('avatars', 'avatars', true),
  ('documents', 'documents', false),
  ('email-attachments', 'email-attachments', false),
  ('ai-generated', 'ai-generated', false),
  ('imports', 'imports', false),
  ('exports', 'exports', false);
```

See `storage-config.json` for complete configuration including RLS policies.

### 5. Test Edge Functions

```bash
# Serve edge function locally
supabase functions serve hello --env-file ./infra/supabase/.env.local

# Test with curl
curl -X POST http://localhost:54321/functions/v1/hello \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User"}'
```

## Production Setup

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Create new project
3. Note down:
   - Project URL
   - Anon (public) key
   - Service role key (keep secret!)
   - Project reference ID

### 2. Link Local Project to Production

```bash
# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF
```

### 3. Push Database Changes

```bash
# Push migrations
supabase db push

# Or create a new migration from local schema
supabase db diff -f migration_name

# Then push
supabase db push
```

### 4. Apply RLS Policies

```bash
# Execute RLS policies on production
supabase db execute -f infra/supabase/rls-policies.sql --project-ref YOUR_PROJECT_REF
```

### 5. Configure Storage (Production)

Use Supabase Dashboard:
1. Go to Storage section
2. Create buckets as defined in `storage-config.json`
3. Apply RLS policies via SQL editor

Or use SQL:

```bash
supabase db execute -f infra/supabase/storage-setup.sql --project-ref YOUR_PROJECT_REF
```

### 6. Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy --project-ref YOUR_PROJECT_REF

# Deploy specific function
supabase functions deploy hello --project-ref YOUR_PROJECT_REF

# Set secrets for production
supabase secrets set OPENAI_API_KEY=sk-... --project-ref YOUR_PROJECT_REF
supabase secrets set SENDGRID_API_KEY=SG... --project-ref YOUR_PROJECT_REF
```

## Environment Variables

### Backend (.env)

```bash
# Copy from .env.example
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
SUPABASE_JWT_SECRET=<your-jwt-secret>
SUPABASE_PROJECT_REF=<your-project-ref>
```

### Frontend (Next.js)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

### Edge Functions

```bash
# Create .env.local from .env.local.example
cp infra/supabase/.env.local.example infra/supabase/.env.local

# Edit with your keys
OPENAI_API_KEY=sk-...
SENDGRID_API_KEY=SG...
```

## Database Schema

The initial migration (`20250101000000_initial_schema.sql`) creates:

### Tables
- `users` - System users with RBAC
- `leads` - Lead management with AI scoring
- `contacts` - Contact records
- `accounts` - Company/organization records
- `opportunities` - Sales pipeline
- `tasks` - Activity tracking
- `ai_scores` - AI scoring history
- `audit_logs` - Audit trail
- `domain_events` - Event sourcing

### Extensions
- `uuid-ossp` - UUID generation
- `vector` - pgvector for AI embeddings (1536 dimensions)

### Key Features
- **Vector Embeddings**: Semantic search for leads and contacts
- **Automatic Timestamps**: `updatedAt` trigger on all tables
- **Indexes**: Optimized for common queries
- **Foreign Keys**: Referential integrity enforced
- **Search Functions**: `search_leads_by_embedding()`, `search_contacts_by_embedding()`

## Row Level Security (RLS)

RLS policies implement multi-tenant security with role-based access:

### Access Rules
- **Users**: Can only view/edit their own data
- **Managers**: Can view team members' data
- **Admins**: Full access to all data
- **Service Role**: Bypasses RLS (backend only)

### Helper Functions
- `auth.user_id()` - Get current user ID from JWT
- `auth.user_role()` - Get current user role
- `auth.is_admin()` - Check if user is admin
- `auth.is_manager()` - Check if user is manager
- `auth.team_member_ids()` - Get team member IDs

### Testing RLS

```sql
-- Set user context
SET request.jwt.claims = '{"sub": "user_id_here", "role": "authenticated"}';

-- Run queries (will be filtered by RLS)
SELECT * FROM leads;

-- Reset to service role
RESET request.jwt.claims;
```

## Storage Buckets

### Buckets Configuration

1. **avatars** (public)
   - User profile pictures
   - Max size: 2MB
   - Allowed: images only

2. **documents** (private)
   - Business documents, contracts
   - Max size: 50MB
   - Allowed: PDF, Office docs, text

3. **email-attachments** (private)
   - Email campaign attachments
   - Max size: 25MB

4. **ai-generated** (private)
   - AI reports and analysis
   - Max size: 10MB

5. **imports** (private)
   - CSV/Excel imports
   - Max size: 100MB
   - Auto-delete after 30 days

6. **exports** (private)
   - Data exports
   - Max size: 100MB
   - Auto-delete after 7 days

### Usage Example

```typescript
// Upload file
const { data, error } = await supabase.storage
  .from('documents')
  .upload(`${userId}/contract.pdf`, file)

// Get public URL (for public buckets)
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl('user-avatar.jpg')

// Get signed URL (for private buckets)
const { data: { signedUrl } } = await supabase.storage
  .from('documents')
  .createSignedUrl('private-doc.pdf', 3600) // 1 hour
```

## Edge Functions

Edge functions run on Deno Deploy's global network. See `functions/README.md` for details.

### Available Functions

- `hello` - Example function with authentication

### Planned Functions

- `ai-score-webhook` - Trigger AI lead scoring
- `email-sender` - Send transactional emails
- `data-enrichment` - Enrich lead data
- `webhook-handler` - Handle external webhooks

## Monitoring & Debugging

### Local Development

```bash
# View logs
supabase logs

# Database logs
supabase db logs

# Edge function logs
supabase functions logs hello --tail
```

### Production

```bash
# View production logs
supabase functions logs hello --project-ref YOUR_PROJECT_REF

# Database analytics
supabase db analyze --project-ref YOUR_PROJECT_REF
```

### Supabase Studio

Access the web GUI:
- Local: http://localhost:54323
- Production: https://app.supabase.com

Features:
- Table editor
- SQL editor
- API documentation
- Auth management
- Storage browser
- Logs viewer

## Prisma Integration

IntelliFlow CRM uses Prisma as the ORM, with Supabase as the database provider.

### Workflow

1. **Update Prisma Schema**
   ```bash
   # Edit packages/db/prisma/schema.prisma
   ```

2. **Create Migration**
   ```bash
   pnpm run db:migrate:create
   ```

3. **Apply to Supabase**
   ```bash
   # Local
   supabase db reset

   # Production
   supabase db push
   ```

4. **Generate Prisma Client**
   ```bash
   pnpm run db:generate
   ```

### Connection Strings

```bash
# Supabase provides two URLs:

# Connection pooling (for serverless)
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres?pgbouncer=true"

# Direct connection (for migrations)
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres"
```

## Security Best Practices

### 1. Never Expose Service Role Key

```typescript
// ❌ NEVER do this in frontend
const supabase = createClient(url, SERVICE_ROLE_KEY)

// ✅ Use anon key in frontend
const supabase = createClient(url, ANON_KEY)

// ✅ Use service role only in backend/edge functions
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)
```

### 2. Always Enable RLS

```sql
-- Enable on all tables
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "policy_name" ON table_name
  FOR SELECT
  USING (user_id = auth.uid());
```

### 3. Validate All Inputs

```typescript
// Use Zod for validation
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1)
})

const validated = schema.parse(input)
```

### 4. Use Prepared Statements

```typescript
// ✅ Parameterized query (safe)
const { data } = await supabase
  .from('users')
  .select()
  .eq('email', userEmail)

// ❌ String concatenation (vulnerable)
const query = `SELECT * FROM users WHERE email = '${userEmail}'`
```

## Backup & Recovery

### Automated Backups

Supabase provides daily backups (retention varies by plan):
- Free: None
- Pro: 7 days
- Team: 14 days
- Enterprise: Custom

### Manual Backup

```bash
# Backup database
supabase db dump -f backup.sql --project-ref YOUR_PROJECT_REF

# Restore database
psql -h db.PROJECT_REF.supabase.co -U postgres -d postgres -f backup.sql
```

### Point-in-Time Recovery

Available on Pro plan and above. Access via Supabase Dashboard.

## Performance Optimization

### 1. Indexes

All critical queries have indexes (defined in migration):
- Foreign keys
- Frequently filtered columns
- Sort columns

### 2. Connection Pooling

Use connection pooling for serverless:
```bash
DATABASE_URL="...?pgbouncer=true&connection_limit=1"
```

### 3. Query Optimization

```typescript
// ✅ Select only needed columns
.select('id, name, email')

// ❌ Don't select all
.select('*')

// ✅ Use pagination
.range(0, 9)

// ✅ Limit results
.limit(10)
```

### 4. Caching

Use Supabase Realtime for reactive caching:
```typescript
const channel = supabase
  .channel('db-changes')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'leads' },
    (payload) => console.log(payload)
  )
  .subscribe()
```

## Troubleshooting

### Common Issues

**1. Migration Failed**
```bash
# Reset database
supabase db reset

# Or rollback last migration
supabase migration revert
```

**2. RLS Blocking Queries**
```bash
# Check policies
SELECT * FROM pg_policies WHERE tablename = 'your_table';

# Test with service role
# (temporarily disable RLS for testing)
ALTER TABLE table_name DISABLE ROW LEVEL SECURITY;
```

**3. Edge Function Timeout**
- Reduce function complexity
- Use background jobs for long tasks
- Check logs for errors

**4. Connection Pool Exhausted**
```bash
# Increase pool size in config.toml
[db.pooler]
default_pool_size = 40
max_client_conn = 200
```

## Resources

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/guides/cli)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Edge Functions Guide](https://supabase.com/docs/guides/functions)
- [Storage Guide](https://supabase.com/docs/guides/storage)
- [Prisma + Supabase](https://supabase.com/docs/guides/integrations/prisma)

## Support

- Supabase Discord: https://discord.supabase.com
- GitHub Issues: https://github.com/supabase/supabase/issues
- IntelliFlow CRM Docs: See `/docs` directory
