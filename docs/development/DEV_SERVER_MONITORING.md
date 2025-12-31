# Development Server Monitoring Guide

This guide explains how to monitor running dev servers without killing them.

## Quick Commands

### Check What's Running

```bash
# Check all dev server ports
pnpm run dev:status

# Or manually
netstat -ano | findstr ":3000 :3001 :4000"
```

### Monitor Logs Without Killing Servers

#### Option 1: Run Typecheck (Fastest)
```bash
# Check for type errors without starting server
pnpm --filter @intelliflow/web typecheck
pnpm --filter @intelliflow/api typecheck
pnpm run typecheck:all  # Check all packages
```

#### Option 2: Use Monitor Script
```bash
# Run comprehensive health check
pnpm run dev:check
```

#### Option 3: Start Fresh Dev Server
```bash
# Kill existing server first
taskkill //F //PID <PID>  # Get PID from dev:status

# Then start fresh
pnpm run dev:web
```

#### Option 4: Use Separate Terminal
- Keep one terminal running the dev server
- Use another terminal for checks/commands
- View dev server output in real-time in its terminal

## Understanding the Output

### Port Mapping
- **3000** - Next.js web app (primary)
- **3001** - Next.js web app (fallback if 3000 is busy)
- **3002** - Project tracker dashboard
- **4000** - tRPC API server
- **5432** - PostgreSQL database

### Finding Process IDs

```powershell
# Windows PowerShell (recommended)
Get-NetTCPConnection -LocalPort 3000 | Select-Object OwningProcess

# Or using netstat
netstat -ano | findstr :3000
# Output: TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    12345
#                                                          ^^^^^ PID
```

## Monitoring Strategies

### 1. **Pre-Flight Check** (Before Starting Dev)

```bash
# Check for type errors first
pnpm run typecheck:all

# Then start dev server
pnpm run dev:web
```

### 2. **Continuous Monitoring** (Multiple Terminals)

Terminal 1:
```bash
# Run dev server and watch output
pnpm run dev:web
```

Terminal 2:
```bash
# Run checks periodically
pnpm run typecheck:all
pnpm run lint
```

### 3. **Background Mode** (For Claude Code)

When running servers in background:

```bash
# Start in background
pnpm run dev:web &

# Monitor output file
tail -f /tmp/dev-server.log

# Check status
pnpm run dev:status
```

## Common Scenarios

### Scenario 1: "I see errors in browser but don't know why"

```bash
# Don't kill the server! Check these first:
pnpm --filter @intelliflow/web typecheck  # Type errors
cat apps/web/.next/trace                  # Build errors (if exists)
```

### Scenario 2: "Dev server won't start - port in use"

```bash
# Find what's using the port
pnpm run dev:status

# Kill the specific process
taskkill //F //PID <PID>

# Or kill all node processes (nuclear option)
taskkill //F //IM node.exe
```

### Scenario 3: "I made changes but server isn't updating"

```bash
# Server is running - just check:
1. Is file saved? (check editor)
2. Any build errors? (check terminal running dev server)
3. Browser cache? (hard refresh: Ctrl+Shift+R)

# If still stuck, restart:
# In the dev server terminal: Ctrl+C
# Then: pnpm run dev:web
```

## Best Practices

### ✅ DO:
- Keep dev server running in a visible terminal
- Use `typecheck` to check for errors without restarting
- Use `dev:status` to see what's running before starting new servers
- Use multiple terminals for parallel work

### ❌ DON'T:
- Start multiple dev servers on the same port
- Kill processes without checking what they are
- Run `taskkill //F //IM node.exe` unless you know what you're doing (kills ALL Node processes)

## Troubleshooting

### "Can't read dev server logs"

**Problem**: Dev server running but can't see output

**Solutions**:
1. Find the terminal where it's running (check taskbar)
2. Run `typecheck` instead for quick error checking
3. Restart dev server in a visible terminal
4. Use VS Code integrated terminal for better visibility

### "Locks preventing server start"

**Problem**: `.next/dev/lock` file exists

**Solution**:
```bash
# Remove lock file
rm apps/web/.next/dev/lock

# Or kill the process holding it
pnpm run dev:status
taskkill //F //PID <PID>
```

### "Type errors in dev but build succeeds"

**Problem**: `dev` shows errors but `build` works

**Cause**: Development uses stricter type checking

**Solution**:
```bash
# This is expected! Fix the type errors:
pnpm --filter @intelliflow/web typecheck

# Then dev will work
```

## Integration with CI/CD

The same commands work in CI:

```yaml
# .github/workflows/ci.yml
- name: Check Types
  run: pnpm run typecheck:all

- name: Run Tests
  run: pnpm run test

- name: Build
  run: pnpm run build
```

## Summary

**Key Takeaway**: You almost never need to kill a dev server to check for errors. Use `typecheck`, `lint`, and `dev:status` instead.

```bash
# Quick reference:
pnpm run dev:status      # What's running?
pnpm run typecheck:all   # Any type errors?
pnpm run dev:check       # Full health check
```
