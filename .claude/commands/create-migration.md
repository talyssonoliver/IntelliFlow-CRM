# Create Migration Command

Create and validate a Prisma database migration.

## Usage
```
/create-migration <name> [--validate-only] [--apply]
```

## Arguments
- `name`: Migration name (snake_case, descriptive)
- `--validate-only`: Validate schema without creating migration
- `--apply`: Apply migration after creation

## Migration Workflow

1. **Schema Validation**
   - Run `prisma validate`
   - Check type consistency
   - Verify relation integrity

2. **Diff Analysis**
   - Compare schema with database
   - Identify breaking changes
   - Generate migration preview

3. **Migration Creation**
   - Create migration file in `infra/supabase/migrations/`
   - Include rollback script
   - Document changes

4. **Apply Migration** (if --apply)
   - Execute against development database
   - Regenerate Prisma client
   - Run type checks

## Output Structure

```
infra/supabase/migrations/
└── YYYYMMDDHHMMSS_<name>/
    ├── migration.sql      # Forward migration
    └── down.sql           # Rollback script
```

## Example
```bash
# Create migration for adding lead scoring
/create-migration add_lead_scoring --apply

# Validate schema changes
/create-migration --validate-only
```

## Safety Checks

- Warns about destructive operations (DROP, DELETE)
- Validates foreign key constraints
- Checks index coverage for new columns
- Verifies RLS policies are maintained
