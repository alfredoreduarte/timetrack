# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TimeTrack is a comprehensive time tracking application built as a monorepo with multiple client platforms (web, Electron desktop, native macOS, iOS/watchOS) connecting to a centralized API. The system tracks time spent on projects and tasks, calculates earnings based on hierarchical hourly rates (Task > Project > User), and provides detailed reporting.

## Architecture

### Monorepo Structure
```
packages/
├── api/       # Node.js/Express API with Prisma ORM and PostgreSQL
├── ui/        # React web app + Electron desktop app
├── mac-app/   # Native macOS SwiftUI application
├── ios-app/   # Native iOS & watchOS SwiftUI applications
├── landing/   # SSR marketing page with React + Vite
└── shared/    # Shared TypeScript types and utilities
```

### Key Architectural Patterns
- **Docker-first development**: All services run in containers with volume mounts for hot reloading
- **npm workspaces**: Monorepo management with centralized dependencies
- **Layered API architecture**: Routes → Middleware → Controllers → Prisma → Database
- **Redux Toolkit state management**: Normalized state with async thunks for API calls
- **MVVM for native apps**: SwiftUI with @ObservableObject ViewModels
- **Real-time updates**: Socket.IO for WebSocket connections, user-specific rooms
- **Hierarchical hourly rates**: Task rate > Project rate > User default rate

## Common Development Commands

### Essential Daily Commands
```bash
npm run dev          # Start development environment (all services)
npm run logs         # View application logs
npm run stop         # Stop all services
npm run restart      # Restart all services
npm run status       # Check service status
```

### Database Operations
```bash
npm run migrate      # Run database migrations (development)
npm run migrate:prod # Run production migrations
npm run backup       # Create database backup
npm run db:studio    # Open Prisma Studio (from api package)
```

### Building and Testing
```bash
npm run build:all    # Build all packages (shared → api → ui → landing)
npm run test:all     # Run tests across api and ui packages
npm run lint:all     # Lint all packages
npm run type-check:all # TypeScript type checking
npm run package:ui   # Create Electron installer
```

### Package-Specific Commands
```bash
# In packages/api
npm run dev          # Start with nodemon hot reload
npm run db:generate  # Regenerate Prisma client after schema changes

# In packages/ui
npm run dev          # Start Vite dev server
npm run test         # Run Vitest tests with Testing Library

# In packages/mac-app
./build_portable.sh  # Build portable Mac app
./build_appstore.sh  # Build for App Store submission
```

## High-Level Code Architecture

### API Server (packages/api)
**Tech Stack**: Express.js, TypeScript, Prisma ORM, PostgreSQL, Socket.IO, JWT auth

**Request Flow**:
1. Request arrives at route handler with validation (express-validator)
2. Auth middleware verifies JWT token
3. Sanitization middleware cleans input (DOMPurify)
4. Controller processes request with business logic
5. Prisma ORM handles database operations
6. Response sent with consistent format: `{ data: T }` or `{ error: string }`
7. Socket.IO emits real-time updates to user-specific rooms

**Key Endpoints**:
- `/auth/*` - Registration, login, password reset
- `/time-entries/*` - Timer operations (start/stop/current)
- `/projects/*` and `/tasks/*` - Project/task CRUD
- `/reports/*` - Time and earnings analytics

### Web/Electron UI (packages/ui)
**Tech Stack**: React 18, Redux Toolkit, TypeScript, Tailwind CSS, Vite, Electron

**State Management Architecture**:
- Redux store with slices: `auth`, `projects`, `tasks`, `timeEntries`, `dashboard`
- Async thunks handle API calls with standardized error handling
- Normalized state structure prevents duplication
- Real-time Socket.IO updates dispatched to Redux

**Component Structure**:
- Pages (containers) connect to Redux store
- Components are presentational and reusable
- Custom hooks abstract complex logic
- Testing with Vitest + Testing Library + MSW

### Native Swift Apps (packages/mac-app & packages/ios-app)
**Tech Stack**: SwiftUI, MVVM, URLSession, UserDefaults, Combine

**Shared Architecture Patterns**:
- **Models**: Codable structs matching API schema
- **ViewModels**: @MainActor ObservableObject classes with @Published properties
- **Views**: SwiftUI components reactive to ViewModel changes
- **Services**: APIClient (async/await), AuthService (JWT), TimerService (real-time)
- **@MainActor**: All ViewModels use @MainActor for UI isolation with proper deinit cleanup

**Live Data Synchronization Pattern**:
- For real-time UI updates, use Combine reactive subscriptions instead of polling timers
- Subscribe to `@Published` properties with `.debounce(for: .milliseconds(10))` to avoid race conditions
- Pattern: `viewModel.$property.debounce(for: .milliseconds(10), scheduler: RunLoop.main).sink { update() }.store(in: &cancellables)`
- This ensures all main actor tasks complete before reading updated values
- Prevents race conditions when `@Published` properties update via async `Task { @MainActor }` closures
- Example: MenuBarManager subscribes to TimerViewModel.$elapsedTime for instant updates

**macOS-Specific** (packages/mac-app):
- Menu bar app with live timer display and popover controls
- NO iOS modifiers (keyboardType, autocapitalization)
- Use NSColor instead of UIColor
- Window-based thinking, not screen-based

**iOS/watchOS-Specific** (packages/ios-app):
- Native iOS app with watchOS companion
- Watch complications for at-a-glance time tracking
- iOS-specific modifiers and UIColor are appropriate here

### Shared Package (packages/shared)
Provides TypeScript types, API constants, and utilities used by both API and UI to ensure type safety across the stack.

## Database Schema

PostgreSQL database managed by Prisma with these core entities:
- **User**: Authentication, default hourly rate, password reset tokens, idle timeout
- **Project**: Name, description, color, optional hourly rate, active status
- **Task**: Belongs to project, optional hourly rate, completion tracking
- **TimeEntry**: Start/end times, duration, hourly rate snapshot, running status

### Migration Workflow

**CRITICAL: When modifying the database schema, follow these steps exactly to avoid runtime errors:**

1. **Modify the Prisma schema** (`packages/api/prisma/schema.prisma`)
   - Add/modify fields with proper types
   - Use `@map("snake_case_name")` to map camelCase fields to snake_case database columns
   - Example: `idleTimeoutSeconds Int? @default(600) @map("idle_timeout_seconds")`

2. **Create the migration locally**
   ```bash
   cd packages/api
   npx prisma migrate dev --name descriptive_migration_name
   ```

3. **Apply migration in Docker development environment**
   ```bash
   npm run migrate  # Applies migration to Docker containers
   ```

4. **Regenerate Prisma Client in Docker containers**
   ```bash
   docker exec timetrack-api npm run db:generate
   docker restart timetrack-api
   ```
   - **Why?** The `prisma/` directory is NOT mounted as a volume in Docker
   - Schema changes on host don't automatically sync to containers
   - Must manually copy or regenerate inside containers

5. **Update TypeScript types in shared package** (`packages/shared/src/types/index.ts`)
   - Add new fields to interfaces that cross API boundaries
   - Ensure field names match schema (camelCase in code)

6. **Test the migration**
   - Verify database column exists: `docker exec timetrack-postgres psql -U timetrack_user -d timetrack_db -c "\d table_name"`
   - Test API endpoints that use the new field
   - Verify client apps can read/write the new field

7. **Production deployment**
   ```bash
   npm run migrate:prod
   ```

### Common Migration Pitfalls

**Problem**: "Column does not exist" error after adding field to schema
**Cause**: Prisma Client in Docker container wasn't regenerated
**Solution**: Run `docker exec timetrack-api npm run db:generate && docker restart timetrack-api`

**Problem**: Prisma schema changes not reflected in container
**Cause**: `prisma/` directory is not volume-mounted (only `src/` is mounted)
**Solution**: Copy schema to container or regenerate client inside container

**Problem**: Field name mismatch between code and database
**Cause**: Missing `@map()` attribute for snake_case columns
**Solution**: Add `@map("snake_case_column_name")` to camelCase fields

## Security Implementation

- **Authentication**: JWT tokens with secure httpOnly cookies (web) or UserDefaults (native)
- **Password security**: bcryptjs hashing with salt rounds
- **API protection**: Rate limiting, request size limits, Helmet security headers
- **Input validation**: Zod schemas, express-validator, DOMPurify sanitization
- **CORS**: Configurable allowed origins for cross-origin requests
- **CSP headers**: Content Security Policy for XSS protection
- **SQL injection**: Prevented via Prisma parameterized queries

## Environment Configuration

Development uses `docker.env` with these key variables:
```bash
POSTGRES_PASSWORD     # Database password
JWT_SECRET           # JWT signing secret
EMAIL_HOST          # SMTP server for password reset
ALLOWED_ORIGINS     # CORS origins (comma-separated)
REACT_APP_API_URL   # API endpoint for UI
```

## Port Allocation

- **3010**: Web UI (nginx in Docker)
- **3011**: API server
- **3012**: PostgreSQL database
- **3013**: Redis cache
- **3014**: Landing page
- **5173**: Vite dev server (UI development)
- **5174**: Vite dev server (Landing development)

## Deployment

The `deploy.sh` script handles both development and production deployments:
```bash
./deploy.sh dev   # Development with hot reload
./deploy.sh prod  # Production with optimizations
```

Features:
- Automatic Docker Compose detection
- Health checks before declaring success
- Database backup before production deployments
- Automatic migration running
- Log tailing and service status monitoring

## Testing Strategy

**API Testing** (packages/api):
- Jest configured but minimal coverage currently
- Test files in `src/__tests__/`

**UI Testing** (packages/ui):
- Vitest with Testing Library for component tests
- MSW for API mocking
- Test files in `src/components/__tests__/` and `src/pages/__tests__/`
- Run with `npm run test` in ui package

**Native Apps**:
- XCTest framework for iOS/macOS
- UI tests and unit tests via Xcode

## Real-time Features

Socket.IO implementation:
1. Client connects on authentication
2. Server creates user-specific room
3. Timer updates broadcast to user's room
4. Client Redux store updated via Socket.IO listeners
5. Electron IPC for main/renderer communication

## Development Workflow

### Critical: Environment Variable Verification
**IMPORTANT**: NEVER use an environment variable in code without first verifying it exists. Always check:
1. Check if the variable is defined in `docker.env`, `.env`, or the deployment environment
2. Verify the variable name matches exactly (case-sensitive)
3. Check existing code for how similar variables are accessed
4. Use proper fallbacks or throw clear errors if required variables are missing

Common pitfalls to avoid:
- Don't assume variables like `REACT_APP_*` exist without checking
- Don't create new environment variables without documenting them
- Don't hardcode values that should be environment variables
- Always validate environment variables at startup, not at usage time

### Hot Reload Configuration
- **API**: Nodemon watches `src/` and `../shared/src/` with 2-second delay
- **UI**: Vite HMR for instant updates
- **Shared changes**: Trigger reload in both API and UI

### Working with the Monorepo
1. Changes to shared package require rebuilding: `npm run build:shared`
2. API and UI will auto-reload when shared is rebuilt
3. Use `npm run dev` at root for all services
4. Individual package development possible with package-specific scripts

### Adding New Features
1. Define types in `packages/shared/src/types/`
2. Add database schema in `packages/api/prisma/schema.prisma`
3. Create migration: `npx prisma migrate dev`
4. Implement API endpoint in `packages/api/src/routes/`
5. Add Redux slice in `packages/ui/src/store/slices/`
6. Create React components in `packages/ui/src/components/`
7. Update native apps if needed

### Git Commit and PR Guidelines

**Commit Messages:**
- Keep commit messages short and concise
- Use imperative mood ("Add feature" not "Added feature")
- No emojis in commit messages
- Format:
  ```
  Short descriptive title

  Brief explanation of changes if needed.
  Technical details if necessary.

  Closes #issue_number

  Generated with [Claude Code](https://claude.com/claude-code)

  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

**Pull Request Descriptions:**
- Keep PR descriptions focused and concise
- No emojis in PR descriptions
- Include only essential information:
  - Summary: 1-2 sentences describing the change
  - Key changes: Bulleted list of main modifications
  - Technical details: Only if complexity requires explanation
  - Test plan: Checklist of what was tested
- Avoid unnecessary elaboration or marketing language
- Reference the issue number with "Closes #XX"

**Example Good Commit:**
```
Add customizable idle timeout setting

Users can now set idle timeout between 1-120 minutes instead of hardcoded 10 minutes.

Technical details:
- Database: Added idle_timeout_seconds column with default 600s
- API: Zod validation in auth/users routes
- macOS: Real-time updates via NotificationCenter
- Web: Settings page with minute-based input

Closes #44

Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

**Example Bad Commit:**
```
✨ Add amazing new idle timeout feature! 🎉

This is such a cool feature that will make users super happy! 😊
Now everyone can customize their idle timeout! 🚀

[Long unnecessary explanation with multiple paragraphs and emojis]
```

## Important Files

**Configuration**:
- `/docker-compose.yml` - Development Docker setup
- `/docker-compose.prod.yml` - Production Docker setup
- `/packages/api/prisma/schema.prisma` - Database schema
- `/packages/ui/vite.config.ts` - Vite configuration

**Entry Points**:
- `/packages/api/src/server.ts` - API server
- `/packages/ui/src/App.tsx` - React app
- `/packages/ui/src/main.tsx` - Web entry
- `/packages/ui/src/electron/main.ts` - Electron entry
- `/packages/mac-app/TimeTrack/TimeTrackApp.swift` - macOS app
- `/packages/ios-app/Timetrack/TimetracApp.swift` - iOS app

**Key Services**:
- `/packages/api/src/middleware/errorHandler.ts` - Centralized error handling
- `/packages/api/src/utils/logger.ts` - Winston logging configuration
- `/packages/ui/src/services/api.ts` - Axios API client
- `/packages/ui/src/store/index.ts` - Redux store configuration