#!/usr/bin/env bash
# =============================================================================
# IntelliFlow CRM - Sprint Orchestrator v1.0 
# =============================================================================
# INTEGRATION MANIFEST:
#   [x] CORE: Full Dependency Graph, CSV Backups, Status Tracking
#   [x] OPS:  Human Interventions, Blocker Management, Qualitative Reviews
#   [x] OPS:  Artifact Validation, KPI Checks, Batch Execution
#   [x] AI:   Phase 1 (Architect - Spec/Plan via MCP)
#   [x] AI:   Phase 2 (Enforcer - Codex TDD)
#   [x] AI:   Phase 3 (Builder - Claude Code Loop)
#   [x] AI:   Phase 4 (Gatekeeper - YAML Validation)
#   [x] AI:   Phase 5 (Auditor - Gemini A2A)
#
# CLI COMMANDS:
#   run, run-quick, validate, review, status, list, list-ready,
#   interventions, resolve-intervention, blockers, add-blocker,
#   resolve-blocker, context, setup, help
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# =============================================================================
# CONFIGURATION
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="${SCRIPT_DIR}/.."
readonly TASKS_DIR="${PROJECT_ROOT}/apps/project-tracker/docs/metrics"
readonly LOGS_DIR="${PROJECT_ROOT}/logs"
readonly ARTIFACTS_DIR="${PROJECT_ROOT}/artifacts"
readonly SPEC_DIR="${PROJECT_ROOT}/.specify"

# Files
readonly CSV_FILE="${TASKS_DIR}/_global/Sprint_plan.csv"
readonly CSV_BACKUP_DIR="${TASKS_DIR}/backups"
readonly REGISTRY_FILE="${TASKS_DIR}/_global/task-registry.json"
readonly VALIDATION_FILE="${TASKS_DIR}/validation.yaml"
# MCP is configured globally at ~/.claude.json

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
    mkdir -p "${LOGS_DIR}" "${ARTIFACTS_DIR}/status" "${ARTIFACTS_DIR}/contexts" \
             "${ARTIFACTS_DIR}/work" "${ARTIFACTS_DIR}/validation" "${ARTIFACTS_DIR}/reports" \
             "${CSV_BACKUP_DIR}" "${QUALITATIVE_REVIEW_DIR}" \
             "${SPEC_DIR}/specifications" "${SPEC_DIR}/planning" "${SPEC_DIR}/memory" \
             "${PROJECT_ROOT}/docs/references"

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

    # Mask API Keys in logs
    if [[ -n "${OPENAI_API_KEY:-}" ]]; then message=${message//$OPENAI_API_KEY/********}; fi
    if [[ -n "${GEMINI_API_KEY:-}" ]]; then message=${message//$GEMINI_API_KEY/********}; fi

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

        # Update CSV (Status is column 10)
        awk -F',' -v OFS=',' -v task="$task_id" -v status="$new_status" '
        NR==1 {print; next}
        $1 == task {$10 = status}
        {print}
        ' "${CSV_FILE}" > "${CSV_FILE}.tmp" && mv "${CSV_FILE}.tmp" "${CSV_FILE}"
    fi

    log INFO "Status updated: ${task_id} → ${new_status}"

    # Update JSON status file
    local status_file="${ARTIFACTS_DIR}/status/${task_id}.json"
    cat > "${status_file}" << EOF
{
    "task_id": "${task_id}",
    "status": "${new_status}",
    "updated_at": "$(date -Iseconds)",
    "notes": "${notes}",
    "execution_log": "${EXECUTION_LOG}",
    "validation_log": "${VALIDATION_LOG}",
    "retry_count": 0
}
EOF
}

get_task_status() {
    local task_id="$1"
    local status_file="${ARTIFACTS_DIR}/status/${task_id}.json"

    if [[ -f "${status_file}" ]]; then
        jq -r '.status' "${status_file}"
    else
        echo "${STATUS_PLANNED}"
    fi
}

increment_retry_count() {
    local task_id="$1"
    local status_file="${ARTIFACTS_DIR}/status/${task_id}.json"

    if [[ -f "${status_file}" ]]; then
        local current_count=$(jq -r '.retry_count // 0' "${status_file}")
        local new_count=$((current_count + 1))

        jq ".retry_count = ${new_count}" "${status_file}" > "${status_file}.tmp"
        mv "${status_file}.tmp" "${status_file}"

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
    jq -r ".tasks[] | select(.id == \"${task_id}\") | .dependencies[]?" "${REGISTRY_FILE}" 2>/dev/null || echo ""
}

check_dependencies() {
    local task_id="$1"
    local deps=$(get_dependencies "${task_id}")

    if [[ -z "$deps" ]]; then
        return 0
    fi

    for dep in $deps; do
        local dep_status=$(get_task_status "${dep}")
        if [[ "${dep_status}" != "${STATUS_COMPLETED}" ]]; then
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
    local description=$(jq -r ".tasks[] | select(.id == \"${task_id}\") | .description" "${REGISTRY_FILE}")
    local artifacts=$(jq -r ".tasks[] | select(.id == \"${task_id}\") | .artifacts | join(\"\n  - \")" "${REGISTRY_FILE}" 2>/dev/null || echo "N/A")

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

### For Gemini CLI:
\`\`\`bash
gemini review --files "${artifacts}" --checklist security,quality,architecture
\`\`\`

### For Fresh Claude Instance:
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
# TASK CONTEXT GENERATION
# =============================================================================

create_task_context() {
    local task_id="$1"
    local task_data=$(jq ".tasks[] | select(.id == \"${task_id}\")" "${REGISTRY_FILE}")

    local context_file="${ARTIFACTS_DIR}/contexts/${task_id}-context.md"

    local description=$(echo "${task_data}" | jq -r '.description')
    local prerequisites=$(echo "${task_data}" | jq -r '.prerequisites | join(", ")' 2>/dev/null || echo "None")
    local definition_of_done=$(echo "${task_data}" | jq -r '.definition_of_done' 2>/dev/null || echo "N/A")
    local artifacts=$(echo "${task_data}" | jq -r '.artifacts | join("\n  - ")' 2>/dev/null || echo "N/A")
    local kpis=$(echo "${task_data}" | jq -r '.kpis | join("\n  - ")' 2>/dev/null || echo "N/A")
    local validation=$(echo "${task_data}" | jq -r '.validation' 2>/dev/null || echo "N/A")
    local deps=$(echo "${task_data}" | jq -r '.dependencies | join(", ")' 2>/dev/null || echo "None")

    cat > "${context_file}" << EOF
# Task Context: ${task_id}

## Description
${description}

## Dependencies
${deps}

## Prerequisites
${prerequisites}

## Definition of Done
${definition_of_done}

## KPIs
  - ${kpis}

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
        local dep_context="${ARTIFACTS_DIR}/contexts/${dep}-context.md"
        if [[ -f "${dep_context}" ]]; then
            echo "### From ${dep}" >> "${context_file}"
            echo "" >> "${context_file}"
            head -20 "${dep_context}" >> "${context_file}"
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
    local artifacts=$(jq -r ".tasks[] | select(.id == \"${task_id}\") | .artifacts[]" "${REGISTRY_FILE}" 2>/dev/null)

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
                # Check in work directory
                if [[ -e "${ARTIFACTS_DIR}/work/${task_id}/${artifact}" ]]; then
                    found+=("${artifact} (in work dir)")
                else
                    missing+=("${artifact}")
                fi
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
# A2A INTELLIGENCE PROTOCOLS
# =============================================================================

# AGENT 1: CODEX (The Enforcer) - TDD Test Generation
run_codex_tests() {
    local task_id="$1"

    if [[ -z "${OPENAI_API_KEY:-}" ]]; then
        log WARN "Codex: OpenAI API Key missing. Skipping TDD generation."
        return 0
    fi

    log PHASE "A2A: Handing off to Codex (Enforcer)..."

    local spec=$(cat "${SPEC_DIR}/specifications/${task_id}.md")
    local prompt="You are the Quality Assurance Lead.

Read this Specification:
$spec

Generate strictly typed TypeScript unit tests (using Vitest or Jest) that verify these requirements.

Rules:
1. Use strict TypeScript types
2. Test happy path and edge cases
3. Mock external dependencies
4. Include error handling tests

Output ONLY the code block for the test file. No explanation."

    local response=$(curl -s https://api.openai.com/v1/chat/completions \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $OPENAI_API_KEY" \
      -d "{
        \"model\": \"gpt-4o\",
        \"messages\": [{\"role\": \"user\", \"content\": $(jq -Rs . <<< "$prompt")}],
        \"temperature\": 0.2
      }")

    local code=$(echo "$response" | jq -r '.choices[0].message.content' | sed 's/```typescript//g' | sed 's/```//g')

    if [[ -n "$code" && "$code" != "null" ]]; then
        echo "$code" > "${TASKS_DIR}/${task_id}_generated.test.ts"
        log SUCCESS "Codex: TDD tests generated at ${TASKS_DIR}/${task_id}_generated.test.ts"
        return 0
    else
        log ERROR "Codex: Test generation failed."
        return 1
    fi
}

# AGENT 2: GEMINI (The Auditor) - Logic & Security Review
run_gemini_audit() {
    local task_id="$1"

    if [[ -z "${GEMINI_API_KEY:-}" ]]; then
        log WARN "Gemini: API Key missing. Skipping audit."
        return 0
    fi

    log PHASE "A2A: Handing off to Gemini (Auditor)..."

    local spec=$(cat "${SPEC_DIR}/specifications/${task_id}.md")
    local plan=$(cat "${SPEC_DIR}/planning/${task_id}.md")
    local constitution=$(cat "${SPEC_DIR}/memory/constitution.md")

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

Reply with ONLY one of:
- 'APPROVED' if everything is correct
- 'REJECT: <specific reason>' if there are issues"

    local response=$(curl -s -H "Content-Type: application/json" \
         -d "{ \"contents\": [{ \"parts\": [{ \"text\": $(jq -Rs . <<< "$prompt") }] }] }" \
         "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}")

    local audit_text=$(echo "$response" | jq -r '.candidates[0].content.parts[0].text // empty')

    if [[ "$audit_text" == *"APPROVED"* ]]; then
        log SUCCESS "Gemini: Audit Approved."
        return 0
    else
        log ERROR "Gemini: Audit Rejected - ${audit_text}"
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
import yaml, subprocess, sys, os

os.environ['TASK_ID'] = '${task_id}'

try:
    with open('${VALIDATION_FILE}') as f:
        data = yaml.safe_load(f)
except Exception as e:
    print(f'Error loading validation YAML: {e}')
    sys.exit(1)

# Combine global + task-specific checks
checks = data.get('global_spec_check', {}).get('validation_commands', []) + \
         data.get('global_security_check', {}).get('validation_commands', []) + \
         data.get('${task_id}', {}).get('validation_commands', [])

failed = False
for check in checks:
    cmd = check['command']
    desc = check.get('description', cmd)
    print(f\"   > {desc}...\")
    try:
        subprocess.check_output(cmd, shell=True, stderr=subprocess.STDOUT, env=os.environ)
        print(f'   ✅ Passed')
    except subprocess.CalledProcessError as e:
        print(f'   ❌ Failed: {cmd}')
        print(f'   Output: {e.output.decode().strip()}')
        failed = True

if failed:
    sys.exit(1)
"
}

# =============================================================================
# CORE EXECUTION PIPELINE
# =============================================================================

execute_task() {
    local task_id="$1"
    local skip_review="${2:-false}"
    local error_log="${TASKS_DIR}/${task_id}_error.log"

    log TASK "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log TASK "EXECUTING: ${task_id}"
    log TASK "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Get task data
    local task_data=$(jq ".tasks[] | select(.id == \"${task_id}\")" "${REGISTRY_FILE}")

    if [[ -z "${task_data}" ]]; then
        log ERROR "Task ${task_id} not found in registry"
        return 1
    fi

    local description=$(echo "${task_data}" | jq -r '.description')
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
    log PHASE "Pre-Flight: Dependency Check"
    if ! check_dependencies "${task_id}"; then
        log ERROR "Unmet dependencies detected"
        add_blocker "${task_id}" "dependency" "Unmet dependencies"
        return 1
    fi
    log SUCCESS "Dependencies satisfied"

    update_csv_status "${task_id}" "${STATUS_IN_PROGRESS}"
    create_task_context "${task_id}"

    # Create work directory
    mkdir -p "${ARTIFACTS_DIR}/work/${task_id}"

    # -------------------------------------------------------------------------
    # PHASE 1: ARCHITECT (Claude + MCP)
    # -------------------------------------------------------------------------
    log PHASE "Phase 1: Architect (Spec & Plan via MCP)..."

    # 1a. Spec Generation
    if [ ! -f "${SPEC_DIR}/specifications/${task_id}.md" ]; then
        log INFO "Generating Specification..."
        local desc=$(jq -r ".tasks[] | select(.id == \"${task_id}\") | .description" "${REGISTRY_FILE}")

        claude run -p "Read docs/references via MCP. Create a detailed specification for: ${desc}. Save the output to ${SPEC_DIR}/specifications/${task_id}.md"

        # Verify file creation
        if [ ! -f "${SPEC_DIR}/specifications/${task_id}.md" ]; then
            log ERROR "Spec generation failed - file not created"
            update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Spec file missing"
            add_human_intervention "${task_id}" "Claude failed to create spec file" "high"
            exit 1
        fi
    fi

    # 1b. Plan Generation (Independent check)
    if [ ! -f "${SPEC_DIR}/planning/${task_id}.md" ]; then
        log INFO "Generating Implementation Plan..."

        claude run -p "Read ${SPEC_DIR}/specifications/${task_id}.md. Create a detailed implementation plan. Save the output to ${SPEC_DIR}/planning/${task_id}.md"

        # Verify file creation
        if [ ! -f "${SPEC_DIR}/planning/${task_id}.md" ]; then
            log ERROR "Plan generation failed - file not created"
            update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Plan file missing"
            add_human_intervention "${task_id}" "Claude failed to create plan file" "high"
            exit 1
        fi
    fi

    # -------------------------------------------------------------------------
    # PHASE 2: ENFORCER (Codex TDD)
    # -------------------------------------------------------------------------
    log PHASE "Phase 2: Enforcer (Codex TDD Test Generation)..."

    # Regenerate tests if spec is newer than tests
    if [ ! -f "${TASKS_DIR}/${task_id}_generated.test.ts" ] || \
       [ "${SPEC_DIR}/specifications/${task_id}.md" -nt "${TASKS_DIR}/${task_id}_generated.test.ts" ]; then
        run_codex_tests "${task_id}"
    fi

    # -------------------------------------------------------------------------
    # PHASE 3: BUILDER (Claude Code Loop)
    # -------------------------------------------------------------------------
    log PHASE "Phase 3: Builder (Implementation Loop)..."

    local retries=0
    local success=false

    while [ $retries -lt $MAX_RETRIES ]; do
        local plan_content=$(cat "${SPEC_DIR}/planning/${task_id}.md")
        local prompt="Task: ${task_id}

Follow this Implementation Plan STRICTLY:
${plan_content}"

        # Inject Codex tests if available
        if [ -f "${TASKS_DIR}/${task_id}_generated.test.ts" ]; then
            prompt="${prompt}

REQUIRED TESTS (Generated by Codex - These MUST pass):
$(cat "${TASKS_DIR}/${task_id}_generated.test.ts")"
        fi

        # Inject error feedback if previous attempt failed
        if [ -f "$error_log" ]; then
            local err_msg=$(cat "$error_log")
            prompt="${prompt}

🚨 PREVIOUS VALIDATION FAILED. FIX THESE ERRORS:
${err_msg}"

            local retry_count=$(increment_retry_count "${task_id}")
            log WARN "Retrying with error context (${retry_count}/${MAX_RETRIES})..."

            # Exponential backoff
            local wait_time=$((RETRY_DELAY_SECONDS * (retries + 1)))
            log INFO "Waiting ${wait_time}s before retry..."
            sleep $wait_time
        fi

        # Execute Claude
        claude run -p "$prompt"

        # ---------------------------------------------------------------------
        # PHASE 4: VALIDATION (Deterministic Gates)
        # ---------------------------------------------------------------------
        log PHASE "Phase 4: Validation (Deterministic Gates)..."
        update_csv_status "${task_id}" "${STATUS_VALIDATING}"

        if run_yaml_validation "${task_id}" > "$error_log" 2>&1; then
            cat "$error_log" >> "$VALIDATION_LOG"

            # -----------------------------------------------------------------
            # PHASE 5: AUDITOR (Gemini)
            # -----------------------------------------------------------------
            log PHASE "Phase 5: Auditor (Gemini A2A Review)..."

            if run_gemini_audit "${task_id}"; then
                success=true
                break
            else
                log ERROR "Gemini audit failed"
                cat "${TASKS_DIR}/${task_id}_audit.log" >> "$error_log"
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
            # Trigger qualitative review
            local review_file=$(trigger_qualitative_review "${task_id}")
            log INFO "Review request created: ${review_file}"
            log HUMAN "Manual review required. Complete with:"
            log HUMAN "  ./orchestrator.sh review ${task_id} approved|changes_requested|rejected [notes]"
        else
            update_csv_status "${task_id}" "${STATUS_COMPLETED}"
            log SUCCESS "Task ${task_id} completed!"
        fi
    else
        add_human_intervention "${task_id}" "Validation loop failed after ${MAX_RETRIES} retries" "high"
        update_csv_status "${task_id}" "${STATUS_NEEDS_HUMAN}" "Validation failed"
        log ERROR "Task ${task_id} failed after ${MAX_RETRIES} attempts"
        exit 1
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
    done < <(jq -r '.tasks[].id' "${REGISTRY_FILE}")

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
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "                      📊 SPRINT 0 EXECUTION STATUS"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local total=$(jq '.tasks | length' "${REGISTRY_FILE}")
    local completed=0
    local failed=0
    local blocked=0
    local in_review=0
    local in_progress=0
    local needs_human=0
    local planned=0

    while IFS= read -r task_id; do
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
    done < <(jq -r '.tasks[].id' "${REGISTRY_FILE}")

    local progress=$((completed * 100 / total))

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
    if [[ ${needs_human} -gt 0 ]] || [[ ${blocked} -gt 0 ]]; then
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

    # Next ready tasks
    echo "  Next Ready Tasks"
    echo "  ────────────────"
    local count=0
    while IFS= read -r task_id; do
        if [[ ${count} -ge 5 ]]; then
            break
        fi

        local status=$(get_task_status "${task_id}")
        if [[ "${status}" != "${STATUS_PLANNED}" ]]; then
            continue
        fi

        if check_dependencies "${task_id}" 2>/dev/null; then
            local desc=$(jq -r ".tasks[] | select(.id == \"${task_id}\") | .description" "${REGISTRY_FILE}")
            printf "  ${GREEN}→${NC} %s: %s\n" "${task_id}" "${desc:0:50}"
            ((count++))
        fi
    done < <(jq -r '.tasks[].id' "${REGISTRY_FILE}")

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
        local desc=$(jq -r ".tasks[] | select(.id == \"${task_id}\") | .description" "${REGISTRY_FILE}")

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
    done < <(jq -r '.tasks[].id' "${REGISTRY_FILE}")
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
            jq -r '.tasks[].id' "${REGISTRY_FILE}" | while read -r task_id; do
                local status=$(get_task_status "${task_id}")
                if [[ "${status}" == "${STATUS_PLANNED}" ]] && check_dependencies "${task_id}" 2>/dev/null; then
                    echo "${task_id}"
                fi
            done
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

CONTEXT
  context <task-id>         Generate and display task context

SETUP
  setup                     Initialize project structure

EXAMPLES
  ./orchestrator.sh run                           # Execute all ready tasks
  ./orchestrator.sh run EXC-INIT-001              # Execute specific task
  ./orchestrator.sh run-quick ENV-001-AI          # Skip qualitative review
  ./orchestrator.sh validate AI-SETUP-001         # Test validation only
  ./orchestrator.sh review ENV-001-AI approved    # Approve review
  ./orchestrator.sh add-blocker ENV-004-AI external "Supabase API down"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HELP
            ;;
    esac
}

# Run if executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi