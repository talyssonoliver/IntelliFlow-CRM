# Supabase Free Tier Optimization Guide

**Task ID**: IFC-011 **Version**: 1.0.0 **Last Updated**: 2025-12-26
**Project**: IntelliFlow CRM

## Overview

This guide provides best practices for maximizing Supabase free tier value while
building IntelliFlow CRM. Following these guidelines will help you stay within
free tier limits for the first 4-5 months of development and early launch.

## Table of Contents

1. [Connection Pooling Best Practices](#connection-pooling-best-practices)
2. [Query Optimization for Free Tier](#query-optimization-for-free-tier)
3. [Caching Strategies](#caching-strategies)
4. [Storage Management](#storage-management)
5. [Realtime Optimization](#realtime-optimization)
6. [When to Upgrade](#when-to-upgrade)

---

## Connection Pooling Best Practices

### Why Connection Pooling Matters

Supabase free tier has limited compute resources. Connection pooling
dramatically reduces the overhead of creating new database connections, allowing
more concurrent users with the same resources.

### Implementation

#### 1. Use Supabase's Built-in Connection Pooler

Supabase provides PgBouncer-based connection pooling. Use the pooled connection
string:

```typescript
// apps/api/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

// For transaction mode (recommended for serverless)
const pooledUrl = process.env.SUPABASE_DB_URL?.replace(':5432', ':6543');

// Use pooled connection for API routes
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  {
    db: {
      schema: 'public',
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
```

#### 2. Connection Pool Configuration for Prisma

```typescript
// packages/db/prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Use pgbouncer for connection pooling
  directUrl = env("DIRECT_URL")
}

// In .env files:
// DATABASE_URL uses port 6543 (pooled)
// DIRECT_URL uses port 5432 (direct, for migrations)
```

#### 3. Serverless Connection Patterns

```typescript
// Reuse connections across invocations
let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!cachedClient) {
    cachedClient = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!
    );
  }
  return cachedClient;
}
```

### Best Practices Checklist

- [ ] Always use port 6543 for application connections
- [ ] Use port 5432 only for migrations and admin tasks
- [ ] Implement connection reuse in serverless functions
- [ ] Set appropriate connection timeouts (30s recommended)
- [ ] Monitor connection count in Supabase dashboard

---

## Query Optimization for Free Tier

### Use Indexes Strategically

```sql
-- Create indexes for frequently queried columns
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_owner_id ON leads(owner_id);
CREATE INDEX idx_leads_created_at ON leads(created_at DESC);

-- Composite index for common filter combinations
CREATE INDEX idx_leads_owner_status ON leads(owner_id, status);

-- Partial index for active records only
CREATE INDEX idx_active_leads ON leads(owner_id)
WHERE deleted_at IS NULL AND status != 'closed';
```

### Optimize Query Patterns

#### 1. Select Only Needed Columns

```typescript
// Bad: Fetches all columns
const { data } = await supabase.from('leads').select('*');

// Good: Fetch only what you need
const { data } = await supabase
  .from('leads')
  .select('id, name, email, status, score');
```

#### 2. Use Pagination

```typescript
// Implement cursor-based pagination for large datasets
const PAGE_SIZE = 20;

async function getLeads(cursor?: string) {
  let query = supabase
    .from('leads')
    .select('id, name, email, created_at')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1); // Fetch one extra to check if more exist

  if (cursor) {
    query = query.lt('created_at', cursor);
  }

  const { data } = await query;

  const hasMore = data && data.length > PAGE_SIZE;
  const leads = hasMore ? data.slice(0, PAGE_SIZE) : data;
  const nextCursor = hasMore ? leads[leads.length - 1]?.created_at : null;

  return { leads, nextCursor, hasMore };
}
```

#### 3. Use Database Functions for Complex Logic

```sql
-- Move complex logic to database functions
CREATE OR REPLACE FUNCTION calculate_lead_score(lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
  score INTEGER := 0;
  lead_record RECORD;
BEGIN
  SELECT * INTO lead_record FROM leads WHERE id = lead_id;

  -- Score based on completeness
  IF lead_record.email IS NOT NULL THEN score := score + 10; END IF;
  IF lead_record.phone IS NOT NULL THEN score := score + 10; END IF;
  IF lead_record.company IS NOT NULL THEN score := score + 15; END IF;

  -- Score based on engagement
  score := score + (
    SELECT COUNT(*) * 5
    FROM interactions
    WHERE lead_id = lead_record.id
    AND created_at > NOW() - INTERVAL '30 days'
  );

  RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql;
```

#### 4. Use Materialized Views for Analytics

```sql
-- Create materialized view for dashboard metrics
CREATE MATERIALIZED VIEW lead_analytics AS
SELECT
  owner_id,
  status,
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as lead_count,
  AVG(score) as avg_score
FROM leads
WHERE deleted_at IS NULL
GROUP BY owner_id, status, DATE_TRUNC('day', created_at);

-- Create index on materialized view
CREATE INDEX idx_lead_analytics_owner ON lead_analytics(owner_id);

-- Refresh periodically (via pg_cron or scheduled job)
REFRESH MATERIALIZED VIEW CONCURRENTLY lead_analytics;
```

### Row Level Security (RLS) Optimization

```sql
-- Efficient RLS policy using auth.uid()
CREATE POLICY "Users can view own leads" ON leads
  FOR SELECT
  USING (owner_id = auth.uid());

-- Use security definer functions for complex policies
CREATE OR REPLACE FUNCTION can_access_lead(lead_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM leads l
    JOIN team_members tm ON l.team_id = tm.team_id
    WHERE l.id = lead_id
    AND tm.user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE POLICY "Team members can view team leads" ON leads
  FOR SELECT
  USING (can_access_lead(id));
```

---

## Caching Strategies

### 1. Client-Side Caching with React Query

```typescript
// apps/web/lib/queries.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: () => fetchLeads(filters),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
}

// Prefetch next page for instant pagination
export function usePrefetchNextPage(currentPage: number) {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.prefetchQuery({
      queryKey: ['leads', { page: currentPage + 1 }],
      queryFn: () => fetchLeads({ page: currentPage + 1 }),
    });
  }, [currentPage]);
}
```

### 2. Server-Side Caching with Upstash Redis

```typescript
// apps/api/src/lib/cache.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

const CACHE_TTL = 60 * 5; // 5 minutes

export async function getCachedOrFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = CACHE_TTL
): Promise<T> {
  // Try cache first
  const cached = await redis.get<T>(key);
  if (cached) {
    return cached;
  }

  // Fetch and cache
  const data = await fetchFn();
  await redis.setex(key, ttl, data);
  return data;
}

// Usage in tRPC router
export const leadRouter = router({
  getDashboardStats: publicProcedure.query(async ({ ctx }) => {
    return getCachedOrFetch(
      `dashboard:${ctx.user.id}`,
      () => calculateDashboardStats(ctx.user.id),
      300 // 5 minute TTL
    );
  }),
});
```

### 3. Edge Caching with Vercel

```typescript
// apps/web/app/api/leads/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  const leads = await fetchLeads();

  return NextResponse.json(leads, {
    headers: {
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
```

### 4. Supabase Storage CDN

```typescript
// Use Supabase's built-in CDN for public files
const { data } = await supabase.storage
  .from('public-assets')
  .getPublicUrl('images/logo.png');

// For private files, use signed URLs with caching
const { data: signedUrl } = await supabase.storage
  .from('documents')
  .createSignedUrl('path/to/file.pdf', 3600); // 1 hour expiry
```

---

## Storage Management

### Image Optimization Before Upload

```typescript
// apps/web/lib/image-utils.ts
export async function optimizeImage(file: File): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const img = await createImageBitmap(file);

  // Max dimensions
  const MAX_WIDTH = 1200;
  const MAX_HEIGHT = 1200;

  let { width, height } = img;

  if (width > MAX_WIDTH) {
    height = (height * MAX_WIDTH) / width;
    width = MAX_WIDTH;
  }
  if (height > MAX_HEIGHT) {
    width = (width * MAX_HEIGHT) / height;
    height = MAX_HEIGHT;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob!),
      'image/webp',
      0.85 // Quality
    );
  });
}

// Usage
async function uploadAvatar(file: File) {
  const optimized = await optimizeImage(file);
  // Original: 2MB -> Optimized: ~150KB

  const { data, error } = await supabase.storage
    .from('avatars')
    .upload(`${userId}/avatar.webp`, optimized);
}
```

### Storage Lifecycle Management

```typescript
// tools/scripts/cleanup-old-files.ts
async function cleanupOldTemporaryFiles() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: files } = await supabase.storage.from('temp-uploads').list();

  const oldFiles = files?.filter((f) => new Date(f.created_at) < thirtyDaysAgo);

  for (const file of oldFiles || []) {
    await supabase.storage.from('temp-uploads').remove([file.name]);
  }
}

// Schedule via pg_cron or external cron
```

### Storage Budget Monitoring

```typescript
// Monitor storage usage
async function checkStorageUsage() {
  const buckets = ['avatars', 'documents', 'temp-uploads'];
  let totalSize = 0;

  for (const bucket of buckets) {
    const { data } = await supabase.storage.from(bucket).list();
    const bucketSize =
      data?.reduce((sum, f) => sum + (f.metadata?.size || 0), 0) || 0;
    totalSize += bucketSize;
  }

  const usagePercent = (totalSize / (1024 * 1024 * 1024)) * 100; // 1GB limit

  if (usagePercent > 80) {
    console.warn(`Storage at ${usagePercent.toFixed(1)}% - consider cleanup`);
  }

  return { totalSize, usagePercent };
}
```

---

## Realtime Optimization

### Subscribe Selectively

```typescript
// Bad: Subscribe to all changes
supabase.channel('all-changes').on(
  'postgres_changes',
  {
    event: '*',
    schema: 'public',
  },
  handleChange
);

// Good: Subscribe only to what the user needs
function useLeadUpdates(leadId: string) {
  useEffect(() => {
    const channel = supabase
      .channel(`lead:${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `id=eq.${leadId}`,
        },
        (payload) => handleLeadUpdate(payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leadId]);
}
```

### Lazy Load Presence

```typescript
// Only enable presence for collaborative features
function useCollaborativeEditing(documentId: string) {
  const [presenceEnabled, setPresenceEnabled] = useState(false);

  useEffect(() => {
    if (!presenceEnabled) return;

    const channel = supabase.channel(`doc:${documentId}`, {
      config: { presence: { key: userId } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        setActiveUsers(Object.keys(state));
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [documentId, presenceEnabled]);

  return { enablePresence: () => setPresenceEnabled(true) };
}
```

### Connection Management

```typescript
// Track and limit realtime connections
class RealtimeManager {
  private channels: Map<string, RealtimeChannel> = new Map();
  private MAX_CHANNELS = 10;

  subscribe(channelName: string, config: ChannelConfig) {
    // Remove oldest channel if at limit
    if (this.channels.size >= this.MAX_CHANNELS) {
      const oldest = this.channels.keys().next().value;
      this.unsubscribe(oldest);
    }

    const channel = supabase.channel(channelName);
    // Configure channel...
    channel.subscribe();
    this.channels.set(channelName, channel);
  }

  unsubscribe(channelName: string) {
    const channel = this.channels.get(channelName);
    if (channel) {
      supabase.removeChannel(channel);
      this.channels.delete(channelName);
    }
  }
}
```

---

## When to Upgrade

### Immediate Upgrade Triggers

| Metric               | Free Tier Limit | Upgrade Threshold | Action                         |
| -------------------- | --------------- | ----------------- | ------------------------------ |
| Database Storage     | 500 MB          | >450 MB (90%)     | Upgrade to Pro or archive data |
| File Storage         | 1 GB            | >900 MB (90%)     | Upgrade to Pro or cleanup      |
| Bandwidth            | 2 GB/month      | >1.8 GB (90%)     | Implement CDN or upgrade       |
| Realtime Connections | 200             | >180 concurrent   | Upgrade to Pro                 |
| Edge Invocations     | 500K/month      | >450K (90%)       | Optimize or upgrade            |

### Business Triggers

1. **First Paying Customer**: Upgrade to Pro for:
   - Daily automated backups
   - Point-in-time recovery
   - Email support
   - Extended log retention

2. **Enterprise Sales**: Upgrade to Team for:
   - SSO (SAML 2.0)
   - 99.9% SLA
   - Priority support
   - SOC 2 compliance

3. **Multi-Region Requirements**: Consider Pro with additional compute add-ons

### Cost-Benefit Analysis Before Upgrading

Before upgrading, try these optimizations:

1. **Database full?**
   - Archive old records to cold storage
   - Implement data retention policies
   - Vacuum and analyze tables

2. **Bandwidth high?**
   - Enable Cloudflare CDN
   - Compress API responses
   - Implement aggressive caching

3. **Too many connections?**
   - Review subscription patterns
   - Implement connection pooling
   - Unsubscribe inactive channels

### Upgrade Decision Matrix

```
IF database_usage > 90% AND cannot_archive:
  UPGRADE to Pro

IF paying_customers > 0:
  UPGRADE to Pro (for backups)

IF enterprise_customer_requires_sso:
  UPGRADE to Team

IF bandwidth > 90% AND cdn_not_feasible:
  UPGRADE to Pro

OTHERWISE:
  OPTIMIZE first, monitor for 2 weeks, then reassess
```

---

## Monitoring Dashboard

Set up these alerts in your monitoring system:

```yaml
# artifacts/misc/supabase-alerts.yaml
alerts:
  - name: database_storage_warning
    condition: database_storage_percent > 80
    severity: warning
    action: notify_slack

  - name: database_storage_critical
    condition: database_storage_percent > 90
    severity: critical
    action: page_oncall

  - name: bandwidth_approaching_limit
    condition: monthly_bandwidth_percent > 75
    severity: warning
    action: notify_slack

  - name: realtime_connections_high
    condition: concurrent_connections > 150
    severity: warning
    action: notify_slack
```

---

## Quick Reference

### Free Tier Limits Summary

| Resource       | Limit           | Optimization Strategy                 |
| -------------- | --------------- | ------------------------------------- |
| Database       | 500 MB          | Archiving, soft deletes, vacuum       |
| Storage        | 1 GB            | Image compression, lifecycle policies |
| Bandwidth      | 2 GB/month      | CDN, caching, compression             |
| Realtime       | 200 connections | Selective subscriptions               |
| Edge Functions | 500K/month      | Caching, batching                     |
| MAU            | 50,000          | More than sufficient                  |

### Recommended Tools

- **Monitoring**: Supabase Dashboard, custom alerts
- **Caching**: Upstash Redis, Vercel Edge Cache
- **CDN**: Cloudflare, Vercel Edge Network
- **Image Optimization**: Sharp, browser canvas API
- **Query Analysis**: Supabase SQL Editor, EXPLAIN ANALYZE

---

## Related Documentation

- [Supabase Usage Report](../../artifacts/reports/supabase-usage-report.json)
- [Cost Projection Analysis](../../artifacts/reports/cost-projection.json)
- [Upgrade Triggers Configuration](../../artifacts/misc/upgrade-triggers.yaml)
