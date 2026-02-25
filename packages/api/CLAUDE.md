# API Package

**Stack**: Express.js, TypeScript, Prisma ORM, PostgreSQL, Socket.IO, JWT auth

## Request Flow

1. Route handler with express-validator validation
2. Auth middleware verifies JWT
3. DOMPurify sanitization middleware
4. Controller processes business logic
5. Prisma ORM → PostgreSQL
6. Response: `{ data: T }` or `{ error: string }`
7. Socket.IO emits real-time update to user-specific room

## Key Endpoints

- `/auth/*` — Registration, login, password reset
- `/time-entries/*` — Timer operations (start/stop/current)
- `/projects/*`, `/tasks/*` — CRUD
- `/reports/*` — Time and earnings analytics

## Key Files

- `src/server.ts` — Entry point
- `src/middleware/errorHandler.ts` — Centralized error handling
- `src/utils/logger.ts` — Winston logging
- `prisma/schema.prisma` — Database schema

## Package Commands

```bash
npm run dev          # Start with nodemon hot reload
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:studio    # Open Prisma Studio
```

## Database Schema

Core entities:
- **User**: Auth, default hourly rate, password reset tokens, idle timeout
- **Project**: Name, description, color, optional hourly rate, active status
- **Task**: Belongs to project, optional hourly rate, completion tracking
- **TimeEntry**: Start/end times, duration, hourly rate snapshot, running status

## Migration Workflow

**CRITICAL: Follow these steps exactly when modifying the schema.**

1. Edit `prisma/schema.prisma`
   - Use `@map("snake_case_name")` for camelCase → snake_case columns
   - Example: `idleTimeoutSeconds Int? @default(600) @map("idle_timeout_seconds")`

2. Create migration locally:
   ```bash
   cd packages/api
   npx prisma migrate dev --name descriptive_name
   ```

3. Apply in Docker:
   ```bash
   npm run migrate
   ```

4. Regenerate Prisma client in Docker (the `prisma/` dir is NOT volume-mounted):
   ```bash
   docker exec timetrack-api npm run db:generate
   docker restart timetrack-api
   ```

5. Update shared types in `packages/shared/src/types/index.ts`

6. Verify:
   ```bash
   docker exec timetrack-postgres psql -U timetrack_user -d timetrack_db -c "\d table_name"
   ```

7. Production: `npm run migrate:prod`

### Common Migration Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| "Column does not exist" | Prisma client not regenerated in container | `docker exec timetrack-api npm run db:generate && docker restart timetrack-api` |
| Schema change not reflected | `prisma/` not volume-mounted | Regenerate inside container |
| Field name mismatch | Missing `@map()` | Add `@map("snake_case_column_name")` |

## Environment Variables

Defined in `docker.env` (gitignored):

```bash
POSTGRES_PASSWORD     # Database password
JWT_SECRET            # JWT signing secret
EMAIL_HOST            # SMTP for password reset
ALLOWED_ORIGINS       # CORS origins (comma-separated)
```

## Security

- JWT in httpOnly cookies (web) or UserDefaults (native)
- bcryptjs password hashing
- Rate limiting, request size limits, Helmet headers
- Zod + express-validator + DOMPurify input validation
- Prisma parameterized queries (SQL injection prevention)
- CSP headers

## Testing

- Jest configured, minimal coverage currently
- Test files in `src/__tests__/`
