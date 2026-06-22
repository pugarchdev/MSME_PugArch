# Database Migration Strategy

## Overview

This document outlines the strategy for managing database schema changes in the MSME PugArch project using Prisma ORM with PostgreSQL.

## Migration Workflow

### 1. Development Workflow

```bash
# 1. Make schema changes in prisma/schema.prisma
# 2. Create a migration
npx prisma migrate dev --name descriptive_migration_name

# 3. This creates a new migration file in prisma/migrations/
# 4. Review the generated SQL in the migration file
# 5. Test the migration locally
# 6. Commit both schema.prisma and the migration folder
```

### 2. Naming Conventions

Migration names should follow the pattern: `YYYYMMDD_description_of_change`

Examples:
- `20240115_add_org_membership_table`
- `20240116_add_financial_ledger_constraints`
- `20240117_add_pan_gst_unique_indexes`

### 3. Production Deployment

```bash
# In CI/CD pipeline (run before deploying new code):
npx prisma migrate deploy
```

This command:
- Applies all pending migrations in order
- Is idempotent (safe to run multiple times)
- Fails if there are conflicts or errors
- Should be run with appropriate database permissions

## Schema Management Rules

### Do's
- ✅ Always use `prisma migrate dev` for new migrations
- ✅ Review generated SQL before committing
- ✅ Keep migrations small and focused
- ✅ Add comments in migration files for complex changes
- ✅ Test migrations against a copy of production data

### Don'ts
- ❌ Never edit applied migrations
- ❌ Never use `db push` in production
- ❌ Don't mix schema changes with data migrations
- ❌ Don't rename columns without a proper migration strategy
- ❌ Don't drop columns without deprecation period

## Handling Specific Scenarios

### Adding a New Table
1. Add model to `schema.prisma`
2. Run `prisma migrate dev --name add_table_name`
2. Verify indexes and constraints

### Adding a Column
```prisma
model User {
  // existing fields...
  newField String? @default("default_value")
}
```
- Add `@default` for non-nullable columns on existing tables
- Run `prisma migrate dev --name add_newField_to_user`

### Renaming a Column
**DO NOT** rename directly. Instead:
1. Add new column with correct name
2. Migrate data in application code or migration
3. Mark old column as `@deprecated`
4. Drop old column in future migration

### Adding Unique Constraints on Existing Data
If existing data might violate the constraint:
1. Create migration that cleans data first
2. Add constraint in separate migration
3. Or use conditional unique index:
```prisma
@@unique([field], where: { status: "active" })
```

### Data Migrations
For complex data transformations:
1. Create a separate migration file
2. Use Prisma Client in the migration:
```sql
-- In migration file
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, old_field FROM "Table" LOOP
    UPDATE "Table" SET new_field = r.old_field || '_suffix' WHERE id = r.id;
  END LOOP;
END $$;
```

## Environment-Specific Considerations

### Development
- Use `prisma migrate dev` for interactive development
- Reset database with `prisma migrate reset` when needed
- Use `prisma db seed` for test data

### Staging/Testing
- Run `prisma migrate deploy` in CI
- Test against anonymized production data snapshot
- Verify migration rollback procedures

### Production
- Run `prisma migrate deploy` during deployment window
- Monitor migration progress
- Have rollback plan ready
- Schedule during low-traffic period

## Rollback Procedures

### Automatic Rollback (Prisma)
```bash
# Rollback last migration (development only)
prisma migrate dev --rollback
```

### Manual Rollback
1. Create a new migration that reverses the changes
2. Apply with `prisma migrate deploy`
3. Never use `DROP` statements in production without backup

## Monitoring & Validation

### Pre-deployment Checks
- [ ] Migration files reviewed
- [ ] No breaking changes without versioning
- [ ] Indexes added for new query patterns
- [ ] Foreign key constraints maintained
- [ ] Data migration tested on staging

### Post-deployment Verification
- [ ] Application health checks pass
- [ ] Key queries perform within SLA
- [ ] No migration errors in logs
- [ ] Audit: `SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC LIMIT 5;`

## Current Migration History

The project uses Prisma Migrate with the following conventions:
- All migrations stored in `backend/prisma/migrations/`
- Migration history tracked in `_prisma_migrations` table
- Current schema version derived from applied migrations

## Emergency Procedures

### Failed Migration in Production
1. **Stop deployment** immediately
2. **Assess error** - check logs and database state
3. **If partial apply**: Check which statements succeeded
4. **If data corruption risk**: Restore from backup
5. **Create fix migration** and deploy

### Hotfix Deployment
For urgent schema fixes:
1. Create hotfix branch from production tag
2. Create minimal migration
3. Test thoroughly
4. Deploy with `prisma migrate deploy`
5. Backport to main branch

## Tools & Commands Reference

```bash
# Create migration
prisma migrate dev --name name

# Apply pending migrations (production)
prisma migrate deploy

# Show migration status
prisma migrate status

# Generate Prisma Client after schema changes
prisma generate

# Validate schema without applying
prisma validate

# Format schema file
prisma format

# Pull schema from existing database
prisma db pull

# Seed database
prisma db seed
```

## Related Documentation

- [Prisma Migrate Documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
- [Production Deployment Guide](https://www.prisma.io/docs/guides/deployment)