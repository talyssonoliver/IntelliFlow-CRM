# Setup Monorepo Command

Initialize or enhance the IntelliFlow CRM Turborepo monorepo structure.

## Usage
```
/setup-monorepo [--dry-run] [--preset=intelliflow-crm]
```

## Arguments
- `--dry-run`: Show what would be created without making changes
- `--preset`: Use predefined configuration (default: intelliflow-crm)

## Actions

1. **Validate existing structure**
   - Check for turbo.json
   - Verify pnpm-workspace.yaml
   - Validate package.json configurations

2. **Create missing directories**
   ```
   apps/
   ├── web/           # Next.js frontend
   ├── api/           # tRPC API server
   └── ai-worker/     # LangChain/CrewAI worker

   packages/
   ├── db/            # Prisma schema and client
   ├── domain/        # Domain models (DDD)
   ├── application/   # Use cases and ports
   ├── adapters/      # Infrastructure adapters
   ├── validators/    # Zod schemas
   ├── api-client/    # tRPC client
   └── ui/            # Shared UI components
   ```

3. **Initialize workspaces**
   - Create package.json for each workspace
   - Set up TypeScript configurations
   - Configure workspace dependencies

4. **Validate build**
   - Run `pnpm install`
   - Execute `turbo run build --dry-run`

## Output
- Summary of actions taken
- List of created/modified files
- Next steps for development

## Example
```bash
# Full setup
/setup-monorepo --preset=intelliflow-crm

# Preview changes
/setup-monorepo --dry-run
```
