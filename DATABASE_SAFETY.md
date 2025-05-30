# Database Safety and Migration Guide

## ⚠️ CRITICAL: Production Database Safety

**The previous setup was destroying production data on every rebuild!** This has been fixed.

## What Was Wrong

The API Dockerfile was using:
```bash
npx prisma db push --accept-data-loss
```

This command **destroys all existing data** every time a container restarts. It:
- Drops the entire database schema
- Recreates tables from scratch
- **DELETES ALL DATA** (that's what `--accept-data-loss` means)

## What's Fixed

✅ **Safe Migration System**: Now uses `npx prisma migrate deploy`
✅ **Automatic Backups**: Production deployments create automatic backups
✅ **Preserve Database**: Deployment only restarts app services, not database
✅ **Migration Lock**: Fixed PostgreSQL/SQLite mismatch

## Safe Deployment Process

### Production Deployment
```bash
# This now safely preserves your database
./deploy.sh prod
```

The production deployment now:
1. Creates automatic backup before deployment
2. Stops only app services (API, web, Redis) - **NOT the database**
3. Rebuilds and restarts app services
4. Runs safe migrations that preserve existing data

### Manual Database Backup
```bash
# Create a manual backup anytime
./deploy.sh backup
```

### Manual Migration (if needed)
```bash
# Run migrations manually in production
./deploy.sh migrate prod

# Run migrations in development
./deploy.sh migrate dev
```

## Database Schema Changes

When you need to change the database schema:

### Development
1. Modify `packages/api/prisma/schema.prisma`
2. Create migration:
   ```bash
   cd packages/api
   npx prisma migrate dev --name your_migration_name
   ```
3. Test locally

### Production
1. Deploy the code changes:
   ```bash
   ./deploy.sh prod
   ```
2. Migrations run automatically during deployment

## File Changes Made

### 1. `packages/api/Dockerfile`
- ❌ Removed: `npx prisma db push --accept-data-loss`
- ✅ Added: `npx prisma migrate deploy`

### 2. `deploy.sh`
- ✅ Added automatic backup before production deployment
- ✅ Added `migrate` command for manual migration management
- ✅ Changed to stop only app services, preserving database

### 3. `packages/api/prisma/migrations/migration_lock.toml`
- ✅ Fixed provider from `sqlite` to `postgresql`

## Backup Strategy

- **Automatic**: Every production deployment creates a timestamped backup
- **Manual**: Run `./deploy.sh backup` anytime
- **Pre-migration**: Migrations automatically create backups
- **Naming**: `backup_prod_YYYYMMDD_HHMMSS.sql`

## Recovery

If something goes wrong:
```bash
# Restore from backup (replace with your backup filename)
docker exec timetrack-postgres-prod psql -U timetrack_user -d timetrack_db < backup_prod_20240101_120000.sql
```

## Never Again

This setup ensures your production database will **NEVER** be wiped by a deployment again.

## Commands Summary

```bash
./deploy.sh prod      # Safe production deployment with auto-backup
./deploy.sh backup    # Manual backup
./deploy.sh migrate prod  # Manual migration (if needed)
./deploy.sh status prod   # Check production status
./deploy.sh logs prod     # View production logs
```

## Questions?

If you have any questions about these changes or need to modify the database schema, please ask before making changes to ensure data safety.