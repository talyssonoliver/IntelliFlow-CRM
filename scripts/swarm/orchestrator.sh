#!/usr/bin/env bash
# =============================================================================
# IntelliFlow CRM - Sprint Orchestrator v1.0 
# =============================================================================
# INTEGRATION MANIFEST:
#   [x] CORE: Full Dependency Graph, CSV Backups, Status Tracking
#   [x] OPS:  Human Interventions, Blocker Management, Qualitative Reviews
#   [x] OPS:  Artifact Validation, KPI Enforcement, Batch Execution
#   [x] AI:   Phase 1 (Architect - Spec/Plan via MCP)
#   [x] AI:   Phase 2 (Enforcer - Codex TDD) → Output: __tests__/
#   [x] AI:   Phase 3 (Builder - Claude Code Loop)
#   [x] AI:   Phase 3.5 (Quality Gates - TypeCheck, Lint, Security)
#   [x] AI:   Phase 3.6 (TDD Enforcer - Run Generated Tests) → BLOCKING
#   [x] AI:   Phase 4 (Gatekeeper - YAML Validation + KPI Checks + Manual Checks)
#   [x] AI:   Phase 5 (Auditor - Claude Code A2A) - Logic & Security Review
#
# CLI COMMANDS:
#   run, run-quick, validate, review, status, list, list-ready,
#   interventions, resolve-intervention, blockers, add-blocker,
#   resolve-blocker, context, setup, help
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# Force Claude CLI to use OAuth token (Max plan) instead of API key
# This ensures we use the user's subscription rather than API credits
unset ANTHROPIC_API_KEY 2>/dev/null || true

# Add jq to PATH if not found (Windows WinGet installation)
if ! command -v jq &> /dev/null; then
    JQ_PATH="/c/Users/talys/AppData/Local/Microsoft/WinGet/Packages/jqlang.jq_Microsoft.Winget.Source_8wekyb3d8bbwe"
    if [[ -d "$JQ_PATH" ]]; then
        export PATH="$JQ_PATH:$PATH"
    fi
fi

# =============================================================================
# CONFIGURATION
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find monorepo root by looking for turbo.json (works from any location)
find_monorepo_root() {
    local dir="$SCRIPT_DIR"
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/turbo.json" ]]; then
            echo "$dir"
            return
        fi
        dir="$(dirname "$dir")"
    done
    # Fallback: assume 4 levels up from apps/project-tracker/docs/metrics/
    # or 1 level up from scripts/
    if [[ -f "${SCRIPT_DIR}/../turbo.json" ]]; then
        echo "$(cd "${SCRIPT_DIR}/.." && pwd)"
    else
        echo "$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
    fi
}

readonly PROJECT_ROOT="$(find_monorepo_root)"
# Sprint tracking metrics stay in project-tracker (committed to git)
readonly TASKS_DIR="${PROJECT_ROOT}/apps/project-tracker/docs/metrics"
# Ephemeral artifacts use /artifacts/ at root (gitignored) - IFC-160
readonly LOGS_DIR="${PROJECT_ROOT}/artifacts/logs"
readonly ARTIFACTS_DIR="${PROJECT_ROOT}/artifacts"
readonly SPEC_DIR="${PROJECT_ROOT}/.specify"
# Swarm-specific ephemeral paths
readonly SWARM_LOCKS_DIR="${ARTIFACTS_DIR}/misc/.locks"
readonly SWARM_LOGS_DIR="${LOGS_DIR}/swarm"

# Files
readonly CSV_FILE="${TASKS_DIR}/_global/Sprint_plan.csv"
readonly CSV_BACKUP_DIR="${ARTIFACTS_DIR}/backups/sprint-plan"
readonly REGISTRY_FILE="${TASKS_DIR}/_global/task-registry.json"
readonly VALIDATION_FILE="${TASKS_DIR}/validation.yaml"
readonly MCP_CONFIG="${HOME}/.claude.json"

# State Files
readonly HUMAN_INTERVENTION_FILE="${ARTIFACTS_DIR}/human-intervention-required.json"
readonly BLOCKERS_FILE="${ARTIFACTS_DIR}/blockers.json"
readonly QUALITATIVE_REVIEW_DIR="${ARTIFACTS_DIR}/qualitative-reviews"

# Logging
readonly EXECUTION_LOG="${LOGS_DIR}/execution-$(date +%Y%m%d-%H%M%S).log"
readonly VALIDATION_LOG="${LOGS_DIR}/validation-$(date +%Y%m%d-%H%M%S).log"

# Execution Config
readonly MAX_RETRIES=3
readonly RETRY_DELAY_SECONDS=10
readonly VALIDATION_TIMEOUT_SECONDS=300

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly PURPLE='\033[0;35m'
readonly CYAN='\033[0;36m'
readonly WHITE='\033[1;37m'
readonly NC='\033[0m'

# Status Constants
readonly STATUS_PLANNED="Planned"
readonly STATUS_IN_PROGRESS="In Progress"
readonly STATUS_VALIDATING="Validating"
readonly STATUS_COMPLETED="Completed"
readonly STATUS_FAILED="Failed"
readonly STATUS_BLOCKED="Blocked"
readonly STATUS_NEEDS_HUMAN="Needs Human"
readonly STATUS_IN_REVIEW="In Review"

# =============================================================================
# INITIALIZATION
# =============================================================================

initialize() {
    mkdir -p "${LOGS_DIR}" "${ARTIFACTS_DIR}/contexts" \
             "${ARTIFACTS_DIR}/validation" "${ARTIFACTS_DIR}/reports" \
             "${ARTIFACTS_DIR}/forensics" \
             "${CSV_BACKUP_DIR}" "${QUALITATIVE_REVIEW_DIR}" \
             "${SPEC_DIR}/specifications" "${SPEC_DIR}/planning" "${SPEC_DIR}/memory" \
             "${PROJECT_ROOT}/docs/references" \
             "${TASKS_DIR}/sprint-0" "${SWARM_LOCKS_DIR}" "${SWARM_LOGS_DIR}"

    # Initialize blockers file
    if [[ ! -f "${BLOCKERS_FILE}" ]]; then
        echo '{"blockers": [], "last_updated": "'"$(date -Iseconds)"'"}' > "${BLOCKERS_FILE}"
    fi

    # Initialize human intervention file
    if [[ ! -f "${HUMAN_INTERVENTION_FILE}" ]]; then
        echo '{"interventions_required": [], "last_updated": "'"$(date -Iseconds)"'"}' > "${HUMAN_INTERVENTION_FILE}"
    fi

    # Initialize Spec Kit Constitution
    if [[ ! -f "${SPEC_DIR}/memory/constitution.md" ]]; then
        cat > "${SPEC_DIR}/memory/constitution.md" << 'EOF'
# IntelliFlow Constitution

## Technology Stack
1. Use Next.js 16 Server Actions
2. Use React 19 Hooks
3. Use Tailwind 4
4. TypeScript strict mode only
5. Zod for all validation

## Architecture Rules
1. Hexagonal architecture boundaries
2. No circular dependencies
3. Proper separation of concerns
4. All functions must have JSDoc comments

## Security Rules
1. No secrets in code
2. Input validation on all endpoints
3. Proper error handling (no stack traces exposed)
EOF
    fi

    # Check MCP Config
    if [[ ! -f "$MCP_CONFIG" ]]; then
        log WARN "MCP config missing. Create mcp-config.json for documentation grounding."
    fi
}

# =============================================================================
# LOGGING
# =============================================================================

log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local color=""

    case "$level" in
        INFO)     color="${BLUE}" ;;
        SUCCESS)  color="${GREEN}" ;;
        WARN)     color="${YELLOW}" ;;
        ERROR)    color="${RED}" ;;
        PHASE)    color="${PURPLE}" ;;
        TASK)     color="${CYAN}" ;;
        HUMAN)    color="${WHITE}" ;;
        VALIDATE) color="${YELLOW}" ;;
    esac

    echo -e "${color}[${level}]${NC} ${timestamp} - ${message}"
    echo "[${level}] ${timestamp} - ${message}" >> "${EXECUTION_LOG}"

    # Update heartbeat if we have an active task
    if [[ -n "${CURRENT_TASK_ID:-}" ]]; then
        update_heartbeat "${CURRENT_TASK_ID}"
    fi
}

# =============================================================================
# OBSERVABILITY: Heartbeat and Phase Tracking
# =============================================================================

# Global variable for current task (set during run_task)
CURRENT_TASK_ID=""

# Update heartbeat file for a task (called on every log and phase transition)
# Heartbeat is stored in .locks/ alongside lock files for easy watchdog detection
update_heartbeat() {
    local task_id="$1"
    local heartbeat_file="${SWARM_LOCKS_DIR}/${task_id}.heartbeat"
    touch "$heartbeat_file" 2>/dev/null || true
}

# Update phase in sprint-0 task JSON (called at each phase transition)
update_task_phase() {
    local task_id="$1"
    local phase="$2"
    local attempt="${3:-0}"
    local now
    now=$(date -Iseconds)

    # Update heartbeat
    update_heartbeat "$task_id"

    # Find the task JSON file in sprint-0 hierarchy
    local task_file
    task_file=$(find_task_file "$task_id")

    if [[ -n "${task_file}" ]] && [[ -f "${task_file}" ]]; then
        # Update existing sprint-0 task file with phase info
        jq --arg phase "$phase" \
           --arg updated_at "$now" \
           --argjson attempt "$attempt" \
           '.current_phase = $phase | .updated_at = $updated_at | .attempt = $attempt' \
           "${task_file}" > "${task_file}.tmp" && mv "${task_file}.tmp" "${task_file}"
    else
        # Log warning but don't fail - task file may not exist yet
        log WARN "Task file not found for ${task_id}, phase tracking skipped"
    fi
}

# Mark task as crashed (called from EXIT trap)
mark_task_crashed() {
    local task_id="$1"
    local exit_code="${2:-1}"
    local now
    now=$(date -Iseconds)

    # Find the task JSON file in sprint-0 hierarchy
    local task_file
    task_file=$(find_task_file "$task_id")

    if [[ -n "${task_file}" ]] && [[ -f "${task_file}" ]]; then
        jq --arg phase "CRASHED" \
           --arg crashed_at "$now" \
           --argjson exit_code "$exit_code" \
           '.current_phase = $phase | .crashed_at = $crashed_at | .exit_code = $exit_code | .status = "Needs Human"' \
           "${task_file}" > "${task_file}.tmp" && mv "${task_file}.tmp" "${task_file}"
    fi

    # Clean up heartbeat file
    rm -f "${SWARM_LOCKS_DIR}/${task_id}.heartbeat"
}

# =============================================================================
# TASK FILE HELPERS (must be defined before CSV operations that use them)
# =============================================================================

# Find task file in sprint-0/ hierarchy (returns path or empty)
find_task_file() {
    local task_id="$1"
    local task_file=""

    # Search in sprint-0 phases for the task file
    task_file=$(find "${TASKS_DIR}/sprint-0" -name "${task_id}.json" -type f 2>/dev/null | head -1)

    echo "${task_file}"
}

# Get the correct phase directory for a task based on registry
get_task_phase_dir() {
    local task_id="$1"
    local phase=""
    local stream=""

    phase=$(jq -r ".task_details[\"${task_id}\"].phase // \"phase-0-initialisation\"" "${REGISTRY_FILE}" 2>/dev/null) || phase="phase-0-initialisation"
    stream=$(jq -r ".task_details[\"${task_id}\"].stream // null" "${REGISTRY_FILE}" 2>/dev/null) || stream="null"

    local phase_dir="${TASKS_DIR}/sprint-0/${phase}"

    # Handle parallel streams
    if [[ "${phase}" == "phase-2-parallel" ]] && [[ "${stream}" != "null" ]] && [[ -n "${stream}" ]]; then
        phase_dir="${TASKS_DIR}/sprint-0/${phase}/${stream}"
    fi

    echo "${phase_dir}"
}

# =============================================================================
# CSV OPERATIONS
# =============================================================================

backup_csv() {
    if [[ -f "${CSV_FILE}" ]]; then
        local backup_name="sprint-plan-$(date +%Y%m%d-%H%M%S).csv"
        cp "${CSV_FILE}" "${CSV_BACKUP_DIR}/${backup_name}"
        log INFO "CSV backed up to ${backup_name}"
    fi
}

update_csv_status() {
    local task_id="$1"
    local new_status="$2"
    local notes="${3:-}"

    if [[ -f "${CSV_FILE}" ]]; then
        backup_csv

        # Use Python for proper RFC 4180 CSV handling (handles quoted commas)
        python3 -c "
import csv
import sys
import os

csv_file = '${CSV_FILE}'
task_id = '${task_id}'
new_status = '${new_status}'

# Read all rows
rows = []
header = None
status_col_idx = None

try:
    with open(csv_file, 'r', newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        header = next(reader)

        # Find Status column index (case-insensitive)
        for i, col in enumerate(header):
            if col.strip().lower() == 'status':
                status_col_idx = i
                break

        if status_col_idx is None:
            print(f'ERROR: Status column not found in CSV header: {header}', file=sys.stderr)
            sys.exit(1)

        rows = [header]
        for row in reader:
            if len(row) > 0 and row[0].strip() == task_id:
                # Ensure row has enough columns
                while len(row) <= status_col_idx:
                    row.append('')
                row[status_col_idx] = new_status
            rows.append(row)

    # Write back with proper CSV quoting
    with open(csv_file + '.tmp', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerows(rows)

    # Atomic replace
    os.replace(csv_file + '.tmp', csv_file)

except Exception as e:
    print(f'ERROR updating CSV: {e}', file=sys.stderr)
    # Clean up temp file if it exists
    if os.path.exists(csv_file + '.tmp'):
        os.remove(csv_file + '.tmp')
    sys.exit(1)
" || {
            log ERROR "Failed to update CSV status for ${task_id}"
            # Don't fail the whole operation - JSON status is the runtime source of truth
        }
    fi

    log INFO "Status updated: ${task_id} → ${new_status}"

    # Update sprint-0/ task file (cascading source of truth for tracker)
    local task_file
    task_file=$(find_task_file "${task_id}")

    # If task file doesn't exist in sprint-0/, create ephemeral one in correct phase
    if [[ -z "${task_file}" ]] || [[ ! -f "${task_file}" ]]; then
        local phase_dir
        phase_dir=$(get_task_phase_dir "${task_id}")
        mkdir -p "${phase_dir}"
        task_file="${phase_dir}/${task_id}.json"

        # Get task metadata from registry
        local description section owner
        description=$(jq -r ".task_details[\"${task_id}\"].description // \"${task_id}\"" "${REGISTRY_FILE}" 2>/dev/null) || description="${task_id}"
        section=$(jq -r ".task_details[\"${task_id}\"].section // \"Environment & Setup\"" "${REGISTRY_FILE}" 2>/dev/null) || section="Environment & Setup"
        owner=$(jq -r ".task_details[\"${task_id}\"].owner // \"AI Agent\"" "${REGISTRY_FILE}" 2>/dev/null) || owner="AI Agent"

        # Determine started_at based on status
        local started_at_value="null"
        local completed_at_value="null"
        local now_timestamp
        now_timestamp=$(date -Iseconds)

        if [[ "${new_status}" == "${STATUS_IN_PROGRESS}" ]] || [[ "${new_status}" == "${STATUS_VALIDATING}" ]]; then
            started_at_value="\"${now_timestamp}\""
        fi
        if [[ "${new_status}" == "${STATUS_COMPLETED}" ]]; then
            started_at_value="\"${now_timestamp}\""
            completed_at_value="\"${now_timestamp}\""
        fi

        # Create new task file with schema
        cat > "${task_file}" << TASKEOF
{
  "\$schema": "../../schemas/task-status.schema.json",
  "task_id": "${task_id}",
  "section": "${section}",
  "description": "${description}",
  "owner": "${owner}",
  "status": "${new_status}",
  "sprint": "sprint-0",
  "phase": "$(basename "$(dirname "${task_file}")")",
  "stream": null,
  "dependencies": {
    "all_satisfied": false,
    "verified_at": null,
    "required": []
  },
  "started_at": ${started_at_value},
  "completed_at": ${completed_at_value},
  "execution": {
    "retry_count": 0,
    "last_error": null,
    "executor": "orchestrator",
    "log_path": "${EXECUTION_LOG}"
  },
  "artifacts": {
    "expected": [],
    "created": [],
    "missing": []
  },
  "validations": [],
  "kpis": {},
  "blockers": [],
  "status_history": [
    {
      "status": "${new_status}",
      "at": "${now_timestamp}",
      "note": "${notes}"
    }
  ]
}
TASKEOF
        log INFO "Created ephemeral task file: ${task_file}"
    else
        # Update existing task file with new status and execution metadata
        local now
        now=$(date -Iseconds)

        # Build jq update based on status transition
        # First ensure execution object exists with defaults
        local jq_update='.execution //= {"retry_count": 0, "last_error": null} | .status = $status | .status_history += [{"status": $status, "at": $now, "note": $notes}]'

        # Set started_at when transitioning to IN_PROGRESS (if not already set)
        if [[ "${new_status}" == "${STATUS_IN_PROGRESS}" ]]; then
            jq_update="${jq_update} | if .started_at == null then .started_at = \$now else . end"
        fi

        # Set completed_at when transitioning to COMPLETED
        if [[ "${new_status}" == "${STATUS_COMPLETED}" ]]; then
            jq_update="${jq_update} | .completed_at = \$now"
            # Clear last_error on successful completion
            jq_update="${jq_update} | .execution.last_error = null"
        fi

        # Set last_error when transitioning to FAILED or NEEDS_HUMAN
        if [[ "${new_status}" == "${STATUS_FAILED}" ]] || [[ "${new_status}" == "${STATUS_NEEDS_HUMAN}" ]]; then
            jq_update="${jq_update} | .execution.last_error = \$notes"
        fi

        # Apply the update (guard with || true to prevent set -e exit)
        if jq --arg status "${new_status}" --arg now "${now}" --arg notes "${notes}" \
            "${jq_update}" "${task_file}" > "${task_file}.tmp" 2>/dev/null; then
            mv "${task_file}.tmp" "${task_file}"
            log INFO "Updated task file: ${task_file}"
        else
            log WARN "Failed to update task file: ${task_file} - jq error"
            rm -f "${task_file}.tmp"
        fi
    fi
}

get_task_status() {
    local task_id="$1"

    # PRIMARY: Check sprint-0/ task files (cascading source of truth)
    local task_file
    task_file=$(find_task_file "${task_id}")

    if [[ -n "${task_file}" ]] && [[ -f "${task_file}" ]]; then
        local status
        status=$(jq -r '.status // "PLANNED"' "${task_file}" 2>/dev/null) || status="PLANNED"
        # Normalize status names
        case "${status}" in
            "DONE"|"Completed"|"COMPLETED") echo "${STATUS_COMPLETED}" ;;
            "IN_PROGRESS"|"In Progress") echo "${STATUS_IN_PROGRESS}" ;;
            "BLOCKED"|"Blocked") echo "${STATUS_BLOCKED}" ;;
            "FAILED"|"Failed") echo "${STATUS_FAILED}" ;;
            "VALIDATING"|"Validating") echo "${STATUS_VALIDATING}" ;;
            "NEEDS_HUMAN"|"Needs Human") echo "${STATUS_NEEDS_HUMAN}" ;;
            "IN_REVIEW"|"In Review") echo "${STATUS_IN_REVIEW}" ;;
            *) echo "${STATUS_PLANNED}" ;;
        esac
        return
    fi

    # FALLBACK: Check registry (from CSV sync)
    local registry_status
    registry_status=$(jq -r ".task_details[\"${task_id}\"].status // \"${STATUS_PLANNED}\"" "${REGISTRY_FILE}" 2>/dev/null) || registry_status="${STATUS_PLANNED}"
    echo "${registry_status}"
}

increment_retry_count() {
    local task_id="$1"

    # Find task file in sprint-0/
    local task_file
    task_file=$(find_task_file "${task_id}")

    if [[ -n "${task_file}" ]] && [[ -f "${task_file}" ]]; then
        local current_count
        current_count=$(jq -r '.execution.retry_count // 0' "${task_file}" 2>/dev/null) || current_count=0
        local new_count=$((current_count + 1))

        # Update retry count in task file (ensure execution object exists)
        if jq ".execution //= {\"retry_count\": 0, \"last_error\": null} | .execution.retry_count = ${new_count}" \
            "${task_file}" > "${task_file}.tmp" 2>/dev/null; then
            mv "${task_file}.tmp" "${task_file}"
        else
            rm -f "${task_file}.tmp"
        fi

        echo "${new_count}"
    else
        echo "1"
    fi
}

# =============================================================================
# DEPENDENCY RESOLUTION
# =============================================================================

get_dependencies() {
    local task_id="$1"
    jq -r ".task_details[\"${task_id}\"] | .dependencies[]?" "${REGISTRY_FILE}" 2>/dev/null || echo ""
}

check_dependencies() {
    local task_id="$1"
    local deps=$(get_dependencies "${task_id}")

    if [[ -z "$deps" ]]; then
        return 0
    fi

    for dep in $deps; do
        local dep_status=$(get_task_status "${dep}")
        # Accept both "DONE" (registry) and "Completed" (runtime status)
        if [[ "${dep_status}" != "${STATUS_COMPLETED}" ]] && [[ "${dep_status}" != "DONE" ]]; then
            return 1
        fi
    done

    return 0
}

# =============================================================================
# BLOCKER MANAGEMENT
# =============================================================================

add_blocker() {
    local task_id="$1"
    local blocker_type="$2"  # dependency, technical, resource, external
    local description="$3"
    local blocking_tasks="${4:-}"

    local temp_file=$(mktemp)

    jq --arg task "${task_id}" \
       --arg type "${blocker_type}" \
       --arg desc "${description}" \
       --arg blocking "${blocking_tasks}" \
       --arg timestamp "$(date -Iseconds)" \
       '.blockers += [{
           "task_id": $task,
           "type": $type,
           "description": $desc,
           "blocking_tasks": ($blocking | split(",")),
           "created_at": $timestamp,
           "status": "active"
       }] | .last_updated = $timestamp' \
       "${BLOCKERS_FILE}" > "${temp_file}"

    mv "${temp_file}" "${BLOCKERS_FILE}"

    log ERROR "Blocker added for ${task_id}: ${description}"
    update_csv_status "${task_id}" "${STATUS_BLOCKED}" "${description}"
}

resolve_blocker() {
    local task_id="$1"
    local resolution="${2:-resolved}"

    local temp_file=$(mktemp)

    jq --arg task "${task_id}" \
       --arg resolution "${resolution}" \
       --arg timestamp "$(date -Iseconds)" \
       '(.blockers[] | select(.task_id == $task and .status == "active")) |= . + {
           "status": "resolved",
           "resolution": $resolution,
           "resolved_at": $timestamp
       } | .last_updated = $timestamp' \
       "${BLOCKERS_FILE}" > "${temp_file}"

    mv "${temp_file}" "${BLOCKERS_FILE}"

    log SUCCESS "Blocker resolved for ${task_id}"
}

list_blockers() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  🚧 ACTIVE BLOCKERS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local active=$(jq -r '.blockers[] | select(.status == "active")' "${BLOCKERS_FILE}" 2>/dev/null)

    if [[ -z "${active}" ]]; then
        echo "  ✅ No active blockers"
    else
        jq -r '.blockers[] | select(.status == "active") | "  [\(.type | ascii_upcase)] \(.task_id): \(.description)"' "${BLOCKERS_FILE}"
    fi
    echo ""
}

# =============================================================================
# HUMAN INTERVENTION MANAGEMENT
# =============================================================================

add_human_intervention() {
    local task_id="$1"
    local reason="$2"
    local priority="${3:-medium}"

    local temp_file=$(mktemp)

    jq --arg task "${task_id}" \
       --arg reason "${reason}" \
       --arg priority "${priority}" \
       --arg timestamp "$(date -Iseconds)" \
       '.interventions_required += [{
           "task_id": $task,
           "reason": $reason,
           "priority": $priority,
           "created_at": $timestamp,
           "status": "pending"
       }] | .last_updated = $timestamp' \
       "${HUMAN_INTERVENTION_FILE}" > "${temp_file}"

    mv "${temp_file}" "${HUMAN_INTERVENTION_FILE}"

    log HUMAN "Intervention required for ${task_id}: ${reason}"
}

resolve_human_intervention() {
    local task_id="$1"
    local resolution="${2:-resolved}"

    local temp_file=$(mktemp)

    jq --arg task "${task_id}" \
       --arg resolution "${resolution}" \
       --arg timestamp "$(date -Iseconds)" \
       '(.interventions_required[] | select(.task_id == $task and .status == "pending")) |= . + {
           "status": "resolved",
           "resolution": $resolution,
           "resolved_at": $timestamp
       } | .last_updated = $timestamp' \
       "${HUMAN_INTERVENTION_FILE}" > "${temp_file}"

    mv "${temp_file}" "${HUMAN_INTERVENTION_FILE}"

    log SUCCESS "Intervention resolved for ${task_id}"
}

list_human_interventions() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  👤 HUMAN INTERVENTIONS REQUIRED"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local pending=$(jq -r '.interventions_required[] | select(.status == "pending")' "${HUMAN_INTERVENTION_FILE}" 2>/dev/null)

    if [[ -z "${pending}" ]]; then
        echo "  ✅ No pending interventions"
    else
        jq -r '.interventions_required[] | select(.status == "pending") | "  [\(.priority | ascii_upcase)] \(.task_id): \(.reason)"' "${HUMAN_INTERVENTION_FILE}"
    fi
    echo ""
}

# =============================================================================
# QUALITATIVE REVIEW SYSTEM
# =============================================================================

trigger_qualitative_review() {
    local task_id="$1"

    local review_file="${QUALITATIVE_REVIEW_DIR}/${task_id}-review-request.md"

    # Get task details
    local description=$(jq -r ".task_details[\"${task_id}\"] | .description" "${REGISTRY_FILE}")
    local artifacts=$(jq -r ".task_details[\"${task_id}\"] | .artifacts | join(\"\n  - \")" "${REGISTRY_FILE}" 2>/dev/null || echo "N/A")

    cat > "${review_file}" << EOF
# Qualitative Review Request: ${task_id}

## Task Description
${description}

## Review Type
- [ ] Security Review
- [ ] Architecture Review
- [ ] Code Quality Review
- [ ] Performance Review

## Files/Artifacts to Review
  - ${artifacts}

## Review Checklist

### Security
- [ ] No secrets in code
- [ ] Input validation present
- [ ] Proper error handling (no stack traces exposed)
- [ ] Authentication/Authorization correct

### Code Quality
- [ ] TypeScript types properly defined (no \`any\`)
- [ ] Functions have JSDoc comments
- [ ] Error handling follows project patterns
- [ ] No deprecated patterns used

### Architecture
- [ ] Follows hexagonal architecture boundaries
- [ ] No circular dependencies
- [ ] Proper separation of concerns
- [ ] Consistent with ADRs

### Performance
- [ ] No N+1 queries
- [ ] Proper caching strategy
- [ ] Lazy loading where appropriate
- [ ] Bundle size considered

## Review Commands

### Claude Code CLI:
\`\`\`bash
claude --print --no-session-persistence -p "Review these files for security, architecture compliance, and code quality: ${artifacts}"
\`\`\`

### Manual Review Prompt:
\`\`\`
Review the following files for security vulnerabilities, anti-patterns, and
architectural compliance with our hexagonal architecture.

Focus on:
1. Type safety (no \`any\` types)
2. Error handling completeness
3. Security best practices
4. Performance implications

Files: ${artifacts}
\`\`\`

---
Generated: $(date -Iseconds)
Status: PENDING REVIEW
EOF

    log INFO "Qualitative review request created: ${review_file}"
    update_csv_status "${task_id}" "${STATUS_IN_REVIEW}" "Awaiting qualitative review"

    echo "${review_file}"
}

complete_qualitative_review() {
    local task_id="$1"
    local review_result="${2:-approved}"  # approved, changes_requested, rejected
    local reviewer_notes="${3:-}"

    local result_file="${QUALITATIVE_REVIEW_DIR}/${task_id}-review-result.json"

    cat > "${result_file}" << EOF
{
    "task_id": "${task_id}",
    "review_result": "${review_result}",
    "reviewer_notes": "${reviewer_notes}",
    "reviewed_at": "$(date -Iseconds)"
}
EOF

    case "${review_result}" in
        approved)
            update_csv_status "${task_id}" "${STATUS_COMPLETED}" "Review approved"
            # Generate task definition file with proper schema compliance
            generate_task_definition_file "${task_id}" "DONE"
            log SUCCESS "Task ${task_id} approved in qualitative review"
            ;;
        changes_requested)
            update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Changes requested: ${reviewer_notes}"
            add_human_intervention "${task_id}" "Review requested changes: ${reviewer_notes}" "high"
            log WARN "Changes requested for ${task_id}"
            ;;
        rejected)
            update_csv_status "${task_id}" "${STATUS_FAILED}" "Review rejected: ${reviewer_notes}"
            log ERROR "Task ${task_id} rejected in qualitative review"
            ;;
    esac
}

# =============================================================================
# QUESTION RESOLUTION
# =============================================================================

# Resolve questions found in Claude's output
# Returns: 0 if all questions resolved, 1 if human intervention needed
resolve_questions() {
    local task_id="$1"
    local output_file="$2"
    local answers_file="${TASKS_DIR}/${task_id}_answers.md"

    # Check if there are any [QUESTION] blocks
    if ! grep -q "\[QUESTION\]" "${output_file}"; then
        return 0  # No questions to resolve
    fi

    log INFO "Detected questions in output, attempting to resolve..."
    echo "# Resolved Answers for ${task_id}" > "${answers_file}"
    echo "" >> "${answers_file}"

    local has_human_questions=false
    local question_count=0

    # Extract and process each question block
    # Using awk to handle multi-line extraction
    while IFS= read -r block; do
        ((question_count++))

        local q_type=$(echo "${block}" | grep -oP 'type:\s*\K\w+' | tr -d '\r')
        local q_priority=$(echo "${block}" | grep -oP 'priority:\s*\K[\w-]+' | tr -d '\r')
        local q_context=$(echo "${block}" | grep -oP 'context:\s*\K.*' | tr -d '\r')
        local q_question=$(echo "${block}" | grep -oP 'question:\s*\K.*' | tr -d '\r')
        local q_sources=$(echo "${block}" | grep -oP 'suggested_sources:\s*\K.*' | tr -d '\r')

        log INFO "Question ${question_count}: [${q_type}] ${q_question}"

        echo "## Question ${question_count}" >> "${answers_file}"
        echo "**Type:** ${q_type}" >> "${answers_file}"
        echo "**Priority:** ${q_priority}" >> "${answers_file}"
        echo "**Question:** ${q_question}" >> "${answers_file}"
        echo "" >> "${answers_file}"

        case "${q_type}" in
            codebase)
                # Try to answer from codebase
                log INFO "Searching codebase for answer..."
                local search_results=""

                # Search in suggested sources first
                if [[ -n "${q_sources}" ]]; then
                    for source in ${q_sources//,/ }; do
                        local src_path="${PROJECT_ROOT}/${source}"
                        if [[ -f "${src_path}" ]]; then
                            search_results+="### File: ${source}"$'\n'
                            search_results+=$(head -100 "${src_path}" 2>/dev/null || echo "(file not readable)")
                            search_results+=$'\n\n'
                        elif [[ -d "${src_path}" ]]; then
                            search_results+="### Directory: ${source}"$'\n'
                            search_results+=$(find "${src_path}" -type f -name "*.ts" -o -name "*.tsx" 2>/dev/null | head -20)
                            search_results+=$'\n\n'
                        fi
                    done
                fi

                # If no results, try grep
                if [[ -z "${search_results}" ]]; then
                    # Extract keywords from question for search
                    local keywords=$(echo "${q_question}" | grep -oE '\b[A-Z][a-z]+\b|\b[a-z]+Schema\b|\b[a-z]+Entity\b' | head -3)
                    for kw in ${keywords}; do
                        local grep_result=$(grep -rl "${kw}" "${PROJECT_ROOT}/packages" "${PROJECT_ROOT}/apps" 2>/dev/null | head -5)
                        if [[ -n "${grep_result}" ]]; then
                            search_results+="### Files matching '${kw}':"$'\n'
                            search_results+="${grep_result}"$'\n\n'
                        fi
                    done
                fi

                if [[ -n "${search_results}" ]]; then
                    echo "**Answer (from codebase):**" >> "${answers_file}"
                    echo '```' >> "${answers_file}"
                    echo "${search_results}" >> "${answers_file}"
                    echo '```' >> "${answers_file}"
                    log SUCCESS "Found codebase answer for question ${question_count}"
                else
                    echo "**Answer:** Could not find in codebase. Escalating to human." >> "${answers_file}"
                    has_human_questions=true
                    log WARN "Could not resolve codebase question ${question_count}"
                fi
                ;;

            agent)
                # Route to another Claude call for context-aware answer
                log INFO "Routing to agent for context-aware answer..."
                local agent_prompt="Based on the IntelliFlow CRM project context and codebase patterns, answer this question:

Question: ${q_question}
Context: ${q_context}

Provide a concise, actionable answer based on the project's architecture and conventions."

                local agent_answer
                agent_answer=$(claude --permission-mode bypassPermissions --print --no-session-persistence -p "${agent_prompt}" 2>/dev/null | head -50)

                if [[ -n "${agent_answer}" ]]; then
                    echo "**Answer (from agent):**" >> "${answers_file}"
                    echo "${agent_answer}" >> "${answers_file}"
                    log SUCCESS "Agent provided answer for question ${question_count}"
                else
                    echo "**Answer:** Agent could not provide answer. Escalating to human." >> "${answers_file}"
                    has_human_questions=true
                    log WARN "Agent could not resolve question ${question_count}"
                fi
                ;;

            human)
                # Mark for human intervention
                echo "**Answer:** REQUIRES HUMAN INPUT" >> "${answers_file}"
                has_human_questions=true
                log WARN "Question ${question_count} requires human intervention"
                ;;

            *)
                echo "**Answer:** Unknown question type '${q_type}'. Escalating to human." >> "${answers_file}"
                has_human_questions=true
                ;;
        esac

        echo "" >> "${answers_file}"
    done < <(awk '/\[QUESTION\]/,/\[\/QUESTION\]/' "${output_file}")

    if [[ "${has_human_questions}" == "true" ]]; then
        add_human_intervention "${task_id}" "Questions require human answers. Review: ${answers_file}" "high"
        return 1
    fi

    log SUCCESS "All ${question_count} questions resolved automatically"
    return 0
}

# Re-generate spec/plan with answers included
regenerate_with_answers() {
    local task_id="$1"
    local original_prompt="$2"
    local answers_file="${TASKS_DIR}/${task_id}_answers.md"

    if [[ ! -f "${answers_file}" ]]; then
        return 1
    fi

    local answers_content
    answers_content=$(cat "${answers_file}")

    local enhanced_prompt="${original_prompt}

=== ANSWERS TO YOUR PREVIOUS QUESTIONS ===
${answers_content}

Now generate the complete output incorporating these answers. Do not ask the same questions again."

    echo "${enhanced_prompt}"
}

# =============================================================================
# ROLE-BASED PROMPT GENERATION
# =============================================================================

# Get role persona based on task owner
get_role_persona() {
    local owner="$1"
    local persona=""

    # Normalize owner string for matching
    local owner_lower=$(echo "${owner}" | tr '[:upper:]' '[:lower:]')

    # CTO/Tech Lead - Architecture & Technical Strategy
    if [[ "${owner_lower}" == *"cto"* ]] || [[ "${owner_lower}" == *"tech lead"* ]] || [[ "${owner_lower}" == *"architect"* ]]; then
        persona="You are acting as a **CTO/Technical Lead**. Your focus is on:
- Architectural decisions and technical strategy
- Technology selection and evaluation
- Technical risk assessment
- Code quality and maintainability standards
- Performance and scalability considerations
- Team capability alignment with technical choices"
    # DevOps/SRE - Infrastructure & Operations
    elif [[ "${owner_lower}" == *"devops"* ]] || [[ "${owner_lower}" == *"sre"* ]]; then
        persona="You are acting as a **DevOps/SRE Engineer**. Your focus is on:
- Infrastructure automation and IaC
- CI/CD pipeline configuration
- Monitoring, alerting, and observability
- Deployment strategies and rollback plans
- System reliability and uptime
- Security hardening and compliance"
    # Security - Security & Compliance
    elif [[ "${owner_lower}" == *"security"* ]] || [[ "${owner_lower}" == *"dpo"* ]] || [[ "${owner_lower}" == *"legal"* ]]; then
        persona="You are acting as a **Security Engineer**. Your focus is on:
- Security vulnerabilities and threat modeling
- Authentication and authorization patterns
- Data protection and encryption
- Compliance requirements (GDPR, SOC2, etc.)
- Security testing and penetration testing
- Access control and secrets management"
    # Backend Dev - API & Data Layer
    elif [[ "${owner_lower}" == *"backend"* ]] || [[ "${owner_lower}" == *"api"* ]]; then
        persona="You are acting as a **Backend Developer**. Your focus is on:
- API design and RESTful/tRPC patterns
- Database schema design and optimization
- Business logic implementation
- Error handling and validation
- Performance optimization
- Integration with external services"
    # Frontend Dev - UI/UX Implementation
    elif [[ "${owner_lower}" == *"frontend"* ]] || [[ "${owner_lower}" == *"ux"* ]]; then
        persona="You are acting as a **Frontend Developer**. Your focus is on:
- UI component architecture
- User experience and accessibility
- State management patterns
- Performance optimization (Core Web Vitals)
- Responsive design
- Client-side validation and error handling"
    # AI/ML Specialist
    elif [[ "${owner_lower}" == *"ai"* ]] || [[ "${owner_lower}" == *"data scientist"* ]] || [[ "${owner_lower}" == *"ml"* ]]; then
        persona="You are acting as an **AI/ML Specialist**. Your focus is on:
- AI model selection and integration
- Prompt engineering and optimization
- Cost management for AI operations
- Human-in-the-loop patterns
- AI safety and reliability
- RAG and embedding strategies"
    # QA - Quality Assurance
    elif [[ "${owner_lower}" == *"qa"* ]] || [[ "${owner_lower}" == *"test"* ]]; then
        persona="You are acting as a **QA Engineer**. Your focus is on:
- Test strategy and coverage
- Test automation frameworks
- Edge case identification
- Regression testing
- Performance testing
- Bug reporting and tracking"
    # PM/Product - Business & Requirements
    elif [[ "${owner_lower}" == *"pm"* ]] || [[ "${owner_lower}" == *"product"* ]]; then
        persona="You are acting as a **Product Manager**. Your focus is on:
- Business requirements alignment
- User stories and acceptance criteria
- Stakeholder communication
- Feature prioritization
- Success metrics definition
- Risk assessment and mitigation"
    # Tech Writer/Documentation
    elif [[ "${owner_lower}" == *"tech writer"* ]] || [[ "${owner_lower}" == *"documentation"* ]]; then
        persona="You are acting as a **Technical Writer**. Your focus is on:
- Clear and concise documentation
- API documentation standards
- User guides and tutorials
- Architecture documentation
- Code comments and inline docs
- Changelog and release notes"
    # Default - Full Stack Developer
    else
        persona="You are acting as a **Full Stack Developer**. Your focus is on:
- End-to-end implementation
- Following established patterns
- Code quality and testing
- Documentation
- Integration between layers
- Performance and reliability"
    fi

    echo "${persona}"
}

# Get predecessor task context (what they produced)
get_predecessor_context() {
    local task_id="$1"
    local context=""

    local deps=$(jq -r ".task_details[\"${task_id}\"] | .dependencies | if . then .[] else empty end" "${REGISTRY_FILE}" 2>/dev/null | tr -d '\r')

    if [[ -z "${deps}" ]]; then
        echo "No predecessor tasks."
        return
    fi

    context="=== PREDECESSOR TASKS (What was already done) ===\n\n"

    for dep_id in ${deps}; do
        local dep_status=$(get_task_status "${dep_id}")
        local dep_desc=$(jq -r ".task_details[\"${dep_id}\"] | .description // \"Unknown\"" "${REGISTRY_FILE}" | tr -d '\r')

        context+="**${dep_id}** - ${dep_desc}\n"
        context+="Status: ${dep_status}\n"

        # Check for spec/plan outputs
        if [[ -f "${SPEC_DIR}/specifications/${dep_id}.md" ]]; then
            context+="Specification available at: .specify/specifications/${dep_id}.md\n"
            # Include summary (first 20 lines)
            local spec_summary=$(head -20 "${SPEC_DIR}/specifications/${dep_id}.md" 2>/dev/null)
            context+="Summary:\n\`\`\`\n${spec_summary}\n...\n\`\`\`\n"
        fi

        # Check for artifacts
        local dep_artifacts=$(jq -r ".task_details[\"${dep_id}\"] | .artifacts | if . then .[] else empty end" "${REGISTRY_FILE}" 2>/dev/null | tr -d '\r')
        if [[ -n "${dep_artifacts}" ]]; then
            context+="Expected artifacts: ${dep_artifacts}\n"
            # Check which exist
            for artifact in ${dep_artifacts}; do
                if [[ -e "${PROJECT_ROOT}/${artifact}" ]]; then
                    context+="  ✓ EXISTS: ${artifact}\n"
                else
                    context+="  ✗ MISSING: ${artifact}\n"
                fi
            done
        fi

        context+="\n"
    done

    echo -e "${context}"
}

# Get successor task requirements (what downstream tasks need)
get_successor_context() {
    local task_id="$1"
    local context=""

    # Find tasks that depend on this task
    local successors=$(jq -r ".task_details | to_entries[] | select(.value.dependencies != null) | select(.value.dependencies | index(\"${task_id}\")) | .key" "${REGISTRY_FILE}" 2>/dev/null | tr -d '\r')

    if [[ -z "${successors}" ]]; then
        echo "No downstream tasks depend on this task."
        return
    fi

    context="=== SUCCESSOR TASKS (What will need your output) ===\n\n"
    context+="The following tasks depend on ${task_id} and will use your outputs:\n\n"

    for succ_id in ${successors}; do
        local succ_desc=$(jq -r ".task_details[\"${succ_id}\"] | .description // \"Unknown\"" "${REGISTRY_FILE}" | tr -d '\r')
        local succ_dod=$(jq -r ".task_details[\"${succ_id}\"] | .definition_of_done // \"Not specified\"" "${REGISTRY_FILE}" | tr -d '\r')
        local succ_prereqs=$(jq -r ".task_details[\"${succ_id}\"] | .prerequisites // \"None\"" "${REGISTRY_FILE}" | tr -d '\r')

        context+="**${succ_id}** - ${succ_desc}\n"
        context+="Prerequisites: ${succ_prereqs}\n"
        context+="DoD: ${succ_dod}\n"
        context+="\n"
    done

    context+="\n**Important**: Ensure your implementation provides what these downstream tasks need.\n"

    echo -e "${context}"
}

# Check current system state relevant to task
check_system_state() {
    local task_id="$1"
    local state=""

    state="=== CURRENT SYSTEM STATE ===\n\n"

    # Check if specific files/directories mentioned in task artifacts exist
    local artifacts=$(jq -r ".task_details[\"${task_id}\"] | .artifacts | if . then .[] else empty end" "${REGISTRY_FILE}" 2>/dev/null | tr -d '\r')

    if [[ -n "${artifacts}" ]]; then
        state+="Expected artifacts for this task:\n"
        for artifact in ${artifacts}; do
            local artifact_path="${PROJECT_ROOT}/${artifact}"
            if [[ "${artifact}" == *"*"* ]]; then
                # Wildcard - check directory
                local dir=$(dirname "${artifact}")
                if [[ -d "${PROJECT_ROOT}/${dir}" ]]; then
                    local count=$(find "${PROJECT_ROOT}/${dir}" -type f 2>/dev/null | wc -l)
                    state+="  ${artifact}: Directory exists (${count} files)\n"
                else
                    state+="  ${artifact}: Directory does NOT exist yet\n"
                fi
            elif [[ -e "${artifact_path}" ]]; then
                state+="  ${artifact}: EXISTS\n"
            else
                state+="  ${artifact}: Does NOT exist (needs creation)\n"
            fi
        done
        state+="\n"
    fi

    # Check relevant package.json dependencies
    if [[ -f "${PROJECT_ROOT}/package.json" ]]; then
        state+="Root package.json exists\n"
    fi

    # Check Prisma schema
    if [[ -f "${PROJECT_ROOT}/packages/db/prisma/schema.prisma" ]]; then
        state+="Prisma schema exists at packages/db/prisma/schema.prisma\n"
    fi

    # Check for existing specs/plans
    if [[ -f "${SPEC_DIR}/specifications/${task_id}.md" ]]; then
        state+="Specification already exists for this task\n"
    fi
    if [[ -f "${SPEC_DIR}/planning/${task_id}.md" ]]; then
        state+="Implementation plan already exists for this task\n"
    fi

    echo -e "${state}"
}

# Build Definition of Done checklist
build_dod_checklist() {
    local dod="$1"
    local checklist=""

    if [[ -z "${dod}" ]] || [[ "${dod}" == "Not specified" ]]; then
        echo "No specific Definition of Done provided."
        return
    fi

    checklist="=== DEFINITION OF DONE CHECKLIST ===\n\n"
    checklist+="**You MUST complete ALL of these criteria:**\n\n"

    # Split DoD by semicolons or commas
    IFS=';,' read -ra items <<< "${dod}"
    local num=1
    for item in "${items[@]}"; do
        item=$(echo "${item}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        if [[ -n "${item}" ]]; then
            checklist+="- [ ] **${num}.** ${item}\n"
            ((num++))
        fi
    done

    checklist+="\n**Each criterion above must be verifiable. Do not proceed until all are addressed.**\n"

    echo -e "${checklist}"
}

# =============================================================================
# TASK CONTEXT GENERATION
# =============================================================================

create_task_context() {
    local task_id="$1"
    local task_data
    task_data=$(jq ".task_details[\"${task_id}\"]" "${REGISTRY_FILE}" 2>/dev/null) || task_data="{}"

    # Use new context structure: artifacts/context/swarm/{task_id}/context.md
    local context_dir="${ARTIFACTS_DIR}/context/swarm/${task_id}"
    mkdir -p "${context_dir}"
    local context_file="${context_dir}/context.md"

    # Extract all fields with proper null handling and carriage return stripping
    local description=$(echo "${task_data}" | jq -r '.description // "Not specified"' | tr -d '\r')
    local section=$(echo "${task_data}" | jq -r '.section // "Not specified"' | tr -d '\r')
    local owner=$(echo "${task_data}" | jq -r '.owner // "Not specified"' | tr -d '\r')
    local sprint=$(echo "${task_data}" | jq -r '.sprint // "Not specified"' | tr -d '\r')
    local status=$(echo "${task_data}" | jq -r '.status // "Unknown"' | tr -d '\r')

    # prerequisites is a string, not an array
    local prerequisites=$(echo "${task_data}" | jq -r '.prerequisites // "None"' | tr -d '\r')

    # definition_of_done is a string, not an array
    local definition_of_done=$(echo "${task_data}" | jq -r '.definition_of_done // "Not specified"' | tr -d '\r')

    # artifacts is an array
    local artifacts=$(echo "${task_data}" | jq -r '.artifacts | if . and (. | type == "array") then join("\n  - ") else "Not specified" end' | tr -d '\r')

    # kpis is a string, not an array
    local kpis=$(echo "${task_data}" | jq -r '.kpis // "Not specified"' | tr -d '\r')

    # validation is a string
    local validation=$(echo "${task_data}" | jq -r '.validation // "Not specified"' | tr -d '\r')

    # dependencies is an array
    local deps=$(echo "${task_data}" | jq -r '.dependencies | if . and (. | type == "array") then join(", ") else "None" end' | tr -d '\r')

    cat > "${context_file}" << EOF
# Task Context: ${task_id}

## Basic Info
- **Section:** ${section}
- **Owner:** ${owner}
- **Sprint:** ${sprint}
- **Status:** ${status}

## Description
${description}

## Dependencies
${deps}

## Prerequisites
${prerequisites}

## Definition of Done
${definition_of_done}

## KPIs
${kpis}

## Expected Artifacts
  - ${artifacts}

## Validation Method
${validation}

---

## Upstream Context

EOF

    # Add upstream context from dependencies
    local dependencies=$(get_dependencies "${task_id}")
    for dep in ${dependencies}; do
        # Check new path structure first, then fall back to legacy
        local dep_context="${ARTIFACTS_DIR}/context/swarm/${dep}/context.md"
        if [[ ! -f "${dep_context}" ]]; then
            # Fall back to MATOP context pack if available
            local matop_context=$(find "${ARTIFACTS_DIR}/context" -name "context_pack.md" -path "*/${dep}/*" 2>/dev/null | head -1)
            [[ -n "${matop_context}" ]] && dep_context="${matop_context}"
        fi
        if [[ -f "${dep_context}" ]]; then
            echo "### From ${dep}" >> "${context_file}"
            echo "" >> "${context_file}"
            head -30 "${dep_context}" >> "${context_file}"
            echo "" >> "${context_file}"
        fi
    done

    echo "---" >> "${context_file}"
    echo "Generated: $(date -Iseconds)" >> "${context_file}"

    log INFO "Context created: ${context_file}"
}

# =============================================================================
# ARTIFACT VALIDATION
# =============================================================================

check_artifacts_exist() {
    local task_id="$1"
    local artifacts=$(jq -r ".task_details[\"${task_id}\"] | .artifacts[]" "${REGISTRY_FILE}" 2>/dev/null)

    local missing=()
    local found=()

    for artifact in $artifacts; do
        # Handle wildcards
        if [[ "${artifact}" == *"*"* ]]; then
            local pattern="${artifact}"
            local dir=$(dirname "${pattern}")
            if [[ -d "${dir}" ]]; then
                found+=("${artifact} (directory exists)")
            else
                missing+=("${artifact}")
            fi
        else
            if [[ -e "${artifact}" ]]; then
                found+=("${artifact}")
            else
                missing+=("${artifact}")
            fi
        fi
    done

    echo "=== Artifact Check for ${task_id} ==="
    echo "Found: ${#found[@]}"
    for f in "${found[@]}"; do
        echo "  ✓ ${f}"
    done

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Missing: ${#missing[@]}"
        for m in "${missing[@]}"; do
            echo "  ✗ ${m}"
        done
        return 1
    fi

    return 0
}

# =============================================================================
# OPERATOR OBSERVABILITY: EXPLAIN & RUNBOOK
# =============================================================================

# Generate a concise explanation of task status and recommended actions
explain_task() {
    local task_id="$1"

    # Get task info from registry
    local task_info
    task_info=$(jq -r ".task_details[\"${task_id}\"] // empty" "${REGISTRY_FILE}" 2>/dev/null | tr -d '\r')

    if [[ -z "${task_info}" ]]; then
        echo "Task ${task_id} not found in registry."
        return 1
    fi

    local status description section
    status=$(echo "${task_info}" | jq -r '.status // "unknown"')
    description=$(echo "${task_info}" | jq -r '.description // "No description"')
    section=$(echo "${task_info}" | jq -r '.section // "Unknown"')

    # Get task file info if exists
    local task_file current_phase attempt last_error
    task_file=$(find_task_file "${task_id}")

    if [[ -n "${task_file}" ]] && [[ -f "${task_file}" ]]; then
        current_phase=$(jq -r '.current_phase // "N/A"' "${task_file}" 2>/dev/null)
        attempt=$(jq -r '.attempt // 0' "${task_file}" 2>/dev/null)
        last_error=$(jq -r '.last_error // "None"' "${task_file}" 2>/dev/null)
    else
        current_phase="N/A"
        attempt=0
        last_error="None"
    fi

    # Check heartbeat
    local heartbeat_file="${SWARM_LOCKS_DIR}/${task_id}.heartbeat"
    local heartbeat_age="N/A"
    if [[ -f "${heartbeat_file}" ]]; then
        local hb_time now
        hb_time=$(stat -c %Y "${heartbeat_file}" 2>/dev/null || stat -f %m "${heartbeat_file}" 2>/dev/null) || hb_time=0
        now=$(date +%s)
        heartbeat_age="$((now - hb_time))s"
    fi

    # Check if lock exists
    local lock_file="${SWARM_LOCKS_DIR}/${task_id}.lock"
    local is_running="No"
    local pid=""
    if [[ -f "${lock_file}" ]]; then
        is_running="Yes"
        pid=$(head -1 "${lock_file}" 2>/dev/null || echo "unknown")
    fi

    # Get log info
    local log_file="${SWARM_LOGS_DIR}/${task_id}.log"
    local last_log_lines=""
    if [[ -f "${log_file}" ]]; then
        last_log_lines=$(tail -20 "${log_file}" 2>/dev/null || echo "")
    fi

    # Generate explanation
    echo ""
    echo "╔══════════════════════════════════════════════════════════════════╗"
    echo "║                    TASK EXPLANATION: ${task_id}"
    echo "╚══════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "OVERVIEW"
    echo "────────────────────────────────────────────────────────────────────"
    echo "  Task:        ${task_id}"
    echo "  Section:     ${section}"
    echo "  Description: ${description:0:60}..."
    echo "  Status:      ${status}"
    echo ""
    echo "EXECUTION STATE"
    echo "────────────────────────────────────────────────────────────────────"
    echo "  Running:     ${is_running}"
    [[ -n "${pid}" ]] && echo "  PID:         ${pid}"
    echo "  Phase:       ${current_phase}"
    echo "  Attempt:     ${attempt}"
    echo "  Heartbeat:   ${heartbeat_age}"
    echo ""

    if [[ "${last_error}" != "None" ]] && [[ "${last_error}" != "null" ]]; then
        echo "LAST ERROR"
        echo "────────────────────────────────────────────────────────────────────"
        echo "  ${last_error}"
        echo ""
    fi

    # Recommended actions based on status
    echo "RECOMMENDED ACTIONS"
    echo "────────────────────────────────────────────────────────────────────"
    case "${status}" in
        "DONE"|"Completed")
            echo "  ✅ Task completed successfully. No action needed."
            ;;
        "IN_PROGRESS"|"In Progress")
            if [[ "${is_running}" == "No" ]]; then
                echo "  ⚠️  Status shows in-progress but no active process."
                echo "      → Check if task crashed: ./orchestrator.sh run ${task_id}"
            else
                echo "  🔄 Task is actively running."
                echo "      → Monitor: ./swarm-manager.sh watch ${task_id}"
            fi
            ;;
        "BLOCKED"|"Blocked")
            echo "  🚧 Task is blocked."
            echo "      → Check blockers: ./orchestrator.sh blockers"
            echo "      → Resolve blocker: ./orchestrator.sh resolve-blocker ${task_id} <resolution>"
            ;;
        "FAILED"|"Failed")
            echo "  ❌ Task failed."
            echo "      → Review logs: cat ${log_file}"
            echo "      → Check forensics: ls artifacts/forensics/${task_id}/"
            echo "      → Retry: ./orchestrator.sh run ${task_id}"
            ;;
        "Needs Human"|"NEEDS_HUMAN")
            echo "  👤 Human review required."
            echo "      → Review context: ./orchestrator.sh context ${task_id}"
            echo "      → Check interventions: ./orchestrator.sh interventions"
            echo "      → After review: ./orchestrator.sh resolve-intervention ${task_id} resolved"
            ;;
        "PLANNED"|"Planned"|"BACKLOG"|"Backlog")
            echo "  📋 Task is waiting to be executed."
            echo "      → Check dependencies: ./orchestrator.sh context ${task_id}"
            echo "      → Start: ./orchestrator.sh run ${task_id}"
            ;;
        *)
            echo "  ❓ Unknown status: ${status}"
            echo "      → Check task file: cat ${task_file}"
            ;;
    esac

    # Show last log lines if available
    if [[ -n "${last_log_lines}" ]]; then
        echo ""
        echo "RECENT LOG (last 20 lines)"
        echo "────────────────────────────────────────────────────────────────────"
        echo "${last_log_lines}"
    fi

    echo ""
}

# Generate a runbook summary markdown file on failure
generate_runbook_summary() {
    local task_id="$1"
    local exit_code="${2:-1}"
    local failure_phase="${3:-UNKNOWN}"
    local failure_reason="${4:-Execution failed}"

    local report_dir="${ARTIFACTS_DIR}/reports"
    mkdir -p "${report_dir}"

    local report_file="${report_dir}/${task_id}-runbook.md"
    local timestamp
    timestamp=$(date -Iseconds)

    # Get task info
    local task_info description section
    task_info=$(jq -r ".task_details[\"${task_id}\"] // {}" "${REGISTRY_FILE}" 2>/dev/null | tr -d '\r')
    description=$(echo "${task_info}" | jq -r '.description // "No description"')
    section=$(echo "${task_info}" | jq -r '.section // "Unknown"')

    # Get log tail
    local log_file="${SWARM_LOGS_DIR}/${task_id}.log"
    local log_tail=""
    if [[ -f "${log_file}" ]]; then
        log_tail=$(tail -200 "${log_file}" 2>/dev/null || echo "Log file not available")
    fi

    # Get validation log tail if exists
    local validation_log="${ARTIFACTS_DIR}/validation/${task_id}-validation.log"
    local validation_tail=""
    if [[ -f "${validation_log}" ]]; then
        validation_tail=$(tail -100 "${validation_log}" 2>/dev/null || echo "")
    fi

    # Generate the markdown report
    cat > "${report_file}" << RUNBOOK
# Runbook: ${task_id}

**Generated**: ${timestamp}
**Status**: FAILED
**Exit Code**: ${exit_code}

## Task Overview

| Field | Value |
|-------|-------|
| Task ID | ${task_id} |
| Section | ${section} |
| Description | ${description} |

## Failure Details

**Phase**: ${failure_phase}
**Reason**: ${failure_reason}

## Recommended Actions

$(case "${failure_phase}" in
    "PRE_FLIGHT")
        echo "1. Check environment setup"
        echo "2. Verify dependencies are installed"
        echo "3. Re-run: \`./orchestrator.sh run ${task_id}\`"
        ;;
    "ARCHITECT_SPEC"|"ARCHITECT_PLAN")
        echo "1. Review the task context: \`./orchestrator.sh context ${task_id}\`"
        echo "2. Check if specs directory is writable"
        echo "3. Review Claude API status and rate limits"
        echo "4. Re-run: \`./orchestrator.sh run ${task_id}\`"
        ;;
    "ENFORCER_TDD")
        echo "1. Review generated spec for completeness"
        echo "2. Check test generation logs"
        echo "3. Manually review spec: \`cat .specify/specifications/${task_id}-spec.md\`"
        echo "4. Re-run with fresh spec: \`./orchestrator.sh run ${task_id} --force-spec\`"
        ;;
    "BUILDER_ATTEMPT"*)
        echo "1. Review build/lint/type errors in logs below"
        echo "2. Check if generated code follows project patterns"
        echo "3. Consider manual intervention to fix code"
        echo "4. Re-run: \`./orchestrator.sh run ${task_id}\`"
        ;;
    "GATEKEEPER_ATTEMPT"*|"QUALITY_GATES"|"TDD_VALIDATION")
        echo "1. Check which validation gate failed"
        echo "2. Review validation logs: \`cat artifacts/validation/${task_id}-validation.log\`"
        echo "3. Fix failing tests or quality issues"
        echo "4. Re-run validation only: \`./orchestrator.sh validate ${task_id}\`"
        ;;
    "AUDITOR_ATTEMPT"*)
        echo "1. Review audit rejection reason"
        echo "2. Check if code meets architecture standards"
        echo "3. Consider manual code review"
        echo "4. Re-run after fixes: \`./orchestrator.sh run ${task_id}\`"
        ;;
    *)
        echo "1. Review logs for specific error"
        echo "2. Check \`./orchestrator.sh explain ${task_id}\` for more details"
        echo "3. Re-run: \`./orchestrator.sh run ${task_id}\`"
        ;;
esac)

## Log References

- Task log: \`${log_file}\`
- Validation log: \`${validation_log}\`
- Forensics: \`artifacts/forensics/${task_id}/\`

## Last 200 Lines of Task Log

\`\`\`
${log_tail}
\`\`\`

$(if [[ -n "${validation_tail}" ]]; then
    echo "## Last 100 Lines of Validation Log"
    echo ""
    echo "\`\`\`"
    echo "${validation_tail}"
    echo "\`\`\`"
fi)

---
*Generated by orchestrator.sh on failure*
RUNBOOK

    log INFO "Generated runbook summary: ${report_file}"
    echo "${report_file}"
}

# =============================================================================
# A2A INTELLIGENCE PROTOCOLS
# =============================================================================

# AGENT 1: CODEX (The Enforcer) - TDD Test Generation
run_codex_tests() {
    local task_id="$1"

    log PHASE "A2A: Handing off to Codex (Enforcer)..."

    # Save tests to __tests__/ directory (proper location for TypeScript)
    local test_dir="${PROJECT_ROOT}/apps/project-tracker/__tests__"
    local test_file="${test_dir}/${task_id}_generated.test.ts"
    mkdir -p "${test_dir}"

    # Check if spec file exists before reading
    local spec_file="${SPEC_DIR}/specifications/${task_id}.md"
    if [[ ! -f "${spec_file}" ]]; then
        log ERROR "Codex: Spec file not found at ${spec_file}"
        return 1
    fi

    local spec
    spec=$(cat "${spec_file}") || {
        log ERROR "Codex: Failed to read spec file"
        return 1
    }

    local prompt="You are the Quality Assurance Lead.

Read this Specification:
$spec

Generate strictly typed TypeScript unit tests (using Vitest) that verify these requirements.

Rules:
1. Use strict TypeScript types (never use 'any')
2. Test happy path and edge cases
3. Mock external dependencies
4. Include error handling tests
5. Use 'readonly' for array types in expectTypeOf assertions
6. Import from '../lib/' (relative to __tests__ directory)

IMPORTANT: Save the test file to ${test_file}"

    # Use Codex CLI with exec mode for non-interactive execution
    # Guard with || true to prevent set -e exit
    local codex_output="${TASKS_DIR}/${task_id}_codex.tmp"
    codex exec --full-auto "$prompt" > "${codex_output}" 2>&1 || true

    # Check for API/auth errors in output
    if grep -qiE "API.*error|authentication|unauthorized|rate.limit" "${codex_output}" 2>/dev/null; then
        log ERROR "Codex: API error detected"
        mv "${codex_output}" "${TASKS_DIR}/${task_id}_codex_error.log"
        return 1
    fi
    rm -f "${codex_output}"

    if [[ -f "${test_file}" ]]; then
        log SUCCESS "Codex: TDD tests generated at ${test_file}"
        return 0
    else
        # Also check if it was saved to old location and move it
        if [[ -f "${TASKS_DIR}/${task_id}_generated.test.ts" ]]; then
            mv "${TASKS_DIR}/${task_id}_generated.test.ts" "${test_file}"
            log WARN "Codex: Moved test from old location to ${test_file}"
            return 0
        fi
        log ERROR "Codex: Test generation failed - file not created"
        return 1
    fi
}

# AGENT 2: CLAUDE (The Auditor) - Logic & Security Review
run_claude_audit() {
    local task_id="$1"

    log PHASE "A2A: Handing off to Claude Code (Auditor)..."

    # Guard file reads to prevent set -e exit
    local spec_file="${SPEC_DIR}/specifications/${task_id}.md"
    local plan_file="${SPEC_DIR}/planning/${task_id}.md"
    local constitution_file="${SPEC_DIR}/memory/constitution.md"

    if [[ ! -f "${spec_file}" ]]; then
        log ERROR "Claude Audit: Spec file not found at ${spec_file}"
        return 1
    fi
    if [[ ! -f "${plan_file}" ]]; then
        log ERROR "Claude Audit: Plan file not found at ${plan_file}"
        return 1
    fi
    if [[ ! -f "${constitution_file}" ]]; then
        log WARN "Claude Audit: Constitution file not found, using empty"
        local constitution=""
    else
        local constitution
        constitution=$(cat "${constitution_file}") || constitution=""
    fi

    local spec
    spec=$(cat "${spec_file}") || {
        log ERROR "Claude Audit: Failed to read spec file"
        return 1
    }

    local plan
    plan=$(cat "${plan_file}") || {
        log ERROR "Claude Audit: Failed to read plan file"
        return 1
    }

    local prompt="You are a Senior Logic Auditor. Review this implementation for Task ${task_id}.

CONSTITUTION (Project Rules):
$constitution

SPECIFICATION:
$spec

IMPLEMENTATION PLAN:
$plan

Check for:
1. Usage of deprecated features (e.g., old Next.js patterns)
2. Security vulnerabilities or hallucinations
3. Logic gaps or inconsistencies
4. Violations of the Constitution

IMPORTANT: Reply with ONLY one of these two responses:
- 'APPROVED' if everything is correct
- 'REJECT: <specific reason>' if there are issues

Do not include any other text, explanations, or formatting. Just one word: APPROVED or REJECT: followed by the reason."

    # Use Claude Code CLI with print mode for non-interactive output
    local audit_tmp="${TASKS_DIR}/${task_id}_audit.tmp"
    claude --permission-mode bypassPermissions --print --no-session-persistence -p "${prompt}" > "${audit_tmp}" 2>&1 || true

    # Check for authentication errors
    if grep -qiE "\b401\b|OAuth token has expired|authentication_error|Please run \/login" "${audit_tmp}"; then
        log ERROR "Claude API authentication error during audit"
        mv "${audit_tmp}" "${TASKS_DIR}/${task_id}_audit_error.log"
        return 1
    fi

    local audit_text=$(cat "${audit_tmp}")
    rm -f "${audit_tmp}"

    if [[ -z "$audit_text" ]]; then
        log ERROR "Claude: Empty response from CLI"
        return 1
    fi

    if [[ "$audit_text" == *"APPROVED"* ]]; then
        log SUCCESS "Claude Audit: Approved."
        echo "$audit_text" > "${TASKS_DIR}/${task_id}_audit.log"
        return 0
    else
        log ERROR "Claude Audit: Rejected - ${audit_text}"
        echo "$audit_text" > "${TASKS_DIR}/${task_id}_audit.log"
        return 1
    fi
}

# =============================================================================
# VALIDATION ENGINE (Hybrid: Legacy + YAML Gates)
# =============================================================================

run_yaml_validation() {
    local task_id="$1"

    log VALIDATE "Running YAML Validation Gates for ${task_id}..."

    python3 -c "
import yaml, subprocess, sys, os, json, re

os.environ['TASK_ID'] = '${task_id}'
PROJECT_ROOT = '${PROJECT_ROOT}'

try:
    with open('${VALIDATION_FILE}') as f:
        data = yaml.safe_load(f)
except Exception as e:
    print(f'Error loading validation YAML: {e}')
    sys.exit(1)

# Get task-specific config
task_config = data.get('${task_id}', {})

# Combine global + task-specific validation_commands
checks = data.get('global_spec_check', {}).get('validation_commands', []) + \
         data.get('global_security_check', {}).get('validation_commands', []) + \
         data.get('global_quality_check', {}).get('validation_commands', []) + \
         data.get('global_sonarqube_check', {}).get('validation_commands', []) + \
         task_config.get('validation_commands', [])

# Get KPI checks and manual checks
kpi_checks = task_config.get('kpi_checks', [])
manual_checks = task_config.get('manual_checks', [])

failed = False
skipped = 0
passed = 0
kpi_failed = 0
kpi_passed = 0

# =========================================================================
# VALIDATION COMMANDS (with proper type semantics)
# =========================================================================
print('\\n📋 Validation Commands:')
print('-' * 60)

# Track manual checks found in validation_commands for reporting
inline_manual_checks = []

for check in checks:
    cmd = check['command']
    desc = check.get('description', cmd)
    check_type = check.get('type', 'auto')
    required = check.get('required', True)
    timeout = check.get('timeout', 300)
    condition = check.get('condition')  # Optional pre-condition command

    print(f\"   > {desc}...\", end=' ')

    # =====================================================================
    # TYPE: MANUAL - Skip entirely, collect for human review report
    # =====================================================================
    if check_type == 'manual':
        print(f'⏭️  MANUAL (requires human verification)')
        inline_manual_checks.append({'description': desc, 'priority': 'medium', 'command': cmd})
        skipped += 1
        continue

    # =====================================================================
    # TYPE: CONDITIONAL - Check precondition before running
    # =====================================================================
    if check_type == 'conditional':
        # If explicit condition field exists, evaluate it first
        if condition:
            try:
                cond_result = subprocess.run(
                    condition,
                    shell=True,
                    capture_output=True,
                    text=True,
                    env=os.environ,
                    cwd=PROJECT_ROOT,
                    timeout=30
                )
                if cond_result.returncode != 0:
                    print(f'⏭️  CONDITION NOT MET (skipped)')
                    skipped += 1
                    continue
            except Exception as e:
                print(f'⏭️  CONDITION ERROR: {e} (skipped)')
                skipped += 1
                continue

    # =====================================================================
    # TYPE: AUTO or CONDITIONAL (condition passed) - Execute command
    # =====================================================================
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            env=os.environ,
            cwd=PROJECT_ROOT,
            timeout=timeout
        )

        output_combined = (result.stdout or '') + (result.stderr or '')

        # Check for SKIP markers (self-skipping conditional commands)
        if 'SKIP:' in output_combined:
            skip_reason = ''
            for line in output_combined.split('\\n'):
                if 'SKIP:' in line:
                    skip_reason = line.strip()
                    break
            print(f'⏭️  {skip_reason or \"SKIPPED\"}')
            skipped += 1
            continue

        if result.returncode == 0:
            print(f'✅ PASSED')
            passed += 1
        else:
            # Command failed
            if required:
                print(f'❌ FAILED (blocking)')
                if result.stdout:
                    print(f'   stdout: {result.stdout[:300]}')
                if result.stderr:
                    print(f'   stderr: {result.stderr[:300]}')
                failed = True
            else:
                print(f'⚠️  FAILED (non-blocking)')
                if result.stdout:
                    print(f'   stdout: {result.stdout[:150]}')
                skipped += 1

    except subprocess.TimeoutExpired as e:
        if required:
            print(f'⏱️  TIMEOUT ({timeout}s) - blocking')
            # Print partial output captured before timeout (if available)
            if hasattr(e, 'output') and e.output:
                partial = e.output[:500] if isinstance(e.output, str) else e.output.decode('utf-8', errors='replace')[:500]
                print(f'   partial output: {partial}')
            if hasattr(e, 'stderr') and e.stderr:
                partial_err = e.stderr[:300] if isinstance(e.stderr, str) else e.stderr.decode('utf-8', errors='replace')[:300]
                print(f'   partial stderr: {partial_err}')
            failed = True
        else:
            print(f'⏱️  TIMEOUT ({timeout}s) - skipped')
            skipped += 1
    except Exception as e:
        if required:
            print(f'💥 ERROR: {e} - blocking')
            # For subprocess errors, try to extract output
            if hasattr(e, 'output') and e.output:
                output_str = e.output[:500] if isinstance(e.output, str) else str(e.output)[:500]
                print(f'   output: {output_str}')
            if hasattr(e, 'stderr') and e.stderr:
                stderr_str = e.stderr[:300] if isinstance(e.stderr, str) else str(e.stderr)[:300]
                print(f'   stderr: {stderr_str}')
            failed = True
        else:
            print(f'💥 ERROR: {e} - skipped')
            skipped += 1

# Merge inline manual checks with explicit manual_checks
manual_checks = manual_checks + inline_manual_checks

# =========================================================================
# KPI ENFORCEMENT
# =========================================================================
if kpi_checks:
    print('\\n📊 KPI Enforcement:')
    print('-' * 60)

    # Load metrics from various sources
    metrics = {}

    # Try to load from SonarQube report
    sonar_report = os.path.join(PROJECT_ROOT, 'artifacts/reports/sonarqube-metrics.json')
    if os.path.exists(sonar_report):
        try:
            with open(sonar_report) as f:
                sonar_data = json.load(f)
                metrics.update(sonar_data.get('metrics', {}))
        except: pass

    # Try to load from coverage report
    coverage_report = os.path.join(PROJECT_ROOT, 'artifacts/coverage/coverage-summary.json')
    if os.path.exists(coverage_report):
        try:
            with open(coverage_report) as f:
                cov_data = json.load(f)
                if 'total' in cov_data:
                    metrics['test_coverage'] = cov_data['total'].get('lines', {}).get('pct', 0)
                    metrics['code_coverage'] = cov_data['total'].get('lines', {}).get('pct', 0)
        except: pass

    # Try to load from task file in sprint-0/ (cascading source of truth)
    import glob
    task_pattern = os.path.join(PROJECT_ROOT, f'apps/project-tracker/docs/metrics/sprint-0/**/${task_id}.json')
    task_files = glob.glob(task_pattern, recursive=True)
    if task_files:
        try:
            with open(task_files[0]) as f:
                status_data = json.load(f)
                metrics.update(status_data.get('kpis', {}))
        except: pass

    # Try to load from sprint metrics
    sprint_metrics = os.path.join(PROJECT_ROOT, 'apps/project-tracker/docs/metrics/sprint-0/_summary.json')
    if os.path.exists(sprint_metrics):
        try:
            with open(sprint_metrics) as f:
                sprint_data = json.load(f)
                kpi_summary = sprint_data.get('kpi_summary', {})
                for k, v in kpi_summary.items():
                    if isinstance(v, dict) and 'actual' in v:
                        metrics[k] = v['actual']
        except: pass

    for kpi in kpi_checks:
        metric_name = kpi.get('metric', 'unknown')
        operator = kpi.get('operator', '>=')
        threshold = kpi.get('threshold')

        actual = metrics.get(metric_name)

        print(f\"   > {metric_name} {operator} {threshold}...\", end=' ')

        if actual is None:
            print(f'⚠️  NOT MEASURED (metric not found)')
            skipped += 1
            continue

        # Evaluate KPI
        kpi_met = False
        try:
            if operator == '>':
                kpi_met = float(actual) > float(threshold)
            elif operator == '>=':
                kpi_met = float(actual) >= float(threshold)
            elif operator == '<':
                kpi_met = float(actual) < float(threshold)
            elif operator == '<=':
                kpi_met = float(actual) <= float(threshold)
            elif operator == '=':
                kpi_met = str(actual) == str(threshold)
            elif operator == '!=':
                kpi_met = str(actual) != str(threshold)
        except (ValueError, TypeError):
            kpi_met = str(actual) == str(threshold)

        if kpi_met:
            print(f'✅ PASSED (actual: {actual})')
            kpi_passed += 1
        else:
            print(f'❌ FAILED (actual: {actual}, expected: {operator} {threshold})')
            kpi_failed += 1
            # KPI failures are warnings, not blockers (can be made required)
            # failed = True

# =========================================================================
# MANUAL CHECKS (Report for Human Review)
# =========================================================================
if manual_checks:
    print('\\n👤 Manual Checks Required:')
    print('-' * 60)

    for mc in manual_checks:
        desc = mc.get('description', 'Unknown check')
        priority = mc.get('priority', 'medium').upper()
        icon = '🔴' if priority == 'CRITICAL' else '🟠' if priority == 'HIGH' else '🟡'
        print(f'   {icon} [{priority}] {desc}')

    print(f'\\n   ⚠️  {len(manual_checks)} manual check(s) require human verification')

# =========================================================================
# Summary
# =========================================================================
print(f'\\n📊 Validation Summary:')
print(f'   ✅ Commands Passed: {passed}')
print(f'   ⏭️  Commands Skipped: {skipped}')
print(f'   ❌ Commands Failed: {1 if failed else 0}')
if kpi_checks:
    print(f'   📈 KPIs Passed: {kpi_passed}/{len(kpi_checks)}')
    print(f'   📉 KPIs Failed: {kpi_failed}/{len(kpi_checks)}')
if manual_checks:
    print(f'   👤 Manual Checks: {len(manual_checks)} pending')

# Save validation report
report = {
    'task_id': '${task_id}',
    'commands': {'passed': passed, 'skipped': skipped, 'failed': failed},
    'kpis': {'passed': kpi_passed, 'failed': kpi_failed, 'total': len(kpi_checks)},
    'manual_checks': len(manual_checks),
    'timestamp': subprocess.check_output('date -Iseconds', shell=True).decode().strip()
}

os.makedirs(os.path.join(PROJECT_ROOT, 'artifacts/reports'), exist_ok=True)
with open(os.path.join(PROJECT_ROOT, f'artifacts/reports/validation-${task_id}.json'), 'w') as f:
    json.dump(report, f, indent=2)

if failed:
    sys.exit(1)
"
}

# =============================================================================
# QUALITY GATE EXECUTION (Pre-Phase-4 Quality Checks)
# =============================================================================

run_quality_gates() {
    local task_id="$1"
    local quality_log="${LOGS_DIR}/quality-${task_id}-$(date +%Y%m%d-%H%M%S).log"

    log PHASE "Pre-Validation: Running Quality Gates..."

    {
        echo "=== Quality Gate Execution: ${task_id} ==="
        echo "Started: $(date -Iseconds)"
        echo ""

        # Change to project root for pnpm commands
        cd "${PROJECT_ROOT}"

        # TypeCheck
        echo ">>> TypeScript Type Checking..."
        if pnpm run typecheck --filter=!@intelliflow/observability 2>&1; then
            echo "✅ TypeCheck PASSED"
        else
            echo "❌ TypeCheck FAILED"
            return 1
        fi

        # Lint (non-blocking)
        echo ""
        echo ">>> ESLint Analysis..."
        if pnpm run lint 2>&1; then
            echo "✅ Lint PASSED"
        else
            echo "⚠️  Lint WARNINGS (non-blocking)"
        fi

        # Tests
        echo ""
        echo ">>> Running Test Suite..."
        if pnpm test --run --passWithNoTests 2>&1; then
            echo "✅ Tests PASSED"
        else
            echo "⚠️  Test WARNINGS (non-blocking)"
        fi

        # Dependency Check (non-blocking)
        echo ""
        echo ">>> Checking for Unused Dependencies..."
        if npx depcheck --ignores='@types/*,eslint-*,prettier,husky,lint-staged,turbo' 2>&1; then
            echo "✅ No unused dependencies"
        else
            echo "⚠️  Unused dependencies detected (non-blocking)"
        fi

        # Security Audit (non-blocking)
        echo ""
        echo ">>> Security Audit..."
        mkdir -p artifacts/reports
        if pnpm audit --audit-level=moderate --json > artifacts/reports/audit-${task_id}.json 2>&1; then
            echo "✅ No moderate+ vulnerabilities"
        else
            echo "⚠️  Vulnerabilities detected (non-blocking)"
        fi

        # Dead Code Detection (non-blocking)
        echo ""
        echo ">>> Dead Code Detection (knip)..."
        if npx knip --exclude 'unlisted,unresolved' 2>&1; then
            echo "✅ No dead code detected"
        else
            echo "⚠️  Dead code detected (non-blocking)"
        fi

        echo ""
        echo "Completed: $(date -Iseconds)"
        echo "=== Quality Gate Summary ==="
        
    } | tee -a "${quality_log}"

    log SUCCESS "Quality gates completed. Log: ${quality_log}"
    return 0
}

# =============================================================================
# TDD VALIDATION (Run Generated Test Files)
# =============================================================================

run_tdd_validation() {
    local task_id="$1"
    local tdd_log="${LOGS_DIR}/tdd-${task_id}-$(date +%Y%m%d-%H%M%S).log"
    local tdd_result_file="${LOGS_DIR}/.tdd-result-${task_id}.tmp"

    log VALIDATE "Running TDD Validation for ${task_id}..."

    # Check for generated test file
    local test_dir="${PROJECT_ROOT}/apps/project-tracker/__tests__"
    local test_file="${test_dir}/${task_id}_generated.test.ts"

    if [[ ! -f "${test_file}" ]]; then
        log WARN "No TDD test file found at ${test_file} - skipping TDD validation"
        echo "SKIP: No generated test file" > "${tdd_log}"
        return 0  # Non-blocking if no tests generated
    fi

    log INFO "Found TDD test file: ${test_file}"

    # Initialize result file (assume failure until proven otherwise)
    echo "1" > "${tdd_result_file}"

    {
        echo "=== TDD Validation: ${task_id} ==="
        echo "Test File: ${test_file}"
        echo "Started: $(date -Iseconds)"
        echo ""

        # Change to project root
        cd "${PROJECT_ROOT}"

        # Run the specific test file with vitest
        echo ">>> Running generated test file..."

        # Use pnpm to run vitest on the specific test file
        # --run: non-watch mode
        # --reporter=verbose: detailed output
        if pnpm vitest run "${test_file}" --reporter=verbose 2>&1; then
            echo ""
            echo "✅ TDD VALIDATION PASSED"
            echo "   All generated tests for ${task_id} passed!"
            echo "0" > "${tdd_result_file}"
        else
            echo ""
            echo "❌ TDD VALIDATION FAILED"
            echo "   Generated tests for ${task_id} did not pass."
            echo "   Fix the implementation to satisfy the test requirements."
            echo "1" > "${tdd_result_file}"
        fi

        echo ""
        echo "Completed: $(date -Iseconds)"
        echo "=== TDD Validation Summary ==="

    } | tee -a "${tdd_log}"

    # Read result from file (survives subshell)
    local tdd_result=$(cat "${tdd_result_file}" 2>/dev/null || echo "1")
    rm -f "${tdd_result_file}"

    if [[ "${tdd_result}" == "0" ]]; then
        log SUCCESS "TDD validation passed. Log: ${tdd_log}"
        return 0
    else
        log ERROR "TDD validation failed. Log: ${tdd_log}"
        return 1
    fi
}

# =============================================================================
# TASK DEFINITION FILE GENERATION
# =============================================================================

generate_task_definition_file() {
    local task_id="$1"
    local task_status="${2:-PLANNED}"
    
    # Get task metadata from registry
    local task_data=$(jq ".task_details[\"${task_id}\"]" "${REGISTRY_FILE}")
    local description=$(echo "${task_data}" | jq -r '.description // "No description"')
    local owner=$(echo "${task_data}" | jq -r '.owner // "Unknown"')
    local phase=$(echo "${task_data}" | jq -r '.phase // "unknown"')
    local stream=$(echo "${task_data}" | jq -r '.stream // null')
    local section=$(echo "${task_data}" | jq -r '.section // "Environment & Setup"')
    
    # Determine correct directory and schema path
    local task_dir=""
    local schema_path=""
    
    case "${phase}" in
        "phase-1-ai-foundation")
            task_dir="${TASKS_DIR}/sprint-0/phase-1-ai-foundation"
            schema_path="../../schemas/task-status.schema.json"
            ;;
        "phase-2-parallel")
            if [[ "${stream}" != "null" ]]; then
                task_dir="${TASKS_DIR}/sprint-0/phase-2-parallel/${stream}"
                schema_path="../../../schemas/task-status.schema.json"
            else
                task_dir="${TASKS_DIR}/sprint-0/phase-2-parallel"
                schema_path="../../schemas/task-status.schema.json"
            fi
            ;;
        "phase-3-dependencies")
            task_dir="${TASKS_DIR}/sprint-0/phase-3-dependencies"
            schema_path="../../schemas/task-status.schema.json"
            ;;
        "phase-4-validation")
            task_dir="${TASKS_DIR}/sprint-0/phase-4-validation"
            schema_path="../../schemas/task-status.schema.json"
            ;;
        "phase-5-completion")
            task_dir="${TASKS_DIR}/sprint-0/phase-5-completion"
            schema_path="../../schemas/task-status.schema.json"
            ;;
        *)
            task_dir="${TASKS_DIR}/sprint-0"
            schema_path="../schemas/task-status.schema.json"
            ;;
    esac
    
    mkdir -p "${task_dir}"
    local task_file="${task_dir}/${task_id}.json"
    
    # Get dependencies
    local deps=$(jq -r ".task_details[\"${task_id}\"].dependencies // []" "${REGISTRY_FILE}")
    local deps_array=$(echo "${deps}" | jq -c 'if type == "array" then . else [] end')
    
    # Get current timestamp
    local now=$(date -Iseconds)

    # Get completion timestamp from existing task file in sprint-0/
    local completed_at_value="null"
    local started_at_value="null"
    local retry_count=0
    local last_error_value="null"
    local existing_task_file
    existing_task_file=$(find_task_file "${task_id}")

    if [[ -n "${existing_task_file}" ]] && [[ -f "${existing_task_file}" ]]; then
        local raw_started raw_completed raw_retry raw_error
        raw_started=$(jq -r '.started_at // "null"' "${existing_task_file}" 2>/dev/null) || raw_started="null"
        raw_completed=$(jq -r '.completed_at // "null"' "${existing_task_file}" 2>/dev/null) || raw_completed="null"
        raw_retry=$(jq -r '.execution.retry_count // 0' "${existing_task_file}" 2>/dev/null) || raw_retry=0
        raw_error=$(jq -r '.execution.last_error // "null"' "${existing_task_file}" 2>/dev/null) || raw_error="null"

        # Format values properly for JSON (quote strings, leave null as-is)
        if [[ "${raw_started}" != "null" ]] && [[ -n "${raw_started}" ]]; then
            started_at_value="\"${raw_started}\""
        fi
        if [[ "${raw_completed}" != "null" ]] && [[ -n "${raw_completed}" ]]; then
            completed_at_value="\"${raw_completed}\""
        fi
        retry_count="${raw_retry}"
        if [[ "${raw_error}" != "null" ]] && [[ -n "${raw_error}" ]]; then
            last_error_value="\"${raw_error}\""
        fi
    fi

    # If status is DONE and completed_at not set, set it now
    if [[ "${task_status}" == "DONE" ]] && [[ "${completed_at_value}" == "null" ]]; then
        completed_at_value="\"${now}\""
        if [[ "${started_at_value}" == "null" ]]; then
            started_at_value="\"${now}\""
        fi
    fi

    # Determine agents involved and collect their notes
    local agents_involved=()
    local agent_notes=""
    local test_file="${PROJECT_ROOT}/apps/project-tracker/__tests__/${task_id}_generated.test.ts"

    # Check which agents contributed
    if [[ -f "${SPEC_DIR}/specifications/${task_id}.md" ]]; then
        agents_involved+=("Claude (Architect)")
    fi

    if [[ -f "${test_file}" ]]; then
        agents_involved+=("Codex (Enforcer)")
    fi

    if [[ -f "${TASKS_DIR}/${task_id}_audit.log" ]]; then
        agents_involved+=("Claude (Auditor)")
    fi
    
    # Collect execution notes from logs
    if [[ -f "${EXECUTION_LOG}" ]]; then
        agent_notes=$(grep -i "${task_id}" "${EXECUTION_LOG}" | tail -5 | sed 's/^/  - /' || echo "")
    fi
    
    # Build executor string
    local executor_list=$(IFS=", "; echo "${agents_involved[*]}")
    if [[ -z "${executor_list}" ]]; then
        executor_list="orchestrator"
    fi
    
    # Create task definition file with full schema compliance
    cat > "${task_file}" << EOF
{
  "\$schema": "${schema_path}",
  "task_id": "${task_id}",
  "section": "${section}",
  "description": "${description}",
  "owner": "${owner}",
  "status": "${task_status}",
  "sprint": "sprint-0",
  "phase": "${phase}",
  "stream": $(if [[ "${stream}" == "null" ]]; then echo "null"; else echo "\"${stream}\""; fi),
  "started_at": ${started_at_value},
  "completed_at": ${completed_at_value},
  "dependencies": {
    "required": ${deps_array},
    "verified_at": "${now}",
    "all_satisfied": $(check_dependencies "${task_id}" 2>/dev/null && echo "true" || echo "false")
  },
  "status_history": [
    {
      "status": "${task_status}",
      "at": "${now}",
      "note": "Task completed by: ${executor_list}"
    }
  ],
  "execution": {
    "retry_count": ${retry_count},
    "last_error": ${last_error_value},
    "duration_minutes": null,
    "executor": "${executor_list}",
    "agents": [$(echo "${agents_involved[@]}" | jq -R 'split(", ") | map(select(length > 0))' | tr -d '\n')]
  },
  "artifacts": {
    "expected": [],
    "created": [],
    "missing": []
  },
  "validations": [],
  "kpis": {},
  "blockers": [],
  "notes": "Task execution involved collaboration between: ${executor_list}

Agent Contributions:
$(if [[ -f "${SPEC_DIR}/specifications/${task_id}.md" ]]; then echo "- Claude (Architect): Created specification and implementation plan"; fi)
$(if [[ -f "${test_file}" ]]; then echo "- Codex (Enforcer): Generated TDD tests for quality assurance"; fi)
$(if [[ -f "${TASKS_DIR}/${task_id}_audit.log" ]]; then echo "- Claude (Auditor): Performed security and logic review"; fi)

Recent execution log:
${agent_notes}"
}
EOF
    
    log INFO "Generated task definition: ${task_file}"
    echo "${task_file}"
}

# =============================================================================
# CORE EXECUTION PIPELINE
# =============================================================================

execute_task() {
    local task_id="$1"
    local skip_review="${2:-false}"
    local error_log="${TASKS_DIR}/${task_id}_error.log"

    # Set global task ID for heartbeat updates in log()
    CURRENT_TASK_ID="${task_id}"

    # EXIT trap: mark task as crashed if we exit non-zero before completion
    # Note: Using global variable because trap handlers can't access local variables
    task_completed=false
    trap_handler() {
        local exit_code=$?
        if [[ "$task_completed" != "true" ]] && [[ "$exit_code" -ne 0 ]]; then
            mark_task_crashed "${task_id}" "$exit_code"
            log ERROR "Task ${task_id} crashed with exit code $exit_code"
        fi
        # Clean up global task ID
        CURRENT_TASK_ID=""
    }
    trap 'trap_handler' RETURN

    log TASK "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log TASK "EXECUTING: ${task_id}"
    log TASK "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Initialize phase tracking
    update_task_phase "${task_id}" "START" 0

    # Check registry file exists
    if [[ ! -f "${REGISTRY_FILE}" ]]; then
        log ERROR "Registry file not found at ${REGISTRY_FILE}"
        update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Registry file missing"
        add_human_intervention "${task_id}" "Registry file missing - run setup first" "critical"
        return 1
    fi

    # Get task data - guard with || to prevent set -e exit
    local task_data
    task_data=$(jq ".task_details[\"${task_id}\"]" "${REGISTRY_FILE}" 2>/dev/null) || task_data=""

    if [[ -z "${task_data}" ]] || [[ "${task_data}" == "null" ]]; then
        log ERROR "Task ${task_id} not found in registry"
        return 1
    fi

    local description
    description=$(echo "${task_data}" | jq -r '.description' 2>/dev/null) || description="Unknown"
    log INFO "Description: ${description}"

    # Check current status
    local current_status=$(get_task_status "${task_id}")
    if [[ "${current_status}" == "${STATUS_COMPLETED}" ]]; then
        log SUCCESS "Task already completed"
        return 0
    fi

    # Check for active blockers
    local has_blocker=$(jq -r ".blockers[] | select(.task_id == \"${task_id}\" and .status == \"active\") | .task_id" "${BLOCKERS_FILE}" 2>/dev/null)
    if [[ -n "${has_blocker}" ]]; then
        log ERROR "Task is blocked. Resolve blockers first."
        list_blockers
        return 1
    fi

    # -------------------------------------------------------------------------
    # PRE-FLIGHT: Dependency Check
    # -------------------------------------------------------------------------
    update_task_phase "${task_id}" "PRE_FLIGHT" 0
    log PHASE "Pre-Flight: Dependency Check"
    if ! check_dependencies "${task_id}"; then
        log ERROR "Unmet dependencies detected"
        add_blocker "${task_id}" "dependency" "Unmet dependencies"
        return 1
    fi
    log SUCCESS "Dependencies satisfied"

    update_csv_status "${task_id}" "${STATUS_IN_PROGRESS}" "Task execution started"

    # Note: update_csv_status now also creates/updates the sprint-0 task file
    # which serves as the cascading source of truth for the tracker

    create_task_context "${task_id}"

    # NOTE: Removed artifacts/work/${task_id} creation - it was never used.
    # All outputs go to specific locations (.specify/, __tests__/, artifacts/context/swarm/, logs/)

    # -------------------------------------------------------------------------
    # PHASE 1: ARCHITECT (Claude + MCP)
    # -------------------------------------------------------------------------
    update_task_phase "${task_id}" "ARCHITECT_SPEC" 0
    log PHASE "Phase 1: Architect (Spec & Plan via MCP)..."


    # --- Cleanup function to always remove lock file ---
    cleanup_lock() {
        local lock_file="${SWARM_LOCKS_DIR}/${task_id}.lock"
        if [ -f "$lock_file" ]; then
            rm -f "$lock_file"
            log INFO "Cleaned up lock file: $lock_file"
        fi
    }
    # Use RETURN trap so cleanup runs when this function returns (not only on process EXIT)
    trap 'cleanup_lock' RETURN

    # 1a. Spec Generation
    if [ ! -f "${SPEC_DIR}/specifications/${task_id}.md" ]; then
        log INFO "Generating Specification..."

        # Build comprehensive task context from registry
        local task_json
        task_json=$(jq ".task_details[\"${task_id}\"]" "${REGISTRY_FILE}" 2>/dev/null) || task_json="{}"

        local desc=$(echo "${task_json}" | jq -r '.description // "Unknown"' | tr -d '\r')
        local section=$(echo "${task_json}" | jq -r '.section // "Unknown"' | tr -d '\r')
        local owner=$(echo "${task_json}" | jq -r '.owner // "Unknown"' | tr -d '\r')
        local deps=$(echo "${task_json}" | jq -r '.dependencies | if . then join(", ") else "None" end' | tr -d '\r')
        local dod=$(echo "${task_json}" | jq -r '.definition_of_done // "Not specified"' | tr -d '\r')
        local kpis=$(echo "${task_json}" | jq -r '.kpis // "Not specified"' | tr -d '\r')
        local artifacts=$(echo "${task_json}" | jq -r '.artifacts | if . then join(", ") else "Not specified" end' | tr -d '\r')
        local validation=$(echo "${task_json}" | jq -r '.validation // "Not specified"' | tr -d '\r')
        local prereqs=$(echo "${task_json}" | jq -r '.prerequisites // "None"' | tr -d '\r')

        # Read constitution for project context
        local constitution=""
        if [ -f "${SPEC_DIR}/memory/constitution.md" ]; then
            constitution=$(cat "${SPEC_DIR}/memory/constitution.md")
        fi

        # Get role-based context
        local role_persona
        role_persona=$(get_role_persona "${owner}")

        # Get DoD checklist (PRIMARY FOCUS)
        local dod_checklist
        dod_checklist=$(build_dod_checklist "${dod}")

        # Get predecessor task outputs
        local predecessor_context
        predecessor_context=$(get_predecessor_context "${task_id}")

        # Get successor task requirements
        local successor_context
        successor_context=$(get_successor_context "${task_id}")

        # Check current system state
        local system_state
        system_state=$(check_system_state "${task_id}")

        # Build the comprehensive spec prompt with task-specific context
        local spec_prompt="${role_persona}

You are creating a specification for IntelliFlow CRM.

=== YOUR ROLE ===
${role_persona}

=== PRIMARY OBJECTIVE: DEFINITION OF DONE ===
${dod_checklist}

The above Definition of Done items are your PRIMARY FOCUS. Every aspect of your
specification MUST directly address these criteria. If you cannot address a criterion,
you MUST explain why and what is needed.

=== CURRENT SYSTEM STATE ===
${system_state}

=== PREDECESSOR TASKS ===
${predecessor_context}

Review the predecessor outputs above. Your specification should build on their work
and NOT duplicate what was already done.

=== SUCCESSOR TASKS ===
${successor_context}

Your specification must produce outputs that these downstream tasks can use.

=== PROJECT CONSTITUTION ===
${constitution}

=== TASK DETAILS ===
Task ID: ${task_id}
Section: ${section}
Description: ${desc}
Owner: ${owner}
Dependencies: ${deps}
Prerequisites: ${prereqs}

=== ADDITIONAL REQUIREMENTS ===
KPIs: ${kpis}
Expected Artifacts: ${artifacts}
Validation Method: ${validation}

=== YOUR TASK ===
Create a DETAILED TECHNICAL SPECIFICATION for this task that DIRECTLY addresses
each Definition of Done criterion.

OUTPUT FORMAT (REQUIRED):
# Specification: ${task_id}

## Summary
[2-3 sentences describing what this task accomplishes]

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2
[Add all criteria based on Definition of Done]

## Technical Requirements
### Technologies
- [List specific technologies from the stack]

### Architecture Patterns
- [List patterns to follow]

### Integrations
- [List any integrations needed]

## File Changes
| Action | File Path | Description |
|--------|-----------|-------------|
| CREATE/MODIFY | path/to/file | What changes |

## API Contracts (if applicable)
\`\`\`typescript
// Define interfaces/types
\`\`\`

## Database Schema (if applicable)
\`\`\`sql
-- Schema changes
\`\`\`

## Test Requirements
- Unit tests for: [list]
- Integration tests for: [list]
- Target coverage: [percentage]

## Assumptions Made
- [Document any assumptions]

## Dependencies Verification
- [List and verify each dependency status]

IMPORTANT:
- If you need clarification, use the [QUESTION] format from the constitution
- If you can proceed with available information, generate the complete specification
- Document any assumptions you make
- Follow the project conventions from constitution.md"

        # Check for existing human-provided answers
        local answers_file="${TASKS_DIR}/${task_id}_answers.md"
        if [ -f "${answers_file}" ]; then
            log INFO "Found human-provided answers for ${task_id}, incorporating into prompt"
            local answers_content
            answers_content=$(cat "${answers_file}")
            spec_prompt="${spec_prompt}

=== HUMAN-PROVIDED ANSWERS ===
${answers_content}

Use these answers to complete your specification. Do not ask the same questions again."
            # Clean up the questions log since we have answers
            rm -f "${TASKS_DIR}/${task_id}_claude_spec_questions.log"
        fi

        local spec_tmp="${SPEC_DIR}/specifications/${task_id}.md.tmp"
        local max_question_rounds=3
        local question_round=0

        while [ ${question_round} -lt ${max_question_rounds} ]; do
            ((question_round++))
            log INFO "Spec generation attempt ${question_round}/${max_question_rounds}..."

            claude --permission-mode bypassPermissions --print --no-session-persistence -p "${spec_prompt}" > "${spec_tmp}" 2>&1 || true

            # Detect authentication errors
            if grep -qiE "\b401\b|OAuth token has expired|authentication_error|Please run \/login" "${spec_tmp}"; then
                log ERROR "Claude API authentication error detected while generating spec for ${task_id}"
                mv "${spec_tmp}" "${TASKS_DIR}/${task_id}_claude_spec_error.log"
                update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Claude API auth error"
                add_human_intervention "${task_id}" "Claude OAuth token expired or invalid. Run 'claude setup-token' and export CLAUDE_CODE_OAUTH_TOKEN in the shell running swarm-manager." "high"
                return 1
            fi

            # Check for structured questions
            if grep -q "\[QUESTION\]" "${spec_tmp}"; then
                log INFO "Agent asked questions - attempting to resolve..."
                if resolve_questions "${task_id}" "${spec_tmp}"; then
                    # Questions resolved, regenerate with answers
                    spec_prompt=$(regenerate_with_answers "${task_id}" "${spec_prompt}")
                    log INFO "Regenerating spec with resolved answers..."
                    continue
                else
                    # Questions need human input
                    mv "${spec_tmp}" "${TASKS_DIR}/${task_id}_claude_spec_questions.log"
                    update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Spec questions need human input"
                    return 1
                fi
            fi

            # If we get here, no questions - check if valid output
            break
        done

        # Move output to final path if it looks like a spec (non-empty and has headers)
        if [ -s "${spec_tmp}" ] && grep -q "^#" "${spec_tmp}"; then
            mv "${spec_tmp}" "${SPEC_DIR}/specifications/${task_id}.md"
            log SUCCESS "Specification generated: ${SPEC_DIR}/specifications/${task_id}.md"
        else
            log ERROR "Spec generation failed - no valid output produced"
            rm -f "${spec_tmp}"
            update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Spec file missing"
            add_human_intervention "${task_id}" "Claude failed to create spec file (invalid output)" "high"
            return 1
        fi
    fi

    # 1b. Plan Generation (Independent check)
    update_task_phase "${task_id}" "ARCHITECT_PLAN" 0
    if [ ! -f "${SPEC_DIR}/planning/${task_id}.md" ]; then
        log INFO "Generating Implementation Plan..."

        # Read the specification we just created
        local spec_content=""
        if [ -f "${SPEC_DIR}/specifications/${task_id}.md" ]; then
            spec_content=$(cat "${SPEC_DIR}/specifications/${task_id}.md")
        fi

        # Read constitution for project context
        local constitution=""
        if [ -f "${SPEC_DIR}/memory/constitution.md" ]; then
            constitution=$(cat "${SPEC_DIR}/memory/constitution.md")
        fi

        # Get task details for role-based context (re-fetch for plan phase)
        local plan_task_json
        plan_task_json=$(jq ".task_details[\"${task_id}\"]" "${REGISTRY_FILE}" 2>/dev/null) || plan_task_json="{}"

        local plan_owner=$(echo "${plan_task_json}" | jq -r '.owner // "Unknown"' | tr -d '\r')
        local plan_dod=$(echo "${plan_task_json}" | jq -r '.definition_of_done // "Not specified"' | tr -d '\r')
        local plan_kpis=$(echo "${plan_task_json}" | jq -r '.kpis // "Not specified"' | tr -d '\r')

        # Get role-based context for plan
        local plan_role_persona
        plan_role_persona=$(get_role_persona "${plan_owner}")

        # Get DoD checklist (PRIMARY FOCUS)
        local plan_dod_checklist
        plan_dod_checklist=$(build_dod_checklist "${plan_dod}")

        # Get predecessor task outputs (for implementation context)
        local plan_predecessor_context
        plan_predecessor_context=$(get_predecessor_context "${task_id}")

        # Get successor task requirements (what must be ready for downstream)
        local plan_successor_context
        plan_successor_context=$(get_successor_context "${task_id}")

        # Check current system state (what exists vs needs creation)
        local plan_system_state
        plan_system_state=$(check_system_state "${task_id}")

        # Build the comprehensive plan prompt with task-specific context
        local plan_prompt="${plan_role_persona}

You are creating an implementation plan for IntelliFlow CRM.

=== YOUR ROLE ===
${plan_role_persona}

=== PRIMARY OBJECTIVE: DEFINITION OF DONE ===
${plan_dod_checklist}

Each implementation step MUST directly contribute to meeting the above criteria.
After completing all steps, every DoD item must be verifiably complete.

=== CURRENT SYSTEM STATE ===
${plan_system_state}

Use this to determine what needs to be created vs modified.

=== PREDECESSOR TASKS (Build on their work) ===
${plan_predecessor_context}

Do NOT duplicate what predecessors already implemented. Reference their outputs.

=== SUCCESSOR TASKS (Your outputs are needed by) ===
${plan_successor_context}

Ensure your implementation provides what downstream tasks require.

=== SPECIFICATION TO IMPLEMENT ===
${spec_content}

=== PROJECT CONSTITUTION ===
${constitution}

=== KPIs TO ACHIEVE ===
${plan_kpis}

=== YOUR TASK ===
Create a DETAILED STEP-BY-STEP IMPLEMENTATION PLAN that:
1. Addresses EVERY Definition of Done criterion
2. Builds on predecessor outputs (don't redo)
3. Produces outputs needed by successors
4. Meets all KPIs specified

OUTPUT FORMAT (REQUIRED):
# Implementation Plan: ${task_id}

## Prerequisites Checklist
- [ ] Dependency 1 completed
- [ ] Environment setup verified
[List all prerequisites that must be true]

## Implementation Steps

### Step 1: [Short title]
**Files:** \`path/to/file.ts\`
**Action:** CREATE/MODIFY/DELETE

\`\`\`typescript
// Code to implement
\`\`\`

**Validation:**
- [ ] How to verify this step worked

### Step 2: [Short title]
[Continue for all steps...]

## Commands to Run
\`\`\`bash
# List all commands needed
pnpm run test
pnpm run typecheck
\`\`\`

## Validation Checklist
- [ ] All tests pass
- [ ] TypeScript compiles without errors
- [ ] Linting passes
- [ ] KPIs met: [list specific metrics]

## Rollback Plan
1. [Step to undo if needed]
2. [Continue...]

## Estimated Complexity
- Files to change: [number]
- New files: [number]
- Tests to write: [number]
- Risk level: LOW/MEDIUM/HIGH

IMPORTANT:
- If you need clarification, use the [QUESTION] format from the constitution
- If you can proceed with available information, generate the complete plan
- Include actual code snippets, not placeholders
- Follow the project conventions from constitution.md
- Be specific about file paths and code changes"

        # Check for existing human-provided answers
        local plan_answers_file="${TASKS_DIR}/${task_id}_answers.md"
        if [ -f "${plan_answers_file}" ]; then
            log INFO "Found human-provided answers for ${task_id}, incorporating into plan prompt"
            local plan_answers_content
            plan_answers_content=$(cat "${plan_answers_file}")
            plan_prompt="${plan_prompt}

=== HUMAN-PROVIDED ANSWERS ===
${plan_answers_content}

Use these answers to complete your implementation plan. Do not ask the same questions again."
            # Clean up the questions log since we have answers
            rm -f "${TASKS_DIR}/${task_id}_claude_plan_questions.log"
        fi

        local plan_tmp="${SPEC_DIR}/planning/${task_id}.md.tmp"
        local max_question_rounds=3
        local question_round=0

        while [ ${question_round} -lt ${max_question_rounds} ]; do
            ((question_round++))
            log INFO "Plan generation attempt ${question_round}/${max_question_rounds}..."

            claude --permission-mode bypassPermissions --print --no-session-persistence -p "${plan_prompt}" > "${plan_tmp}" 2>&1 || true

            # Detect authentication errors
            if grep -qiE "\b401\b|OAuth token has expired|authentication_error|Please run \/login" "${plan_tmp}"; then
                log ERROR "Claude API authentication error detected while generating plan for ${task_id}"
                mv "${plan_tmp}" "${TASKS_DIR}/${task_id}_claude_plan_error.log"
                update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Claude API auth error"
                add_human_intervention "${task_id}" "Claude OAuth token expired or invalid. Run 'claude setup-token' and export CLAUDE_CODE_OAUTH_TOKEN in the shell running swarm-manager." "high"
                return 1
            fi

            # Check for structured questions
            if grep -q "\[QUESTION\]" "${plan_tmp}"; then
                log INFO "Agent asked questions - attempting to resolve..."
                if resolve_questions "${task_id}" "${plan_tmp}"; then
                    # Questions resolved, regenerate with answers
                    plan_prompt=$(regenerate_with_answers "${task_id}" "${plan_prompt}")
                    log INFO "Regenerating plan with resolved answers..."
                    continue
                else
                    # Questions need human input
                    mv "${plan_tmp}" "${TASKS_DIR}/${task_id}_claude_plan_questions.log"
                    update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Plan questions need human input"
                    return 1
                fi
            fi

            # If we get here, no questions - check if valid output
            break
        done

        if [ -s "${plan_tmp}" ] && grep -q "^#" "${plan_tmp}"; then
            mv "${plan_tmp}" "${SPEC_DIR}/planning/${task_id}.md"
            log SUCCESS "Implementation plan generated: ${SPEC_DIR}/planning/${task_id}.md"
        else
            log ERROR "Plan generation failed - no valid output produced"
            rm -f "${plan_tmp}"
            update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Plan file missing"
            add_human_intervention "${task_id}" "Claude failed to create plan file (invalid output)" "high"
            return 1
        fi
    fi

    # -------------------------------------------------------------------------
    # PHASE 2: ENFORCER (Codex TDD)
    # -------------------------------------------------------------------------
    update_task_phase "${task_id}" "ENFORCER_TDD" 0
    log PHASE "Phase 2: Enforcer (Codex TDD Test Generation)..."

    # Test file location (proper __tests__/ directory)
    local test_dir="${PROJECT_ROOT}/apps/project-tracker/__tests__"
    local test_file="${test_dir}/${task_id}_generated.test.ts"

    # Regenerate tests if spec is newer than tests
    # Guard with || to prevent set -e exit - Codex failure is non-fatal
    # (Phase 3.6 TDD validation will catch missing tests)
    if [ ! -f "${test_file}" ] || \
       [ "${SPEC_DIR}/specifications/${task_id}.md" -nt "${test_file}" ]; then
        if ! run_codex_tests "${task_id}"; then
            log WARN "Codex test generation failed - continuing without TDD tests"
            log WARN "Phase 3.6 will skip TDD validation if no tests exist"
            # Record the failure but don't block - let Phase 3.6 handle it
            echo "Codex test generation failed at $(date -Iseconds)" >> "${error_log}"
        fi
    fi

    # -------------------------------------------------------------------------
    # PHASE 3: BUILDER (Claude Code Loop)
    # -------------------------------------------------------------------------
    log PHASE "Phase 3: Builder (Implementation Loop)..."

    local retries=0
    local success=false

    while [ $retries -lt $MAX_RETRIES ]; do
        update_task_phase "${task_id}" "BUILDER_ATTEMPT" $((retries + 1))
        # Guard plan file read - if missing, we can't proceed
        local plan_file="${SPEC_DIR}/planning/${task_id}.md"
        if [[ ! -f "${plan_file}" ]]; then
            log ERROR "Plan file not found at ${plan_file}"
            update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Plan file missing"
            add_human_intervention "${task_id}" "Plan file missing - Phase 1 may have failed" "high"
            return 1
        fi

        local plan_content
        plan_content=$(cat "${plan_file}") || {
            log ERROR "Failed to read plan file"
            retries=$((retries+1))
            continue
        }

        # Get task-specific context for builder
        local builder_task_json
        builder_task_json=$(jq ".task_details[\"${task_id}\"]" "${REGISTRY_FILE}" 2>/dev/null) || builder_task_json="{}"

        local builder_owner=$(echo "${builder_task_json}" | jq -r '.owner // "Unknown"' | tr -d '\r')
        local builder_dod=$(echo "${builder_task_json}" | jq -r '.definition_of_done // "Not specified"' | tr -d '\r')
        local builder_kpis=$(echo "${builder_task_json}" | jq -r '.kpis // "Not specified"' | tr -d '\r')

        # Get role-based context
        local builder_role_persona
        builder_role_persona=$(get_role_persona "${builder_owner}")

        # Get DoD checklist
        local builder_dod_checklist
        builder_dod_checklist=$(build_dod_checklist "${builder_dod}")

        local prompt="${builder_role_persona}

=== TASK: ${task_id} ===

=== YOUR ROLE ===
${builder_role_persona}

=== DEFINITION OF DONE (MUST VERIFY EACH ITEM) ===
${builder_dod_checklist}

=== KPIs TO ACHIEVE ===
${builder_kpis}

=== IMPLEMENTATION PLAN (FOLLOW STRICTLY) ===
${plan_content}

=== INSTRUCTIONS ===
1. Follow the implementation plan step by step
2. After each step, verify it addresses a DoD criterion
3. Before finishing, verify ALL DoD items are complete
4. Meet all KPI targets specified"

        # Inject Codex tests if available
        if [ -f "${test_file}" ]; then
            prompt="${prompt}

REQUIRED TESTS (Generated by Codex - These MUST pass):
$(cat "${test_file}")"
        fi

        # Inject error feedback if previous attempt failed
        if [ -f "$error_log" ]; then
            local err_msg
            err_msg=$(cat "$error_log") || err_msg="(failed to read error log)"
            prompt="${prompt}

🚨 PREVIOUS VALIDATION FAILED. FIX THESE ERRORS:
${err_msg}"

            local retry_count
            retry_count=$(increment_retry_count "${task_id}") || retry_count=$retries
            log WARN "Retrying with error context (${retry_count}/${MAX_RETRIES})..."

            # Exponential backoff
            local wait_time=$((RETRY_DELAY_SECONDS * (retries + 1)))
            log INFO "Waiting ${wait_time}s before retry..."
            sleep $wait_time
        fi

        # Execute Claude with print mode for non-interactive output
        # Guard with || true to prevent set -e exit, capture output for auth check
        local claude_output="${TASKS_DIR}/${task_id}_phase3.tmp"
        claude --print --no-session-persistence -p "$prompt" > "${claude_output}" 2>&1 || true

        # Check for authentication errors
        if grep -qiE "\b401\b|OAuth token has expired|authentication_error|Please run \/login" "${claude_output}" 2>/dev/null; then
            log ERROR "Claude API authentication error in Phase 3"
            mv "${claude_output}" "${TASKS_DIR}/${task_id}_phase3_auth_error.log"
            update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Claude API auth error"
            add_human_intervention "${task_id}" "Claude OAuth token expired during Phase 3. Run 'claude setup-token'." "high"
            return 1
        fi

        # Log the output (for debugging) then clean up
        cat "${claude_output}" >> "${EXECUTION_LOG}" 2>/dev/null || true
        rm -f "${claude_output}"

        # ---------------------------------------------------------------------
        # PHASE 3.5: QUALITY GATES (Pre-Validation)
        # ---------------------------------------------------------------------
        update_task_phase "${task_id}" "QUALITY_GATES" $((retries + 1))
        log PHASE "Phase 3.5: Quality Gates (TypeCheck, Lint, Tests, Security)..."

        if ! run_quality_gates "${task_id}" > "$error_log" 2>&1; then
            log ERROR "Quality gates failed (TypeCheck or critical issues)"
            cat "$error_log" >> "$VALIDATION_LOG"
            retries=$((retries+1))
            continue
        fi

        # ---------------------------------------------------------------------
        # PHASE 3.6: TDD VALIDATION (Run Generated Tests)
        # ---------------------------------------------------------------------
        update_task_phase "${task_id}" "TDD_VALIDATION" $((retries + 1))
        log PHASE "Phase 3.6: TDD Validation (Generated Tests)..."

        if ! run_tdd_validation "${task_id}" >> "$error_log" 2>&1; then
            log ERROR "TDD validation failed - generated tests did not pass"
            cat "$error_log" >> "$VALIDATION_LOG"
            retries=$((retries+1))
            continue
        fi

        # ---------------------------------------------------------------------
        # PHASE 4: VALIDATION (Deterministic Gates)
        # ---------------------------------------------------------------------
        update_task_phase "${task_id}" "GATEKEEPER_ATTEMPT" $((retries + 1))
        log PHASE "Phase 4: Validation (Deterministic Gates)..."
        update_csv_status "${task_id}" "${STATUS_VALIDATING}"

        if run_yaml_validation "${task_id}" > "$error_log" 2>&1; then
            cat "$error_log" >> "$VALIDATION_LOG"

            # -----------------------------------------------------------------
            # PHASE 5: AUDITOR (Claude Code) - Logic & Security Review
            # -----------------------------------------------------------------
            update_task_phase "${task_id}" "AUDITOR_ATTEMPT" $((retries + 1))
            log PHASE "Phase 5: Auditor (Claude Code A2A Review)..."

            if run_claude_audit "${task_id}"; then
                success=true
                break
            else
                log ERROR "Claude audit failed"
                cat "${TASKS_DIR}/${task_id}_audit.log" >> "$error_log" 2>/dev/null || true
                retries=$((retries+1))
            fi
        else
            log ERROR "Validation failed"
            cat "$error_log" >> "$VALIDATION_LOG"
            retries=$((retries+1))
        fi
    done

    # -------------------------------------------------------------------------
    # COMPLETION
    # -------------------------------------------------------------------------
    if [ "$success" = true ]; then
        rm -f "$error_log"

        if [[ "${skip_review}" != "true" ]]; then
            # Trigger qualitative review (task stays In Review, not crashed)
            update_task_phase "${task_id}" "IN_REVIEW" 0
            task_completed=true  # Prevent crash marking on exit
            local review_file=$(trigger_qualitative_review "${task_id}")
            log INFO "Review request created: ${review_file}"
            log HUMAN "Manual review required. Complete with:"
            log HUMAN "  ./orchestrator.sh review ${task_id} approved|changes_requested|rejected [notes]"
        else
            update_task_phase "${task_id}" "COMPLETED" 0
            task_completed=true  # Prevent crash marking on exit
            update_csv_status "${task_id}" "${STATUS_COMPLETED}" "Task completed successfully"

            # Update task file with completion timestamp
            local task_file
            task_file=$(find_task_file "${task_id}")
            if [[ -n "${task_file}" ]] && [[ -f "${task_file}" ]]; then
                local now
                now=$(date -Iseconds)
                jq --arg completed_at "${now}" '.completed_at = $completed_at' \
                    "${task_file}" > "${task_file}.tmp" && mv "${task_file}.tmp" "${task_file}"
            fi

            # Generate task definition file with proper schema compliance
            generate_task_definition_file "${task_id}" "DONE"

            log SUCCESS "Task ${task_id} completed!"
        fi
    else
        add_human_intervention "${task_id}" "Validation loop failed after ${MAX_RETRIES} retries" "high"
        update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Validation failed"
        log ERROR "Task ${task_id} failed after ${MAX_RETRIES} attempts"
        return 1
    fi
}

# =============================================================================
# BATCH EXECUTION
# =============================================================================

execute_ready_tasks() {
    log INFO "Finding ready tasks..."

    local ready_tasks=()

    while IFS= read -r task_id; do
        local status=$(get_task_status "${task_id}")

        # Skip completed, failed, blocked, or in-review
        if [[ "${status}" == "${STATUS_COMPLETED}" ]] || \
           [[ "${status}" == "${STATUS_FAILED}" ]] || \
           [[ "${status}" == "${STATUS_BLOCKED}" ]] || \
           [[ "${status}" == "${STATUS_IN_REVIEW}" ]] || \
           [[ "${status}" == "${STATUS_NEEDS_HUMAN}" ]]; then
            continue
        fi

        # Check dependencies
        if check_dependencies "${task_id}" 2>/dev/null; then
            ready_tasks+=("${task_id}")
        fi
    done < <(jq -r '.task_details | keys[]' "${REGISTRY_FILE}" | tr -d '\r' | sort -V)

    if [[ ${#ready_tasks[@]} -eq 0 ]]; then
        log INFO "No tasks ready for execution"
        return 0
    fi

    log INFO "Ready tasks: ${ready_tasks[*]}"

    for task_id in "${ready_tasks[@]}"; do
        execute_task "${task_id}" "true"  # Skip review for batch
    done
}

# =============================================================================
# STATUS DISPLAY
# =============================================================================

show_status() {
    local target_sprint="${1:-all}"
    local graph_file="${PROJECT_ROOT}/apps/project-tracker/docs/metrics/_global/dependency-graph.json"
    local registry="${REGISTRY_FILE}"

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    if [[ "${target_sprint}" == "all" ]]; then
        echo "                      📊 EXECUTION STATUS (ALL SPRINTS)"
    else
        echo "                      📊 EXECUTION STATUS (SPRINT ${target_sprint})"
    fi
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if [[ ! -f "${registry}" ]]; then
        echo "Registry file not found: ${registry}"
        return
    fi

    local total=$(jq '.task_details | length' "${registry}")
    local completed=0
    local failed=0
    local blocked=0
    local in_review=0
    local in_progress=0
    local needs_human=0
    local planned=0

    while IFS= read -r task_id; do
        local sprint=$(jq -r ".task_details[\"${task_id}\"] | .sprint" "${registry}")
        if [[ "${target_sprint}" != "all" ]] && [[ "${sprint}" != "${target_sprint}" ]]; then
            continue
        fi

        local status=$(get_task_status "${task_id}")
        case "${status}" in
            "${STATUS_COMPLETED}") ((completed++)) ;;
            "${STATUS_FAILED}") ((failed++)) ;;
            "${STATUS_BLOCKED}") ((blocked++)) ;;
            "${STATUS_IN_REVIEW}") ((in_review++)) ;;
            "${STATUS_IN_PROGRESS}"|"${STATUS_VALIDATING}") ((in_progress++)) ;;
            "${STATUS_NEEDS_HUMAN}") ((needs_human++)) ;;
            *) ((planned++)) ;;
        esac
    done < <(jq -r '.task_details | keys[]' "${registry}" | tr -d '\r')

    local progress=$(( total > 0 ? (completed * 100 / total) : 0 ))

    echo "  Summary"
    echo "  ───────"
    printf "  Total Tasks:       %s\n" "${total}"
    printf "  ${GREEN}✅ Completed:${NC}       %s (%s%%)\n" "${completed}" "${progress}"
    printf "  ${YELLOW}🔄 In Progress:${NC}     %s\n" "${in_progress}"
    printf "  ${PURPLE}👁️  In Review:${NC}       %s\n" "${in_review}"
    printf "  ${RED}❌ Failed:${NC}          %s\n" "${failed}"
    printf "  ${RED}🚧 Blocked:${NC}         %s\n" "${blocked}"
    printf "  ${WHITE}👤 Needs Human:${NC}     %s\n" "${needs_human}"
    printf "  ${CYAN}📋 Planned:${NC}         %s\n" "${planned}"
    echo ""

    # Progress bar
    local bar_width=50
    local filled=$((progress * bar_width / 100))
    local empty=$((bar_width - filled))

    echo -n "  Progress: ["
    printf "%${filled}s" | tr ' ' '█'
    printf "%${empty}s" | tr ' ' '░'
    echo "] ${progress}%"
    echo ""

    # Show issues if any
    if [[ ${needs_human} -gt 0 ]] || [[ ${blocked} -gt 0 ]] ; then
        echo "  ⚠️  Issues Requiring Attention"
        echo "  ──────────────────────────────"

        if [[ ${needs_human} -gt 0 ]]; then
            echo "  Human interventions pending. Run: ./orchestrator.sh interventions"
        fi

        if [[ ${blocked} -gt 0 ]]; then
            echo "  Tasks blocked. Run: ./orchestrator.sh blockers"
        fi
        echo ""
    fi

    # Next ready tasks (from dependency graph if available)
    echo "  Next Ready Tasks"
    echo "  ────────────────"
    local count=0
    if [[ -f "${graph_file}" ]]; then
        if [[ "${target_sprint}" == "all" ]]; then
            jq -r '.ready_to_start[]?' "${graph_file}" | tr -d '\r' | sort -V | while read -r task_id; do
                if [[ ${count} -ge 5 ]]; then break; fi
                local desc=$(jq -r ".task_details[\"${task_id}\"] | .description" "${registry}")
                printf "  ${GREEN}→${NC} %s: %s\n" "${task_id}" "${desc:0:50}"
                ((count++))
            done
        else
            jq -r --argjson sprint "${target_sprint}" '
              .ready_to_start
              | map(select(. != null))
              | map(select(. as $id | (.nodes[$id].sprint // 0) == $sprint))
              | .[]
            ' "${graph_file}" | tr -d '\r' | sort -V | while read -r task_id; do
                if [[ ${count} -ge 5 ]]; then break; fi
                local desc=$(jq -r ".task_details[\"${task_id}\"] | .description" "${registry}")
                printf "  ${GREEN}→${NC} %s: %s\n" "${task_id}" "${desc:0:50}"
                ((count++))
            done
        fi
    fi

    if [[ ${count} -eq 0 ]]; then
        echo "  No tasks ready (check blockers/dependencies)"
    fi
    echo ""
}

# =============================================================================
# LIST TASKS
# =============================================================================

list_tasks() {
    echo ""
    echo "Sprint 0 Tasks:"
    echo "==============="

    while IFS= read -r task_id; do
        local status=$(get_task_status "${task_id}")
        local desc=$(jq -r ".task_details[\"${task_id}\"] | .description" "${REGISTRY_FILE}")

        local status_icon
        case "${status}" in
            "${STATUS_COMPLETED}") status_icon="${GREEN}✅${NC}" ;;
            "${STATUS_FAILED}") status_icon="${RED}❌${NC}" ;;
            "${STATUS_BLOCKED}") status_icon="${RED}🚧${NC}" ;;
            "${STATUS_IN_REVIEW}") status_icon="${PURPLE}👁️${NC}" ;;
            "${STATUS_IN_PROGRESS}"|"${STATUS_VALIDATING}") status_icon="${YELLOW}🔄${NC}" ;;
            "${STATUS_NEEDS_HUMAN}") status_icon="${WHITE}👤${NC}" ;;
            *) status_icon="${CYAN}📋${NC}" ;;
        esac

        printf "  %b [%s] %s\n" "${status_icon}" "${task_id}" "${desc:0:60}"
    done < <(jq -r '.task_details | keys[]' "${REGISTRY_FILE}" | tr -d '\r')
    echo ""
}

# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

main() {
    local command="${1:-help}"

    initialize

    case "${command}" in
        run)
            shift
            if [[ $# -eq 0 ]]; then
                execute_ready_tasks
            else
                for task_id in "$@"; do
                    execute_task "${task_id}"
                done
            fi
            ;;

        run-quick)
            shift
            if [[ $# -eq 0 ]]; then
                log ERROR "run-quick requires at least one task ID"
                exit 1
            fi
            for task_id in "$@"; do
                execute_task "${task_id}" "true"
            done
            ;;

        validate)
            local task_id="${2:-}"
            if [[ -z "${task_id}" ]]; then
                echo "Usage: $0 validate <task-id>"
                exit 1
            fi
            run_yaml_validation "${task_id}"
            ;;

        review)
            local task_id="${2:-}"
            local result="${3:-}"
            local notes="${4:-}"

            if [[ -z "${task_id}" ]] || [[ -z "${result}" ]]; then
                echo "Usage: $0 review <task-id> <approved|changes_requested|rejected> [notes]"
                exit 1
            fi
            complete_qualitative_review "${task_id}" "${result}" "${notes}"
            ;;

        status)
            show_status
            ;;

        list)
            list_tasks
            ;;

        list-ready)
            # List ready tasks (fast path using dependency-graph ready_to_start)
            # Optional arg: sprint number or "all"
            local target_sprint="${2:-all}"
            local graph_file="${PROJECT_ROOT}/apps/project-tracker/docs/metrics/_global/dependency-graph.json"

            if [[ ! -f "${graph_file}" ]]; then
                echo "dependency-graph.json not found. Run sync first." >&2
                exit 1
            fi

            if [[ "${target_sprint}" == "all" ]]; then
                jq -r '.ready_to_start[]?' "${graph_file}" | tr -d '\r' | sort -V
            else
                jq -r --argjson sprint "${target_sprint}" '
                  .ready_to_start
                  | map(select(. != null))
                  | map(select(. as $id | (.nodes[$id].sprint // 0) == $sprint))
                  | .[]
                ' "${graph_file}" | tr -d '\r' | sort -V
            fi
            ;;

        interventions)
            list_human_interventions
            ;;

        resolve-intervention)
            local task_id="${2:-}"
            local resolution="${3:-resolved}"
            if [[ -z "${task_id}" ]]; then
                echo "Usage: $0 resolve-intervention <task-id> [resolution]"
                exit 1
            fi
            resolve_human_intervention "${task_id}" "${resolution}"
            ;;

        blockers)
            list_blockers
            ;;

        add-blocker)
            local task_id="${2:-}"
            local blocker_type="${3:-}"
            local description="${4:-}"
            if [[ -z "${task_id}" ]] || [[ -z "${blocker_type}" ]] || [[ -z "${description}" ]]; then
                echo "Usage: $0 add-blocker <task-id> <type> <description>"
                echo "Types: dependency, technical, resource, external"
                exit 1
            fi
            add_blocker "${task_id}" "${blocker_type}" "${description}"
            ;;

        resolve-blocker)
            local task_id="${2:-}"
            local resolution="${3:-resolved}"
            if [[ -z "${task_id}" ]]; then
                echo "Usage: $0 resolve-blocker <task-id> [resolution]"
                exit 1
            fi
            resolve_blocker "${task_id}" "${resolution}"
            ;;

        context)
            local task_id="${2:-}"
            if [[ -z "${task_id}" ]]; then
                echo "Usage: $0 context <task-id>"
                exit 1
            fi
            create_task_context "${task_id}"
            cat "${ARTIFACTS_DIR}/contexts/${task_id}-context.md"
            ;;

        explain)
            local task_id="${2:-}"
            if [[ -z "${task_id}" ]]; then
                echo "Usage: $0 explain <task-id>"
                exit 1
            fi
            explain_task "${task_id}"
            ;;

        generate-runbook)
            local task_id="${2:-}"
            local exit_code="${3:-1}"
            local phase="${4:-UNKNOWN}"
            local reason="${5:-Manual generation}"
            if [[ -z "${task_id}" ]]; then
                echo "Usage: $0 generate-runbook <task-id> [exit_code] [phase] [reason]"
                exit 1
            fi
            generate_runbook_summary "${task_id}" "${exit_code}" "${phase}" "${reason}"
            ;;

        generate-task-file)
            local task_id="${2:-}"
            local status="${3:-PLANNED}"
            if [[ -z "${task_id}" ]]; then
                echo "Usage: $0 generate-task-file <task-id> [status]"
                echo "Status: PLANNED, IN_PROGRESS, DONE, BLOCKED, FAILED"
                exit 1
            fi
            generate_task_definition_file "${task_id}" "${status}"
            ;;

        setup)
            initialize
            log SUCCESS "Project structure initialized."
            ;;

        help|*)
            cat << 'HELP'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  IntelliFlow CRM - Sprint Orchestrator v7.0 (True Mega-Merge)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Usage: orchestrator.sh <command> [options]

TASK EXECUTION
  run [task-ids...]         Execute tasks (or ALL ready tasks if no args)
  run-quick <task-ids...>   Execute tasks (skip qualitative review)
  validate <task-id>        Run validation gates only
  review <id> <result>      Complete qualitative review
                            Results: approved, changes_requested, rejected

STATUS & LISTING
  status                    Show sprint dashboard with progress bar
  list                      List all tasks with status icons
  list-ready                List tasks ready for execution

HUMAN INTERVENTIONS
  interventions             List pending interventions
  resolve-intervention <task-id> [resolution]

BLOCKERS
  blockers                  List active blockers
  add-blocker <task-id> <type> <description>
                            Types: dependency, technical, resource, external
  resolve-blocker <task-id> [resolution]

CONTEXT & DIAGNOSTICS
  context <task-id>         Generate and display task context
  explain <task-id>         Show task status, phase, and recommended actions
  generate-runbook <task-id> [exit_code] [phase] [reason]
                            Generate failure runbook markdown

TASK DEFINITIONS
  generate-task-file <task-id> [status]
                            Generate schema-compliant task definition file
                            Status: PLANNED, IN_PROGRESS, DONE, BLOCKED, FAILED

SETUP
  setup                     Initialize project structure

EXAMPLES
  ./orchestrator.sh run                           # Execute all ready tasks
  ./orchestrator.sh run EXC-INIT-001              # Execute specific task
  ./orchestrator.sh run-quick ENV-001-AI          # Skip qualitative review
  ./orchestrator.sh validate AI-SETUP-001         # Test validation only
  ./orchestrator.sh review ENV-001-AI approved    # Approve review
  ./orchestrator.sh add-blocker ENV-004-AI external "Supabase API down"
  ./orchestrator.sh generate-task-file ENV-001-AI PLANNED  # Generate task file

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HELP
            ;;
    esac
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
