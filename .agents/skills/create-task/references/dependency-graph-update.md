# Dependency Graph Update

File: `apps/project-tracker/docs/metrics/_global/dependency-graph.json`

## Node Structure

Each node in the `nodes` object:
```json
{
  "task_id": "IFC-183",
  "sprint": 5,
  "status": "BACKLOG",
  "dependencies": ["IFC-002", "IFC-131"],
  "dependents": []
}
```

Fields:
- `task_id`: string — matches the task ID
- `sprint`: integer — sprint number (not "sprint-5", just `5`)
- `status`: string — UPPERCASE (`BACKLOG`, `PLANNED`, `DONE`, `IN_PROGRESS`, etc.)
- `dependencies`: array of string — task IDs this task depends on
- `dependents`: array of string — task IDs that depend on this task (populated by reverse edges)

## Update Procedure

### Step 1: Add the new node

Add a new entry to `nodes`:
```json
"IFC-183": {
  "task_id": "IFC-183",
  "sprint": 5,
  "status": "BACKLOG",
  "dependencies": ["IFC-002", "IFC-131"],
  "dependents": []
}
```

### Step 2: Add reverse edges

For each dependency, add the new task ID to that dependency's `dependents` array.

Example: If IFC-183 depends on IFC-002 and IFC-131:
- Add `"IFC-183"` to `nodes["IFC-002"].dependents`
- Add `"IFC-183"` to `nodes["IFC-131"].dependents`

### Step 3: Circular dependency detection

Before writing, walk the dependency chain recursively:
1. Start from the new task's dependencies
2. For each dependency, check its dependencies
3. If the new task ID appears anywhere in the chain → CIRCULAR — abort and report to user

Pseudocode:
```
function hasCircular(taskId, graph, visited = new Set()):
  if taskId in visited: return true
  visited.add(taskId)
  for dep in graph[taskId].dependencies:
    if hasCircular(dep, graph, visited): return true
  return false
```

### Step 4: Cross-sprint dependencies

If any dependency is in a different sprint than the new task, add an entry to the `cross_sprint_dependencies` array:
```json
{
  "from": "IFC-183",
  "to": "IFC-002",
  "from_sprint": 5,
  "to_sprint": 1
}
```

### Step 5: Update metadata

Update the `last_updated` field to current ISO timestamp.

## DO NOT Touch

These fields are computed by the sync process — do not manually edit:
- `critical_paths`
- `blocked_tasks`
- `ready_to_start`
- `statistics`
- Any other top-level computed fields

Only modify: `nodes`, `cross_sprint_dependencies`, `last_updated`.

## Dependency Verification

After updating, verify:
1. Every ID in the new node's `dependencies` exists in `nodes`
2. Every dependency node's `dependents` includes the new task ID
3. No circular references detected
4. Cross-sprint entries added for all cross-sprint edges
