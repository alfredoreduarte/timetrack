# CLAUDE.md

TimeTrack is a time tracking app (monorepo) with web, Electron, macOS, and iOS clients backed by a Node.js API.

## Packages

```
packages/
├── api/       # Node.js/Express API — see packages/api/CLAUDE.md
├── ui/        # React web + Electron desktop — see packages/ui/CLAUDE.md
├── mac-app/   # Native macOS SwiftUI — see packages/mac-app/CLAUDE.md
├── ios-app/   # Native iOS & watchOS SwiftUI — see packages/ios-app/CLAUDE.md
├── landing/   # SSR marketing page (React + Vite)
└── shared/    # Shared TypeScript types and utilities
```

Core data model: **User → Projects → Tasks → TimeEntries**. Hourly rates cascade Task > Project > User.

## Root Commands

```bash
npm run dev              # Start all services (Docker)
npm run logs             # View logs
npm run stop             # Stop all services
npm run restart          # Restart all services
npm run status           # Check service status
npm run build:all        # Build all packages (shared → api → ui → landing)
npm run test:all         # Run tests across api and ui
npm run lint:all         # Lint all packages
npm run type-check:all
npm run migrate          # Run DB migrations (dev)
npm run migrate:prod     # Run DB migrations (prod)
npm run migrate:staging  # Run DB migrations (staging)
npm run backup           # Create DB backup
npm run db:seed          # Seed test data
npm run staging          # Deploy staging environment
npm run logs:staging     # View staging logs
npm run stop:staging     # Stop staging services
npm run status:staging   # Check staging service status
npm run restart:staging  # Restart staging services
```

**Dev login** (after seeding): `test@example.com` / `123456`

## Port Allocation

| Port | Service |
|------|---------|
| 3010 | Web UI (nginx) |
| 3011 | API server |
| 3012 | PostgreSQL |
| 3013 | Redis |
| 3014 | Landing page |
| 3020 | Staging Web UI |
| 3021 | Staging API |
| 3022 | Staging PostgreSQL |
| 3023 | Staging Redis |
| 3024 | Staging Landing |
| 5173 | Vite dev (UI) |
| 5174 | Vite dev (Landing) |

## Deployment

```bash
./deploy.sh dev     # Development with hot reload
./deploy.sh prod    # Production (includes DB backup + migrations)
./deploy.sh staging # Staging (isolated on same droplet, ports 3020-3024)
```

## Development Workflow

### Never Work Directly on Main
NEVER commit or push directly to `main`. Always:
1. `git checkout -b feature/descriptive-name`
2. Commit on the branch
3. Push and open a PR
4. Merge via PR after review — never skip the test plan if there is one

### Fix Root Causes, Not Symptoms
When debugging client/server issues, fix the broken component — not the working one.
- Client expects format X, API returns format Y (correctly) → fix the client
- Modifying working code to accommodate broken code creates tech debt and breaks other clients

### Environment Variable Verification
NEVER use an env var in code without verifying it exists first:
- Check `docker.env` / `.env` / deployment environment
- Verify exact name (case-sensitive)
- Provide a clear error if a required variable is missing

### Hot Reload
- **API**: Nodemon watches `src/` and `../shared/src/` (2s delay)
- **UI**: Vite HMR
- **Shared changes**: Rebuild with `npm run build:shared` to trigger reload in API and UI

### Adding New Features (full-stack)
1. Define types in `packages/shared/src/types/`
2. Add DB schema in `packages/api/prisma/schema.prisma` + run migration
3. Implement API endpoint in `packages/api/src/routes/`
4. Add Redux slice in `packages/ui/src/store/slices/`
5. Create React components in `packages/ui/src/components/`
6. Update native apps if needed

### Git Commit Style

```
Brief summary line (what and why)

- Key change one
- Key change two
- Keep bullets short and specific
```

Do not include Claude Code credits in commit messages or PR descriptions.

### Pull Request Guidelines
- Never merge without permission
- Never skip the test plan if one exists
- Always use **rebase and merge**: `gh pr merge <number> --rebase --delete-branch`
