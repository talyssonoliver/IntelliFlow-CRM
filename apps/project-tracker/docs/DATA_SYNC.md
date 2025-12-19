# Data Synchronization System

## Overview

The IntelliFlow CRM Tracker uses **Sprint_plan.csv as the single source of
truth** for all task data. All other metrics files (JSON files, phase summaries,
task registry) are **derived** from this CSV file.

## The Problem

Previously, manual edits to individual JSON files created inconsistencies:

- CSV showed 11 tasks "In Progress" but `_summary.json` showed 3
- Task statuses were out of sync between different files
- No automatic propagation of CSV changes to dependent files

## The Solution

### Automatic Synchronization

The system now **automatically syncs** all metrics files whenever:

1. **CSV is uploaded** via the Upload CSV button
2. **Page refreshes** and loads the CSV from the server
3. **Manual sync** is triggered via the "Sync" button on the Metrics page

### Architecture

```
Sprint_plan.csv (SOURCE OF TRUTH)
       ↓
   [Sync Process]
       ↓
   ├── Sprint_plan.json
   ├── task-registry.json
   ├── Individual task files (*.json)
   └── Phase summaries (_phase-summary.json)
```

## Files Updated by Sync

When sync runs, it updates:

1. **`Sprint_plan.json`** - Structured JSON grouped by section
2. **`task-registry.json`** - Central registry with status tracking
3. **Individual task files** - All `{TASK_ID}.json` files for Sprint 0 tasks
4. **Phase summaries** - Aggregated metrics for each phase

## How to Use

### Automatic (Recommended)

✅ **Just use the app normally** - sync happens automatically!

- Upload a CSV → Auto-syncs
- Click Refresh → Auto-syncs
- Edit CSV file → Click Refresh → Auto-syncs

### Manual Sync Options

#### Option 1: Via UI (Easiest)

1. Go to the **Metrics** page
2. Click the green **"Sync"** button
3. Wait for sync to complete
4. Click **"Refresh"** to see updated data

#### Option 2: Via API

```bash
curl -X POST http://localhost:3002/api/sync-metrics
```

#### Option 3: Via Script

```bash
cd apps/project-tracker
npx tsx scripts/sync-metrics.ts
```

## Data Flow

### When You Edit Sprint_plan.csv

1. **Edit the CSV** - Make your changes to
   `docs/metrics/_global/Sprint_plan.csv`
2. **Trigger Sync** - Click "Refresh" button or the "Sync" button
3. **Sync Runs** - Updates all derived JSON files
4. **View Updated Data** - Refresh the page to see changes

### What Gets Synced

#### Task Status Mapping

- CSV: `Done` or `Completed` → JSON: `DONE`
- CSV: `In Progress` → JSON: `IN_PROGRESS`
- CSV: `Blocked` → JSON: `BLOCKED`
- CSV: `Planned` → JSON: `PLANNED`

#### Task Registry

- Updates `tasks_by_status` arrays
- Updates `task_details` objects
- Preserves existing fields not in CSV
- Calculates sprint statistics

#### Individual Task Files

- Updates status, description, owner
- Sets timestamps for completed tasks
- Preserves custom fields like notes, duration

#### Phase Summaries

- Counts tasks by status per phase
- Updates completion timestamps
- Calculates aggregated metrics

## Troubleshooting

### Inconsistent Data After CSV Edit

**Problem:** You edited the CSV but the Metrics page shows old data.

**Solution:**

1. Click the green "Sync" button on the Metrics page
2. Then click "Refresh"
3. Verify the numbers match your CSV

### Sync Fails with Errors

**Problem:** Sync completes but shows errors for some tasks.

**Common causes:**

- Task file doesn't exist (e.g., `IFC-000.json`)
- Invalid task ID in CSV
- File permissions issue

**Solution:**

- Check the browser console for specific errors
- Create missing task files if needed
- Fix any typos in task IDs

### Numbers Still Don't Match

**Problem:** After sync, totals still look wrong.

**Debug steps:**

1. Open browser console
2. Look for "Metrics synced:" message
3. Check `filesUpdated` count
4. Verify CSV has correct Target Sprint values (0 for Sprint 0)

**Manual verification:**

```powershell
# Count Sprint 0 tasks by status
$csv = Import-Csv "docs\metrics\_global\Sprint_plan.csv"
$sprint0 = $csv | Where-Object { $_.'Target Sprint' -eq '0' }
$sprint0 | Group-Object Status | Select-Object Name, Count
```

## Best Practices

### ✅ DO

- **Always edit Sprint_plan.csv** - It's the source of truth
- **Click Sync after editing** - Propagate changes immediately
- **Use the UI buttons** - Easiest and safest way
- **Check console logs** - Verify sync succeeded

### ❌ DON'T

- **Don't edit JSON files directly** - They'll be overwritten on next sync
- **Don't skip syncing** - You'll have inconsistent data
- **Don't edit multiple files** - Only edit the CSV

## Technical Details

### Sync Process

1. **Read CSV** - Parse `Sprint_plan.csv` using Papa Parse
2. **Validate** - Check task IDs, sprints, statuses
3. **Update Files** - Write to all derived files atomically
4. **Report Results** - Log success/errors

### Performance

- **Speed:** ~300-400ms for 27 tasks
- **Files Updated:** ~30 files per sync
- **Error Handling:** Continues on individual file errors

### API Endpoint

**POST /api/sync-metrics**

Request:

```bash
curl -X POST http://localhost:3002/api/sync-metrics
```

Response (Success):

```json
{
  "success": true,
  "message": "Metrics synchronized successfully",
  "summary": {
    "tasksProcessed": 304,
    "filesWritten": 29,
    "timeElapsed": 346
  },
  "filesUpdated": ["Sprint_plan.json", "task-registry.json", "..."]
}
```

Response (Partial Failure):

```json
{
  "success": false,
  "message": "Sync completed with errors",
  "summary": { ... },
  "filesUpdated": [ ... ],
  "errors": [
    "IFC-000.json: Task file not found"
  ]
}
```

## Future Enhancements

- [ ] Real-time sync via WebSocket
- [ ] Conflict resolution UI for merge conflicts
- [ ] Validation before sync (prevent invalid data)
- [ ] Rollback capability if sync fails
- [ ] Sync history and audit log
- [ ] Dry-run mode to preview changes

## Related Files

- `lib/data-sync.ts` - Sync utility functions
- `lib/data-validator.ts` - Data consistency validation
- `app/api/sync-metrics/route.ts` - API endpoint
- `scripts/sync-metrics.ts` - CLI script
- `app/page.tsx` - Auto-sync integration
- `components/MetricsView.tsx` - UI sync button
