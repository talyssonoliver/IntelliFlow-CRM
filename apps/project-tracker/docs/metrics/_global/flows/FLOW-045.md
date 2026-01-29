### FLOW-045: AI Chain Versioning Admin UI

**Implements**: PG-128 (Chain Versioning Admin Page)
**Depends on**: IFC-086 (Model Versioning with Zep - Backend)

---

## 1. Flow Overview

The Chain Versioning Admin UI provides a centralized interface for managing AI chain/prompt versions, monitoring Zep episode usage, configuring A/B tests, and viewing audit logs.

### 1.1 User Stories

- **As an Admin**, I want to view all chain versions and their statuses so I can understand what's active in production
- **As an Admin**, I want to create new chain versions with custom prompts so I can test improvements
- **As an Admin**, I want to compare two versions side-by-side so I can understand differences
- **As an Admin**, I want to activate/deprecate/rollback versions so I can manage production chains
- **As an Admin**, I want to monitor Zep episode budget so I don't exceed the free tier
- **As an Admin**, I want to configure A/B tests so I can measure version performance
- **As an Admin**, I want to view audit logs so I have full traceability

---

## 2. UI Components

### 2.1 Page Structure

```
/settings/ai
├── Overview Dashboard
│   ├── Active Versions Summary (4 chain types)
│   ├── Zep Episode Budget Gauge
│   └── Recent Activity Timeline
├── Chain Versions Tab
│   ├── Filter by Chain Type (SCORING, QUALIFICATION, EMAIL_WRITER, FOLLOWUP)
│   ├── Filter by Status (DRAFT, ACTIVE, DEPRECATED, ARCHIVED)
│   ├── Version Cards/Table
│   │   ├── Version ID, Status Badge
│   │   ├── Model, Temperature, Max Tokens
│   │   ├── Rollout Strategy, Experiment ID
│   │   ├── Created By, Created At
│   │   └── Action Buttons (Activate, Deprecate, Archive, Rollback)
│   └── Create New Version Button → Version Editor Modal
├── Version Comparison Tab
│   ├── Select Version A (dropdown)
│   ├── Select Version B (dropdown)
│   └── Diff View (prompt, config)
├── A/B Testing Tab
│   ├── Active Experiments List
│   ├── Experiment Configuration Form
│   └── Results Dashboard (when available)
├── Zep Memory Tab
│   ├── Episode Usage Chart (used/remaining/warning/limit)
│   ├── Usage Trend Graph (last 30 days)
│   ├── Sync Status (last synced, cloud vs local)
│   └── Audit Log (recent episode changes)
└── Audit Log Tab
    ├── Filter by Version, Action, User, Date Range
    └── Audit Entries Table
```

### 2.2 Component Hierarchy

```
apps/web/src/app/(settings)/settings/ai/
├── page.tsx                         # Main AI Settings page
├── layout.tsx                       # AI settings layout with tabs
├── components/
│   ├── ChainVersionsDashboard.tsx   # Overview with active versions
│   ├── ChainVersionsTable.tsx       # Filterable versions table
│   ├── ChainVersionCard.tsx         # Individual version display
│   ├── ChainVersionEditor.tsx       # Create/Edit version modal
│   ├── VersionComparisonView.tsx    # Side-by-side diff
│   ├── ZepBudgetGauge.tsx           # Episode usage visualization
│   ├── ZepUsageChart.tsx            # Usage trend chart
│   ├── ABTestConfig.tsx             # A/B test configuration
│   ├── VersionAuditLog.tsx          # Audit entries table
│   └── RollbackConfirmDialog.tsx    # Confirm rollback with reason
└── hooks/
    ├── useChainVersions.ts          # tRPC queries for versions
    ├── useZepBudget.ts              # tRPC queries for Zep stats
    └── useVersionAudit.ts           # tRPC queries for audit log
```

---

## 3. Data Flow

### 3.1 tRPC Endpoints (from IFC-086)

| Endpoint | Type | Access | UI Usage |
|----------|------|--------|----------|
| `chainVersion.list` | Query | Tenant | Versions table |
| `chainVersion.getById` | Query | Tenant | Version detail |
| `chainVersion.getActive` | Query | Tenant | Dashboard summary |
| `chainVersion.getStats` | Query | Tenant | Overview metrics |
| `chainVersion.getHistory` | Query | Tenant | Version timeline |
| `chainVersion.compare` | Query | Tenant | Comparison view |
| `chainVersion.getAuditLog` | Query | Admin | Audit log tab |
| `chainVersion.create` | Mutation | Tenant | Create version |
| `chainVersion.update` | Mutation | Tenant | Edit draft |
| `chainVersion.activate` | Mutation | Admin | Activate button |
| `chainVersion.deprecate` | Mutation | Admin | Deprecate button |
| `chainVersion.archive` | Mutation | Admin | Archive button |
| `chainVersion.rollback` | Mutation | Admin | Rollback dialog |

### 3.2 State Management

```typescript
// React Query / tRPC hooks pattern
const { data: versions, isLoading } = trpc.chainVersion.list.useQuery({
  chainType: selectedChainType,
  status: selectedStatus,
  limit: 50,
  offset: 0,
});

const { data: stats } = trpc.chainVersion.getStats.useQuery({
  chainType: selectedChainType,
});

const activateMutation = trpc.chainVersion.activate.useMutation({
  onSuccess: () => {
    utils.chainVersion.list.invalidate();
    utils.chainVersion.getActive.invalidate();
    toast.success('Version activated');
  },
});
```

### 3.3 Zep Budget Data Flow

```
ZepMemoryAdapter (Backend)
    ↓ initialize()
    ├── Load from ZepEpisodeUsage (Prisma)
    ├── Sync with Zep Cloud API
    └── Update database if cloud > local
    ↓
tRPC Endpoint (to be added)
    ↓ chainVersion.getZepBudget
    ├── used: number
    ├── total: number
    ├── remaining: number
    ├── warningThreshold: number
    ├── hardLimit: number
    ├── isPersisted: boolean
    └── lastSyncedAt: Date | null
    ↓
ZepBudgetGauge (Frontend Component)
    ├── Circular progress gauge
    ├── Color: green → yellow (80%) → red (95%)
    └── Tooltip with detailed stats
```

---

## 4. UI/UX Specifications

### 4.1 Version Status Badges

| Status | Color | Icon |
|--------|-------|------|
| DRAFT | Gray | Pencil |
| ACTIVE | Green | CheckCircle |
| DEPRECATED | Yellow | Clock |
| ARCHIVED | Gray (faded) | Archive |

### 4.2 Rollout Strategy Indicators

| Strategy | Display | Description |
|----------|---------|-------------|
| IMMEDIATE | "100% Rollout" | Full deployment |
| PERCENTAGE | "X% Rollout" | Gradual rollout |
| AB_TEST | "A/B Test: {experimentId}" | Experiment link |

### 4.3 Confirmation Dialogs

**Activate Version:**
```
Title: Activate Version v{version}?
Body: This will:
  - Deprecate the current active version
  - Make this version the default for all {chainType} operations
Action: Activate | Cancel
```

**Rollback Version:**
```
Title: Rollback to Version v{version}?
Body: This will:
  - Deprecate the current active version
  - Create a new version based on the selected version
  - A rollback reason is required for audit purposes
Input: Reason for rollback (required)
Action: Rollback | Cancel
```

---

## 5. Security Considerations

### 5.1 Access Control

| Action | Required Role |
|--------|---------------|
| View versions | Tenant member |
| Create/update draft | Tenant member |
| Activate/deprecate/archive | Admin only |
| Rollback | Admin only |
| View audit log | Admin only |

### 5.2 Audit Trail

All actions are logged in `ChainVersionAudit` with:
- Timestamp (ISO 8601)
- User ID
- Action type
- Previous state
- New state
- Reason (for rollbacks)

---

## 6. Error Handling

| Error | User Message | Action |
|-------|--------------|--------|
| Version not found | "Version no longer exists" | Refresh list |
| Cannot activate non-draft | "Only draft versions can be activated" | Show status |
| No active version for rollback | "No active version to rollback from" | Disable button |
| Zep API unavailable | "Cloud sync unavailable, using local data" | Show warning |

---

## 7. Performance Targets

| Metric | Target |
|--------|--------|
| Page load | < 500ms |
| Version list query | < 200ms |
| Version comparison | < 300ms |
| Activate/Rollback | < 1s |
| Lighthouse score | >= 90 |

---

## 8. Test Scenarios

1. **List Versions**: Filter by chain type, filter by status, pagination
2. **Create Version**: Create draft, edit draft, validate prompts
3. **Activate Version**: Confirm dialog, previous version deprecated, success toast
4. **Rollback Version**: Require reason, create new version, success toast
5. **Compare Versions**: Select two versions, view diff
6. **Zep Budget**: Display gauge, warning at 80%, alert at 95%
7. **Audit Log**: Filter by action, filter by date, pagination

---

## 9. Related Files

### Backend (IFC-086 - Completed)
- `apps/api/src/modules/chain-version/chain-version.router.ts`
- `packages/application/src/services/ChainVersionService.ts`
- `packages/domain/src/ai/ChainVersionConstants.ts`
- `packages/validators/src/chain-version.ts`
- `packages/adapters/src/memory/zep/zep-client.ts`

### Frontend (PG-128 - To Be Created)
- `apps/web/src/app/(settings)/settings/ai/page.tsx`
- `apps/web/src/app/(settings)/settings/ai/components/*.tsx`
- `apps/web/src/app/(settings)/settings/ai/hooks/*.ts`

### Artifacts
- `artifacts/misc/prompt-versions/prompt-versions-latest.json`
- `artifacts/misc/ab-test-config.yaml`
