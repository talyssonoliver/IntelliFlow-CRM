#!/usr/bin/env bash
# poll-remote.sh — Phase 3 helper for remote (CI) tier-C validation.
#
# Sourced by .claude/skills/exec/references/phase3-matop-validation.md when
# AGENT_CONCURRENT_COUNT > 3. Polls the project-tracker's
# /api/agent-validation/<TASK_ID> endpoint until all requested gates have
# reported, or the 30-minute hard timeout elapses.
#
# Polling discipline:
#   - 30s default interval
#   - exponential backoff to 60s after 5 minutes
#   - hard timeout at 30 minutes total
#   - on timeout: emit a logged WARN and signal the caller to fall back to
#     local validation (return 2 from poll_remote_validation)
#
# Returns:
#   0 — all requested gates reported and all passed (exit_code == 0)
#   1 — at least one reported gate failed (exit_code != 0)
#   2 — hard timeout, no full set of results before deadline
#
# Usage:
#   source .claude/skills/exec/references/lib/poll-remote.sh
#   poll_remote_validation "$TASK_ID" \
#       --gates typecheck,test,lint,build \
#       --interval 30 --max-interval 60 --timeout 1800 \
#       --endpoint http://localhost:3002/api/agent-validation
#
# Environment overrides:
#   AGENT_VALIDATION_ENDPOINT   default http://localhost:3002/api/agent-validation
#   AGENT_VALIDATION_TIMEOUT    default 1800
#   AGENT_VALIDATION_INTERVAL   default 30

set -u

poll_remote_validation() {
  local task_id="$1"; shift
  local gates="typecheck,test,lint,build"
  local interval="${AGENT_VALIDATION_INTERVAL:-30}"
  local max_interval=60
  local timeout="${AGENT_VALIDATION_TIMEOUT:-1800}"
  local endpoint="${AGENT_VALIDATION_ENDPOINT:-http://localhost:3002/api/agent-validation}"

  while [ $# -gt 0 ]; do
    case "$1" in
      --gates) gates="$2"; shift 2 ;;
      --interval) interval="$2"; shift 2 ;;
      --max-interval) max_interval="$2"; shift 2 ;;
      --timeout) timeout="$2"; shift 2 ;;
      --endpoint) endpoint="$2"; shift 2 ;;
      *) echo "poll_remote_validation: unknown arg $1" >&2; return 2 ;;
    esac
  done

  local started=$(date +%s)
  local cur_interval="$interval"
  local elapsed
  local expected_count
  expected_count=$(echo "$gates" | tr ',' '\n' | wc -l)

  while true; do
    elapsed=$(( $(date +%s) - started ))

    if [ "$elapsed" -ge "$timeout" ]; then
      echo "WARN: remote validation timed out after ${elapsed}s for ${task_id}; falling back to local validation" >&2
      return 2
    fi

    local response
    response=$(curl -sS -m 10 "${endpoint}/${task_id}" 2>/dev/null) || response=""
    local got
    got=$(printf '%s' "$response" | python -c "import sys,json
try:
    d = json.load(sys.stdin)
    g = d.get('gates') or []
    print(len(g))
    for x in g:
        print(x.get('name'), x.get('exit_code'))
except Exception:
    print(0)
" 2>/dev/null || echo "0")
    local count
    count=$(printf '%s' "$got" | head -1 | tr -d '[:space:]')
    count="${count:-0}"

    if [ "$count" -ge "$expected_count" ]; then
      # All expected gates reported; return 0 only if all exit_codes == 0
      if printf '%s' "$got" | tail -n +2 | awk '{ if ($2 != 0) found=1 } END { exit found ? 1 : 0 }'; then
        echo "OK: remote validation passed for ${task_id} after ${elapsed}s" >&2
        return 0
      else
        echo "FAIL: remote validation reported one or more failed gates for ${task_id}" >&2
        return 1
      fi
    fi

    sleep "$cur_interval"

    # Backoff after 5 minutes of polling
    if [ "$elapsed" -ge 300 ] && [ "$cur_interval" -lt "$max_interval" ]; then
      cur_interval="$max_interval"
    fi
  done
}
