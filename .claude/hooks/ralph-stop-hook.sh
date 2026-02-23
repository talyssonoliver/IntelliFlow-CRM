#!/bin/bash

# Ralph Wiggum Stop Hook — Strict Session Scoping
# Prevents session exit when a ralph-loop is active for THIS session ONLY.
# Feeds the SAME PROMPT back to continue the loop.
#
# Session matching is STRICT (Pass 1 only):
# - Only matches state files where session_id == current session
# - No fallback adoption — other sessions are NEVER trapped
# - Compaction within a session keeps the same session_id, so loops survive compaction

set -euo pipefail

# Read hook input from stdin
HOOK_INPUT=$(cat)

# Determine current session ID from transcript path
CURRENT_TRANSCRIPT=$(echo "$HOOK_INPUT" | jq -r '.transcript_path // empty' 2>/dev/null || echo "")
CURRENT_SESSION=""
if [[ -n "$CURRENT_TRANSCRIPT" ]]; then
  CURRENT_SESSION=$(basename "$CURRENT_TRANSCRIPT" .jsonl)
fi

if [[ -z "$CURRENT_SESSION" ]]; then
  # Can't determine current session — allow exit
  exit 0
fi

# Scan state files for EXACT session_id match (STRICT — no fallback)
RALPH_LOOPS_DIR=".claude/ralph-loops"
RALPH_STATE_FILE=""

if [[ -d "$RALPH_LOOPS_DIR" ]]; then
  for f in "$RALPH_LOOPS_DIR"/*.local.md; do
    [[ -f "$f" ]] || continue
    FILE_FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$f")
    FILE_SESSION=$(echo "$FILE_FRONTMATTER" | { grep '^session_id:' || true; } | sed 's/session_id: *//' | sed 's/^"\(.*\)"$/\1/')
    FILE_ACTIVE=$(echo "$FILE_FRONTMATTER" | { grep '^active:' || true; } | sed 's/active: *//')

    # STRICT match: exact session_id AND active
    if [[ "$FILE_ACTIVE" == "true" ]] && [[ "$FILE_SESSION" == "$CURRENT_SESSION" ]]; then
      RALPH_STATE_FILE="$f"
      break
    fi
  done
fi

# No matching loop for this session — allow exit
if [[ -z "$RALPH_STATE_FILE" ]]; then
  exit 0
fi

# Parse state file frontmatter
FRONTMATTER=$(sed -n '/^---$/,/^---$/{ /^---$/d; p; }' "$RALPH_STATE_FILE")
ITERATION=$(echo "$FRONTMATTER" | { grep '^iteration:' || true; } | sed 's/iteration: *//')
MAX_ITERATIONS=$(echo "$FRONTMATTER" | { grep '^max_iterations:' || true; } | sed 's/max_iterations: *//')
COMPLETION_PROMISE=$(echo "$FRONTMATTER" | { grep '^completion_promise:' || true; } | sed 's/completion_promise: *//' | sed 's/^"\(.*\)"$/\1/')

# Validate numeric fields
if [[ ! "$ITERATION" =~ ^[0-9]+$ ]] || [[ ! "$MAX_ITERATIONS" =~ ^[0-9]+$ ]]; then
  echo "⚠️  Ralph loop: State file has invalid iteration/max_iterations. Stopping." >&2
  exit 0
fi

# Check max iterations
if [[ $MAX_ITERATIONS -gt 0 ]] && [[ $ITERATION -ge $MAX_ITERATIONS ]]; then
  echo "🛑 Ralph loop: Max iterations ($MAX_ITERATIONS) reached." >&2
  rm "$RALPH_STATE_FILE"
  exit 0
fi

# Get last assistant message — prefer hook input field, fallback to transcript
LAST_OUTPUT=$(echo "$HOOK_INPUT" | jq -r '.last_assistant_message // empty' 2>/dev/null || echo "")

if [[ -z "$LAST_OUTPUT" ]]; then
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
    echo "✅ Ralph loop: Detected <promise>$COMPLETION_PROMISE</promise>" >&2
    rm "$RALPH_STATE_FILE"
    exit 0
  fi
fi

# No completion promise matched — continue the loop
NEXT_ITERATION=$((ITERATION + 1))

# Extract prompt (everything after the closing ---)
PROMPT_TEXT=$(awk '/^---$/{i++; next} i>=2' "$RALPH_STATE_FILE")

if [[ -z "$PROMPT_TEXT" ]]; then
  echo "⚠️  Ralph loop: No prompt text in state file. Stopping." >&2
  exit 0
fi

# Update iteration counter
TEMP_FILE="${RALPH_STATE_FILE}.tmp.$$"
sed "s/^iteration: .*/iteration: $NEXT_ITERATION/" "$RALPH_STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$RALPH_STATE_FILE"

# Build system message
if [[ "$COMPLETION_PROMISE" != "null" ]] && [[ -n "$COMPLETION_PROMISE" ]]; then
  SYSTEM_MSG="🔄 Ralph iteration $NEXT_ITERATION | To stop: output <promise>$COMPLETION_PROMISE</promise> (ONLY when TRUE)"
else
  SYSTEM_MSG="🔄 Ralph iteration $NEXT_ITERATION | No completion promise set"
fi

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
