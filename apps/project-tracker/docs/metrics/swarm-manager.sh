#!/usr/bin/env bash
# =============================================================================
# IntelliFlow CRM - Swarm Manager v1.0
# =============================================================================
set -euo pipefail

MAX_CONCURRENT=4
POLL_INTERVAL=30
LOCK_DIR=".locks"
LOG_DIR="logs/swarm"
HEALTH_FILE="$LOG_DIR/swarm-health.json"

mkdir -p "$LOCK_DIR" "$LOG_DIR"
trap 'exit 0' SIGINT SIGTERM

echo "🤖 Swarm Manager Active (Max Agents: $MAX_CONCURRENT)"

while true; do
    # Cleanup old locks
    find "$LOCK_DIR" -name "*.lock" -mmin +60 -delete
    for lock in "$LOCK_DIR"/*.lock; do
        [ -f "$lock" ] || continue
        if read -r pid < "$lock"; then
            if ! kill -0 "$pid" 2>/dev/null; then rm -f "$lock"; fi
        fi
    done

    # Health Check
    CURRENT=$(ls -1 "$LOCK_DIR"/*.lock 2>/dev/null | wc -l)
    echo "{\"active\": $CURRENT, \"timestamp\": \"$(date -Iseconds)\"}" > "$HEALTH_FILE"
    
    if [ "$CURRENT" -lt "$MAX_CONCURRENT" ]; then
        # Fetch Candidates
        mapfile -t TASKS < <(./orchestrator.sh list-ready || true)
        
        for TASK in "${TASKS[@]}"; do
            [ -z "$TASK" ] && continue
            
            # Atomic Lock with flock
            (
                exec 200>"$LOCK_DIR/$TASK.lock"
                flock -n 200 || exit 0
                echo $$ >&200
                
                echo "🚀 Spawning Agent: $TASK"
                ./orchestrator-final.sh run "$TASK" > "$LOG_DIR/$TASK.log" 2>&1
                
                rm -f "$LOCK_DIR/$TASK.lock"
            ) & 
            
            CURRENT=$((CURRENT+1))
            [ "$CURRENT" -ge "$MAX_CONCURRENT" ] && break
            sleep 2
        done
    fi
    sleep "$POLL_INTERVAL"
done