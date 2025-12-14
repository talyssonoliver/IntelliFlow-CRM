# Generate Schema Command

Generate and validate Prisma schema with AI-optimized indexes and relations.

## Usage
```
/generate-schema [entity] [--validate] [--migrate]
```

## Arguments
- `entity`: Name of the domain entity (e.g., Lead, Contact, Account)
- `--validate`: Run schema validation without changes
- `--migrate`: Create and apply migration after generation

## Actions

1. **Analyze domain model**
   - Read entity definition from `packages/domain/`
   - Extract fields, relations, and constraints
   - Map to Prisma schema types

2. **Generate schema additions**
   ```prisma
   model Lead {
     id          String   @id @default(cuid())
     createdAt   DateTime @default(now())
     updatedAt   DateTime @updatedAt

     // AI-generated fields based on domain model
     // Indexes optimized for query patterns
   }
   ```

3. **Validate schema**
   - Run `prisma validate`
   - Check for type safety
   - Verify index coverage

4. **Create migration** (if --migrate)
   - Generate migration file
   - Apply to development database
   - Update Prisma client

## Output
- Schema diff
- Validation results
- Migration status (if applicable)

## Example
```bash
# Generate Lead schema
/generate-schema Lead --migrate

# Validate existing schema
/generate-schema --validate
```
