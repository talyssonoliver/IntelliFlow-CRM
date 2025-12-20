#!/usr/bin/env bash
# =============================================================================
# IntelliFlow CRM - Swarm Manager v2.0
# =============================================================================
# FEATURES:
#   [x] Concurrent agent execution with flock-based locking
#   [x] run --stream: Line-buffered streaming to console
#   [x] status: Shows active locks, PIDs, heartbeat age, log paths
#   [x] watch <task_id>|swarm: tail -F for task or aggregate log
#   [x] stop <task_id>: TERM → grace → KILL, releases lock
#   [x] Watchdog: Auto-kills stuck processes (no heartbeat for threshold)
#   [x] Claude auth error throttling
# =============================================================================
set -euo pipefail

# Force Claude CLI to use OAuth token (Max plan) instead of API key
# This ensures we use the user's subscription rather than API credits
unset ANTHROPIC_API_KEY 2>/dev/null || true

# Use absolute paths based on script location
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find monorepo root by looking for turbo.json
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

readonly MONOREPO_ROOT="$(find_monorepo_root)"

# Configuration (override via environment)
MAX_CONCURRENT="${MAX_CONCURRENT:-4}"
POLL_INTERVAL="${POLL_INTERVAL:-30}"
STUCK_AFTER_SECONDS="${STUCK_AFTER_SECONDS:-900}"   # 15 minutes default
KILL_GRACE_SECONDS="${KILL_GRACE_SECONDS:-30}"
STREAM_TO_CONSOLE="${STREAM_TO_CONSOLE:-1}"         # Stream enabled by default

# Directories - IFC-160 artifact conventions
# Ephemeral artifacts go to /artifacts/ (gitignored)
LOCK_DIR="${MONOREPO_ROOT}/artifacts/misc/.locks"
LOG_DIR="${MONOREPO_ROOT}/artifacts/logs/swarm"
STATUS_DIR="${MONOREPO_ROOT}/artifacts/misc/.status"
# Sprint tracking metrics stay in project-tracker (committed)
METRICS_DIR="${MONOREPO_ROOT}/apps/project-tracker/docs/metrics"
HEALTH_FILE="${LOG_DIR}/swarm-health.json"
AGGREGATE_LOG="${LOG_DIR}/swarm.log"

# Error throttling
ERROR_LOG_CHECK_MINUTES="${ERROR_LOG_CHECK_MINUTES:-10}"
ERROR_LOG_THRESHOLD="${ERROR_LOG_THRESHOLD:-2}"

# Colors
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly CYAN='\033[0;36m'
readonly NC='\033[0m'

# Change to script directory
cd "${SCRIPT_DIR}"

# =============================================================================
# INITIALIZATION
# =============================================================================

init_dirs() {
    mkdir -p "$LOCK_DIR" "$LOG_DIR" "$STATUS_DIR"
    touch "$AGGREGATE_LOG"
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

log_msg() {
    local level="$1"
    shift
    local msg="$*"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')

    case "$level" in
        INFO)    echo -e "${BLUE}[INFO]${NC} ${ts} - ${msg}" ;;
        SUCCESS) echo -e "${GREEN}[OK]${NC} ${ts} - ${msg}" ;;
        WARN)    echo -e "${YELLOW}[WARN]${NC} ${ts} - ${msg}" ;;
        ERROR)   echo -e "${RED}[ERROR]${NC} ${ts} - ${msg}" ;;
        *)       echo "[${level}] ${ts} - ${msg}" ;;
    esac
}

# Get heartbeat age in seconds for a task
get_heartbeat_age() {
    local task_id="$1"
    local heartbeat_file="${LOCK_DIR}/${task_id}.heartbeat"

    if [[ ! -f "$heartbeat_file" ]]; then
        echo "-1"  # No heartbeat file
        return
    fi

    local heartbeat_time
    heartbeat_time=$(stat -c %Y "$heartbeat_file" 2>/dev/null || stat -f %m "$heartbeat_file" 2>/dev/null) || {
        echo "-1"
        return
    }

    local now
    now=$(date +%s)
    echo $((now - heartbeat_time))
}

# Find task JSON file in sprint-0 hierarchy
find_task_json() {
    local task_id="$1"
    find "${METRICS_DIR}/sprint-0" -name "${task_id}.json" -type f 2>/dev/null | head -1
}

# Get PID from lock file
get_lock_pid() {
    local task_id="$1"
    local lock_file="${LOCK_DIR}/${task_id}.lock"

    if [[ ! -f "$lock_file" ]]; then
        echo ""
        return
    fi

    head -1 "$lock_file" 2>/dev/null || echo ""
}

# Check if PID is alive
is_pid_alive() {
    local pid="$1"
    [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

# =============================================================================
# COMMAND: STATUS
# =============================================================================

cmd_status() {
    init_dirs

    echo -e "${CYAN}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║             IntelliFlow CRM - Swarm Status                       ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    local active_count=0
    local stuck_count=0

    echo -e "${BLUE}Active Tasks:${NC}"
    echo "─────────────────────────────────────────────────────────────────────"
    printf "%-20s %-8s %-15s %-10s %s\n" "TASK_ID" "PID" "HEARTBEAT_AGE" "STATUS" "LOG_PATH"
    echo "─────────────────────────────────────────────────────────────────────"

    for lock in "$LOCK_DIR"/*.lock; do
        [[ -f "$lock" ]] || continue

        local task_id
        task_id=$(basename "$lock" .lock)
        local pid
        pid=$(get_lock_pid "$task_id")
        local heartbeat_age
        heartbeat_age=$(get_heartbeat_age "$task_id")
        local log_path="${LOG_DIR}/${task_id}.log"
        local status="running"

        if ! is_pid_alive "$pid"; then
            status="${RED}dead${NC}"
        elif [[ "$heartbeat_age" -gt "$STUCK_AFTER_SECONDS" ]]; then
            status="${YELLOW}stuck${NC}"
            ((stuck_count++))
        else
            status="${GREEN}active${NC}"
        fi

        local age_display
        if [[ "$heartbeat_age" -lt 0 ]]; then
            age_display="no heartbeat"
        elif [[ "$heartbeat_age" -lt 60 ]]; then
            age_display="${heartbeat_age}s"
        elif [[ "$heartbeat_age" -lt 3600 ]]; then
            age_display="$((heartbeat_age / 60))m"
        else
            age_display="$((heartbeat_age / 3600))h"
        fi

        printf "%-20s %-8s %-15s %-10b %s\n" "$task_id" "$pid" "$age_display" "$status" "$log_path"
        ((active_count++))
    done

    if [[ "$active_count" -eq 0 ]]; then
        echo "  (no active tasks)"
    fi

    echo ""
    echo -e "${BLUE}Summary:${NC}"
    echo "  Active: $active_count / Max: $MAX_CONCURRENT"
    echo "  Stuck (>${STUCK_AFTER_SECONDS}s): $stuck_count"
    echo "  Aggregate log: $AGGREGATE_LOG"
    echo ""

    # Show health file content
    if [[ -f "$HEALTH_FILE" ]]; then
        echo -e "${BLUE}Last Health Check:${NC}"
        cat "$HEALTH_FILE"
        echo ""
    fi
}

# =============================================================================
# COMMAND: WATCH
# =============================================================================

cmd_watch() {
    local target="${1:-swarm}"
    init_dirs

    if [[ "$target" == "swarm" ]]; then
        log_msg INFO "Watching aggregate swarm log: $AGGREGATE_LOG"
        echo "Press Ctrl+C to stop..."
        tail -F "$AGGREGATE_LOG" 2>/dev/null || {
            log_msg WARN "Log file not available yet"
            exit 1
        }
    else
        local task_log="${LOG_DIR}/${target}.log"
        if [[ ! -f "$task_log" ]]; then
            log_msg ERROR "Log file not found: $task_log"
            exit 1
        fi
        log_msg INFO "Watching task log: $task_log"
        echo "Press Ctrl+C to stop..."
        tail -F "$task_log"
    fi
}

# =============================================================================
# COMMAND: STOP
# =============================================================================

cmd_stop() {
    local task_id="$1"

    if [[ -z "$task_id" ]]; then
        log_msg ERROR "Usage: $0 stop <task_id>"
        exit 1
    fi

    local lock_file="${LOCK_DIR}/${task_id}.lock"
    local pid
    pid=$(get_lock_pid "$task_id")

    if [[ -z "$pid" ]] || [[ ! -f "$lock_file" ]]; then
        log_msg WARN "Task $task_id is not running (no lock)"
        return 0
    fi

    log_msg INFO "Stopping task $task_id (PID: $pid)..."

    # Send SIGTERM
    if is_pid_alive "$pid"; then
        kill -TERM "$pid" 2>/dev/null || true
        log_msg INFO "Sent SIGTERM to $pid, waiting ${KILL_GRACE_SECONDS}s..."

        local waited=0
        while is_pid_alive "$pid" && [[ $waited -lt $KILL_GRACE_SECONDS ]]; do
            sleep 1
            ((waited++))
        done

        # Force kill if still alive
        if is_pid_alive "$pid"; then
            log_msg WARN "Process still alive, sending SIGKILL..."
            kill -KILL "$pid" 2>/dev/null || true
            sleep 1
        fi
    fi

    # Update task JSON in sprint-0 to record operator stop
    local task_file
    task_file=$(find_task_json "$task_id")
    if [[ -n "$task_file" ]] && [[ -f "$task_file" ]]; then
        local now
        now=$(date -Iseconds)
        jq --arg phase "STOPPED_BY_OPERATOR" \
           --arg ts "$now" \
           '.current_phase = $phase | .stopped_at = $ts' \
           "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
    fi

    # Remove lock
    rm -f "$lock_file"
    log_msg SUCCESS "Task $task_id stopped and lock released"
}

# =============================================================================
# WATCHDOG: Detect and handle stuck processes
# =============================================================================

run_watchdog() {
    for lock in "$LOCK_DIR"/*.lock; do
        [[ -f "$lock" ]] || continue

        local task_id
        task_id=$(basename "$lock" .lock)
        local pid
        pid=$(get_lock_pid "$task_id")
        local heartbeat_age
        heartbeat_age=$(get_heartbeat_age "$task_id")

        # Skip if no heartbeat info
        [[ "$heartbeat_age" -lt 0 ]] && continue

        # Check if stuck
        if [[ "$heartbeat_age" -gt "$STUCK_AFTER_SECONDS" ]] && is_pid_alive "$pid"; then
            log_msg WARN "WATCHDOG: Task $task_id stuck (heartbeat age: ${heartbeat_age}s > ${STUCK_AFTER_SECONDS}s)"

            # Collect diagnostics before killing
            local forensics_dir="${MONOREPO_ROOT}/artifacts/forensics/${task_id}/$(date +%Y%m%d-%H%M%S)"
            mkdir -p "$forensics_dir"

            # Save diagnostics
            ps -p "$pid" -o pid,ppid,user,%cpu,%mem,etime,args > "$forensics_dir/ps-info.txt" 2>&1 || true
            tail -500 "${LOG_DIR}/${task_id}.log" > "$forensics_dir/last-500-lines.log" 2>&1 || true

            # Save status from sprint-0 task file
            local task_file
            task_file=$(find_task_json "$task_id")
            if [[ -n "$task_file" ]] && [[ -f "$task_file" ]]; then
                cp "$task_file" "$forensics_dir/status-snapshot.json"
            fi

            log_msg WARN "WATCHDOG: Saved diagnostics to $forensics_dir"

            # Kill the stuck process
            kill -TERM "$pid" 2>/dev/null || true
            sleep 5
            if is_pid_alive "$pid"; then
                kill -KILL "$pid" 2>/dev/null || true
            fi

            # Update task JSON in sprint-0 to Needs Human with WATCHDOG_STUCK
            if [[ -n "$task_file" ]] && [[ -f "$task_file" ]]; then
                local now
                now=$(date -Iseconds)
                jq --arg phase "WATCHDOG_STUCK" \
                   --arg ts "$now" \
                   --arg reason "Heartbeat stale for ${heartbeat_age}s" \
                   '.current_phase = $phase | .killed_at = $ts | .kill_reason = $reason | .status = "Needs Human"' \
                   "$task_file" > "${task_file}.tmp" && mv "${task_file}.tmp" "$task_file"
            fi

            # Remove lock
            rm -f "$lock"
            log_msg WARN "WATCHDOG: Task $task_id killed and lock released"
        fi

        # Check for dead processes (PID gone but lock remains)
        if ! is_pid_alive "$pid" && [[ -f "$lock" ]]; then
            log_msg WARN "Cleaning orphaned lock for $task_id (PID $pid is dead)"
            rm -f "$lock"
        fi
    done
}

# =============================================================================
# COMMAND: RUN (Main Loop)
# =============================================================================

cmd_run() {
    local stream_mode=0

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --stream)
                stream_mode=1
                shift
                ;;
            *)
                log_msg ERROR "Unknown option: $1"
                exit 1
                ;;
        esac
    done

    # Override with env var
    [[ "${STREAM_TO_CONSOLE}" == "1" ]] && stream_mode=1

    init_dirs

    trap 'log_msg INFO "Swarm Manager shutting down..."; exit 0' SIGINT SIGTERM

    log_msg INFO "Swarm Manager Active (Max: $MAX_CONCURRENT, Stream: $stream_mode, Watchdog: ${STUCK_AFTER_SECONDS}s)"

    while true; do
        # Run watchdog to detect stuck/dead processes
        run_watchdog

        # Cleanup old locks (failsafe for locks older than 2 hours without PID check)
        find "$LOCK_DIR" -name "*.lock" -mmin +120 -delete 2>/dev/null || true

        # Health check
        local current
        current=$(find "$LOCK_DIR" -name "*.lock" 2>/dev/null | wc -l)

        # Check for recent Claude errors
        local recent_claude_errors
        recent_claude_errors=$(find . -maxdepth 2 -type f \( -name '*_claude_spec_error.log' -o -name '*_claude_plan_error.log' \) -mmin -"$ERROR_LOG_CHECK_MINUTES" 2>/dev/null | wc -l)

        echo "{\"active\": $current, \"max\": $MAX_CONCURRENT, \"recent_claude_errors\": $recent_claude_errors, \"watchdog_threshold\": $STUCK_AFTER_SECONDS, \"timestamp\": \"$(date -Iseconds)\"}" > "$HEALTH_FILE"

        if [[ "$recent_claude_errors" -ge "$ERROR_LOG_THRESHOLD" ]]; then
            log_msg WARN "Pausing spawn: $recent_claude_errors Claude auth errors in last ${ERROR_LOG_CHECK_MINUTES}m (threshold: $ERROR_LOG_THRESHOLD)"
            sleep "$POLL_INTERVAL"
            continue
        fi

        # Spawn new agents if below limit
        if [[ "$current" -lt "$MAX_CONCURRENT" ]]; then
            mapfile -t TASKS < <(./orchestrator.sh list-ready 2>/dev/null || true)

            for TASK in "${TASKS[@]}"; do
                TASK="$(echo "$TASK" | tr -d '\r')"
                [[ -z "$TASK" ]] && continue

                # Simple file-based lock (Windows-compatible, no flock)
                local lock_file="$LOCK_DIR/$TASK.lock"

                # Skip if already locked
                if [[ -f "$lock_file" ]]; then
                    continue
                fi

                # Create lock file with PID
                echo $$ > "$lock_file"

                log_msg INFO "Spawning agent: $TASK"

                local task_log="${LOG_DIR}/${TASK}.log"

                # Run in subshell for cleanup
                (
                    trap 'rm -f "'"$lock_file"'"' EXIT

                    if [[ "$stream_mode" -eq 1 ]]; then
                        # Stream mode: prefix lines with task ID and write to both log and console
                        ./orchestrator.sh run "$TASK" 2>&1 | \
                            sed -u "s/^/[${TASK}] /" | \
                            tee -a "$task_log" | \
                            tee -a "$AGGREGATE_LOG"
                    else
                        # Background mode: write to log only
                        ./orchestrator.sh run "$TASK" > "$task_log" 2>&1
                        # Also append to aggregate log
                        sed "s/^/[${TASK}] /" "$task_log" >> "$AGGREGATE_LOG"
                    fi
                ) &

                sleep 0.5
                current=$(find "$LOCK_DIR" -name "*.lock" 2>/dev/null | wc -l)
                [[ "$current" -ge "$MAX_CONCURRENT" ]] && break
                sleep 1
            done
        fi

        sleep "$POLL_INTERVAL"
    done
}

# =============================================================================
# COMMAND: HELP
# =============================================================================

cmd_help() {
    cat << EOF
IntelliFlow CRM - Swarm Manager v2.0

Usage: $0 <command> [options]

Commands:
  run [--stream]     Start the swarm manager loop
                     --stream: Enable line-buffered streaming to console

  status             Show active tasks, PIDs, heartbeat age, and log paths

  watch <target>     Tail logs in real-time
                     target: task_id or "swarm" for aggregate log

  stop <task_id>     Stop a running task gracefully
                     Sends SIGTERM, waits, then SIGKILL if needed

  help               Show this help message

Environment Variables:
  MAX_CONCURRENT          Maximum concurrent agents (default: 4)
  POLL_INTERVAL           Seconds between spawn cycles (default: 30)
  STUCK_AFTER_SECONDS     Heartbeat age to consider stuck (default: 900)
  KILL_GRACE_SECONDS      Seconds to wait after SIGTERM (default: 30)
  STREAM_TO_CONSOLE       Set to 1 to enable streaming (default: 0)
  ERROR_LOG_CHECK_MINUTES Minutes to check for Claude errors (default: 10)
  ERROR_LOG_THRESHOLD     Error count to pause spawning (default: 2)

Examples:
  # Start with streaming (Terminal A)
  STREAM_TO_CONSOLE=1 MAX_CONCURRENT=2 ./swarm-manager.sh run --stream

  # Check status (Terminal B)
  ./swarm-manager.sh status

  # Watch a specific task
  ./swarm-manager.sh watch ENV-001-AI

  # Watch aggregate log
  ./swarm-manager.sh watch swarm

  # Stop a stuck task
  ./swarm-manager.sh stop ENV-001-AI

EOF
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        run)
            cmd_run "$@"
            ;;
        status)
            cmd_status
            ;;
        watch)
            cmd_watch "$@"
            ;;
        stop)
            cmd_stop "$@"
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            log_msg ERROR "Unknown command: $cmd"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
