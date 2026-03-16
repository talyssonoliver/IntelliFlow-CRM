#!/bin/bash

# Ralph Wiggum Stop Hook — Session Scoping (strict session_id match + context check)
# Prevents session exit when a ralph-loop is active for THIS session.
# Feeds the SAME PROMPT back to continue the loop.
#
# Session matching (three checks):
# - Pass 0 (cleanup): expire active loops older than 24h
# - Pass 1 (strict): matches state files where session_id == current session
# - Pass 1.5 (context relevance): verify last assistant message mentions the
#   loop's task ID. If not, the session was repurposed after context compaction
#   and the loop is deactivated. Fixes the DOC-010/knip-remediation incident
#   where a compacted session inherited an unrelated Ralph loop.
#
# NOTE: Pass 2 (orphan adoption) was REMOVED after the PG-042 incident where
# an unrelated session adopted an active Ralph loop from a different terminal.
# PID-based ownership doesn't work on Windows Git Bash ($PPID=1, kill -0 broken).
# If a session compacts (new session_id), the user must re-invoke the Ralph loop.
#
# Debug: set RALPH_DEBUG=1 to write diagnostics to .claude/ralph-loops/debug.log

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

RALPH_LOOPS_DIR=".claude/ralph-loops"
DEBUG_LOG="$RALPH_LOOPS_DIR/debug.log"

debug() {
  if [[ "${RALPH_DEBUG:-0}" == "1" ]] && [[ -d "$RALPH_LOOPS_DIR" ]]; then
    echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$DEBUG_LOG"
  fi
}

# Determine current session ID — use session_id field directly (preferred),
# fallback to extracting from transcript_path
CURRENT_SESSION=$(echo "$HOOK_INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

if [[ -z "$CURRENT_SESSION" ]]; then
  CURRENT_TRANSCRIPT=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
  if [[ -n "$CURRENT_TRANSCRIPT" ]]; then
    CURRENT_SESSION=$(basename "$CURRENT_TRANSCRIPT" .jsonl)
  fi
fi

if [[ -z "$CURRENT_SESSION" ]]; then
  debug "SKIP: Cannot determine session ID from hook input"
  exit 0
fi

debug "Session ID: $CURRENT_SESSION"

# Check if stop_hook_active — prevent infinite re-entry
STOP_HOOK_ACTIVE=$(echo "$HOOK_INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo "false")
debug "stop_hook_active: $STOP_HOOK_ACTIVE"

# ─── Pass 0: Expire stale loops (older than 24h) ─────────────────────
if [[ -d "$RALPH_LOOPS_DIR" ]]; then
  NOW_EPOCH=$(date +%s)
  for f in "$RALPH_LOOPS_DIR"/*.local.md; do
    [[ -f "$f" ]] || continue
    FILE_FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$f")
    FILE_ACTIVE=$(echo "$FILE_FRONTMATTER" | { grep '^active:' || true; } | sed 's/active: *//')
    [[ "$FILE_ACTIVE" == "true" ]] || continue

    # Get file modification time
    FILE_MOD_EPOCH=$(stat -c %Y "$f" 2>/dev/null || stat -f %m "$f" 2>/dev/null || echo "0")
    if [[ "$FILE_MOD_EPOCH" =~ ^[0-9]+$ ]]; then
      AGE_SECONDS=$((NOW_EPOCH - FILE_MOD_EPOCH))
      # 86400 = 24 hours
      if [[ $AGE_SECONDS -gt 86400 ]]; then
        debug "EXPIRE: $(basename "$f") — ${AGE_SECONDS}s old (>24h)"
        # Deactivate by setting active: false
        TEMP_EXPIRE="${f}.expire.$$"
        sed 's/^active: true/active: false/' "$f" > "$TEMP_EXPIRE"
        mv "$TEMP_EXPIRE" "$f"
      fi
    fi
  done
fi

# ─── Pass 1: Scan for EXACT session_id match ─────────────────────────
RALPH_STATE_FILE=""

if [[ -d "$RALPH_LOOPS_DIR" ]]; then
  for f in "$RALPH_LOOPS_DIR"/*.local.md; do
    [[ -f "$f" ]] || continue
    FILE_FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$f")
    FILE_SESSION=$(echo "$FILE_FRONTMATTER" | { grep '^session_id:' || true; } | sed 's/session_id: *//' | sed 's/^"\(.*\)"$/\1/')
    FILE_ACTIVE=$(echo "$FILE_FRONTMATTER" | { grep '^active:' || true; } | sed 's/active: *//')

    if [[ "$FILE_ACTIVE" != "true" ]]; then
      continue
    fi

    # STRICT match: exact session_id AND active
    if [[ "$FILE_SESSION" == "$CURRENT_SESSION" ]]; then
      RALPH_STATE_FILE="$f"
      debug "STRICT MATCH: $(basename "$f")"
      break
    fi

    # Active loop with non-matching session_id — belongs to another session, ignore
    debug "SKIP: $(basename "$f") — session_id mismatch (belongs to another session)"
  done
fi

# No matching loop for this session — allow exit
if [[ -z "$RALPH_STATE_FILE" ]]; then
  debug "NO MATCH: no active loop for session $CURRENT_SESSION"
  exit 0
fi

# ─── Parse state file and check loop conditions ──────────────────────
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$RALPH_STATE_FILE")
ITERATION=$(echo "$FRONTMATTER" | { grep '^iteration:' || true; } | sed 's/iteration: *//')
MAX_ITERATIONS=$(echo "$FRONTMATTER" | { grep '^max_iterations:' || true; } | sed 's/max_iterations: *//')
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | { grep '^completion_promise:' || true; } | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/')

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]] || [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Ralph loop: State file has invalid iteration/max_iterations. Stopping." >&2
  debug "INVALID: iteration=$ITERATION max=$MAX_ITERATIONS"
  exit 0
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Ralph loop: Max iterations ($MAX_ITERATIONS) reached for $(basename "$RALPH_STATE_FILE")." >&2
  debug "MAX REACHED: $ITERATION >= $MAX_ITERATIONS"
  # Deactivate rather than delete (preserves history)
  TEMP_DEACT="${RALPH_STATE_FILE}.deact.$$"
  sed 's/^active: true/active: false/' "$RALPH_STATE_FILE" > "$TEMP_DEACT"
  mv "$TEMP_DEACT" "$RALPH_STATE_FILE"
  exit 0
fi

# ─── Check completion promise ─────────────────────────────────────────
# Get last assistant message directly from hook input (Stop-specific field)
LAST_OUTPUT=$(echo "$HOOK_INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || echo "")

if [[ -z "$LAST_OUTPUT" ]]; then
  # Fallback to transcript (rarely needed — last_assistant_message should be present)
  CURRENT_TRANSCRIPT=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
  if [[ -n "$CURRENT_TRANSCRIPT" ]] && [[ -f "$CURRENT_TRANSCRIPT" ]]; then
    LAST_OUTPUT=$(grep '"role":"assistant"' "$CURRENT_TRANSCRIPT" | tail -20 | tac | \
      while IFS= read -r line; do
        TEXT=$(echo "$line" | jq -r '
          .message.content |
          map(select(.type == "text")) |
          map(.text) |
          join("\n")
        ' 2>/dev/null || true)
        if [[ -n "$TEXT" ]]; then
          printf '%s' "$TEXT"
          break
        fi
      done 2>/dev/null || true)
  fi
fi

# Check for completion promise (if set and we have text to check)
if [[ -n "$LAST_OUTPUT" ]] && [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  PROMISE_TEXT=$(echo "$LAST_OUTPUT" | perl -0777 -pe 's/.*?<promise>(.*?)<\/promise>.*/$1/s; s/^\s+|\s+$//g; s/\s+/ /g' 2>/dev/null || echo "")

  if [[ -n "$PROMISE_TEXT" ]] && [[ "$PROMISE_TEXT" = "$COMPLETION_PROMISE" ]]; then
    echo "✅ Ralph loop: Detected <promise>$COMPLETION_PROMISE</promise> in $(basename "$RALPH_STATE_FILE")" >&2
    debug "PROMISE MET: $COMPLETION_PROMISE"
    # Deactivate rather than delete
    TEMP_DONE="${RALPH_STATE_FILE}.done.$$"
    sed 's/^active: true/active: false/' "$RALPH_STATE_FILE" > "$TEMP_DONE"
    mv "$TEMP_DONE" "$RALPH_STATE_FILE"
    exit 0
  fi
fi

# ─── Context relevance check (prevents compacted session hijack) ─────
# When a session compacts (context overflow → continuation), the new session
# reuses the same transcript UUID. The session_id match above succeeds, but
# the session may now be doing completely different work. Guard against this
# by extracting the task ID from the loop prompt and checking if recent
# session content actually references it. If not → session was repurposed.
#
# Extract prompt text early (needed for task ID extraction)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$RALPH_STATE_FILE")

LOOP_TASK_ID=$(echo "$PROMPT_TEXT" | grep -oE '[A-Z]+-[0-9]+' | head -1 || true)

if [[ -n "$LOOP_TASK_ID" ]] && [[ -n "$LAST_OUTPUT" ]]; then
  CONTEXT_RELEVANT=false

  # Check 1: last assistant message (fast path)
  if echo "$LAST_OUTPUT" | grep -qiF "$LOOP_TASK_ID" 2>/dev/null; then
    CONTEXT_RELEVANT=true
  fi

  # Check 2: if not in last message, check recent transcript entries (slow path)
  # The last message might be a Skill tool result or compressed text that doesn't
  # contain the task ID literally (e.g., full-pipeline invoking /spec-session)
  if [[ "$CONTEXT_RELEVANT" == "false" ]]; then
    CURRENT_TRANSCRIPT=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
    if [[ -n "$CURRENT_TRANSCRIPT" ]] && [[ -f "$CURRENT_TRANSCRIPT" ]]; then
      # Check last 100 lines of transcript for the task ID
      if tail -100 "$CURRENT_TRANSCRIPT" 2>/dev/null | grep -qiF "$LOOP_TASK_ID" 2>/dev/null; then
        CONTEXT_RELEVANT=true
        debug "CONTEXT OK (transcript fallback): $LOOP_TASK_ID found in recent transcript"
      fi
    fi
  fi

  if [[ "$CONTEXT_RELEVANT" == "false" ]]; then
    echo "⚠️  Ralph loop: Session context mismatch — recent messages don't mention $LOOP_TASK_ID. Deactivating loop." >&2
    debug "CONTEXT MISMATCH: neither last message nor recent transcript mentions $LOOP_TASK_ID"
    # Deactivate the orphaned loop
    TEMP_CTX="${RALPH_STATE_FILE}.ctx.$$"
    sed 's/^active: true/active: false/' "$RALPH_STATE_FILE" > "$TEMP_CTX"
    mv "$TEMP_CTX" "$RALPH_STATE_FILE"
    exit 0
  fi
fi

# ─── Continue the loop ────────────────────────────────────────────────
NEXT_ITERATION=$((ITERATION + 1))

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "⚠️  Ralph loop: No prompt text in state file. Stopping." >&2
  debug "NO PROMPT TEXT in $(basename "$RALPH_STATE_FILE")"
  exit 0
fi

# Update iteration counter and touch mtime
TEMP_FILE="${RALPH_STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$RALPH_STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$RALPH_STATE_FILE"

# Build system message
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  SYSTEM_MSG="🔄 Ralph iteration $NEXT_ITERATION / $(basename "$RALPH_STATE_FILE" .local.md) | To stop: output <promise>$COMPLETION_PROMISE</promise> (ONLY when TRUE)"
else
  SYSTEM_MSG="🔄 Ralph iteration $NEXT_ITERATION / $(basename "$RALPH_STATE_FILE" .local.md) | No completion promise set"
fi

debug "CONTINUE: iteration=$NEXT_ITERATION file=$(basename "$RALPH_STATE_FILE")"

# Block the stop and feed prompt back
jq -n \
  --arg prompt "$PROMPT_TEXT" \
  --arg msg "$SYSTEM_MSG" \
  '{
    "decision": "block",
    "reason": $prompt,
    "systemMessage": $msg
  }'

exit 0
