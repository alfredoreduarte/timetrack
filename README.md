# TimeTrack Monorepo

A streamlined monorepo for the TimeTrack application with Docker-based development and production deployment.

## 🚀 Quick Start

**3 commands to get started:**
```bash
cp docker.env.example docker.env
# Edit docker.env with your settings
npm run dev
```

Access your app at http://localhost:3010

**👉 For complete setup and deployment instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**

## 📁 Project Structure

```
timetrack-monorepo/
├── packages/
│   ├── api/           # TimeTrack API server (Node.js/Express + Prisma)
│   ├── ui/            # React web application + Electron desktop app
│   ├── mac-app/       # Native macOS SwiftUI application
│   └── shared/        # Shared types, constants, and utilities
├── docker-compose.yml      # Development Docker setup
├── docker-compose.prod.yml # Production Docker setup
├── deploy.sh              # Unified deployment script
├── DEPLOYMENT_GUIDE.md    # 📖 Complete deployment & development guide
└── package.json           # Root scripts (npm run dev, etc.)
```

## 🛠️ Streamlined Scripts

### Daily Development
```bash
npm run dev          # Start development environment
npm run logs         # View application logs
npm run status       # Check service status
npm run stop         # Stop all services
npm run restart      # Restart all services
```

### Database Operations
```bash
npm run migrate      # Run database migrations (dev)
npm run backup       # Create database backup
```

### Production
```bash
npm run prod         # Deploy production
npm run migrate:prod # Run production migrations
npm run logs prod    # View production logs
npm run stop prod    # Stop production services
```

### Build & Test (for CI/CD or manual building)
```bash
npm run build:all    # Build all packages
npm run test:all     # Run tests in all packages
npm run lint:all     # Lint all packages
npm run clean        # Clean all build artifacts
```

## 🔥 What's Streamlined

### Before (Confusing)
- Multiple ways to start development
- Duplicated migration commands
- Unclear script purposes
- Complex deployment chains

### After (Simple)
- **One way to start dev**: `npm run dev`
- **Clear naming**: `migrate` for dev, `migrate:prod` for production
- **Consistent patterns**: All commands work with optional `prod` flag
- **Docker-first**: Everything runs in containers for consistency

## 📦 Packages

### @timetrack/api
The API server built with Node.js, Express, and Prisma ORM.
- RESTful API with JWT authentication
- PostgreSQL database with hot-reload development
- Comprehensive API documentation

### timetrack-ui
The React web application with Electron desktop support.
- React 18 + TypeScript + Tailwind CSS
- Redux Toolkit for state management
- Hot reload for fast development

### timetrack-mac-app
Native macOS SwiftUI application for time tracking.
- SwiftUI with MVVM architecture
- Real-time timer with project selection
- Native macOS design and performance
- Direct API integration

### @timetrack/shared
Shared types, constants, and utilities.
- TypeScript interfaces and types
- API endpoint constants
- Common utility functions

## 🐳 Docker-First Development

### Hot Reloading Enabled
- **API**: Nodemon watches `src/` and `../shared/src/` with 2s delay
- **UI**: Vite hot reload for instant updates
- **Shared**: Changes trigger reload in both API and UI

### Volume Mounts for Development
- Source code mounted as read-only volumes
- Database and logs persisted in named volumes
- Node modules cached for faster rebuilds

## 🔧 Environment Configuration

Copy `docker.env.example` to `docker.env` and customize:

```env
# Required
POSTGRES_PASSWORD=your_secure_password
JWT_SECRET=your_long_secret_key

# Optional
ALLOWED_ORIGINS=http://localhost:3010
REACT_APP_API_URL=http://localhost:3011
APPLICATION_URL=http://localhost:3010  # Frontend URL for emails
```

### Why Both docker.env and docker-compose.yml?

While it may seem redundant, this dual configuration serves important purposes:

- **docker.env**: Single source of truth for environment variables
  - Shared across all docker-compose files (dev, prod, test)
  - Keeps secrets out of version control (gitignored)
  - Easy to swap for different environments

- **docker-compose.yml environment section**: Service-specific configuration
  - Provides defaults when docker.env values are missing (`${VAR:-default}`)
  - Constructs derived values (e.g., DATABASE_URL from multiple variables)
  - Documents required variables for each service
  - Allows running without docker.env using built-in defaults

This pattern enables flexibility: you can run with just docker-compose.yml for quick starts, or customize via docker.env for production deployments without modifying the compose files.

## 🚀 Deployment Options

### Development (Local)
```bash
npm run dev    # Starts all services with hot reload
```

### Production (Server)
```bash
npm run prod   # Optimized production build
```

Both use the same Docker Compose setup with different configurations.

## 🎯 Key Benefits

1. **Simple**: One command for dev, one for prod
2. **Consistent**: Same environment locally and in production
3. **Fast**: Hot reload for rapid development
4. **Safe**: Automatic backups before production deployments
5. **Clear**: No duplicate or confusing scripts

## 🆘 Need Help?

- **Full Guide**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Issues**: Check logs with `npm run logs`
- **Reset**: `npm run stop && docker system prune && npm run dev`

---

**🚀 Built for simplicity and speed**
