# TimeTrack Monorepo

A monorepo containing the TimeTrack application with API, UI, and shared packages.

## 📁 Project Structure

```
timetrack-monorepo/
├── packages/
│   ├── api/           # TimeTrack API server (Node.js/Express + Prisma)
│   ├── ui/            # React web application + Electron desktop app
│   └── shared/        # Shared types, constants, and utilities
├── docker-compose.yml      # Development Docker setup
├── docker-compose.prod.yml # Production Docker setup
├── deploy.sh              # Deployment automation script
├── DEPLOYMENT_GUIDE.md    # 📖 Complete deployment & development guide
├── package.json           # Root package.json with workspaces
└── README.md             # This file
```

## 🚀 Quick Start

**👉 For complete setup, development, and deployment instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**

### Super Quick Start (3 commands)
```bash
cp docker.env.example docker.env
# Edit docker.env with your settings
./deploy.sh dev
```

Access your app at http://localhost:4000

## 📦 Packages

### @timetrack/api

The API server for TimeTrack built with Node.js, Express, and Prisma ORM.

**Location:** `packages/api/`

**Key Features:**
- RESTful API with Express.js
- PostgreSQL database with Prisma ORM
- JWT authentication
- Real-time updates with Socket.IO
- Comprehensive API documentation with Swagger
- Rate limiting and security middleware

### @timetrack/ui

The React web application and Electron desktop application.

**Location:** `packages/ui/`

**Key Features:**
- React 18 + TypeScript
- Redux Toolkit for state management
- Tailwind CSS for styling
- Electron desktop app support
- Web deployment with nginx
- Time tracking functionality

### @timetrack/shared

Shared types, constants, and utilities used by both API and UI packages.

**Location:** `packages/shared/`

**Exports:**
- TypeScript interfaces and types
- API endpoint constants
- Utility functions for date formatting, validation, etc.
- Common constants and configuration

## 🛠️ Monorepo Development

### Adding Dependencies

#### To a specific package:
```bash
# Add to UI package
npm install <package-name> --workspace=packages/ui

# Add to API package
npm install <package-name> --workspace=packages/api

# Add to shared package
npm install <package-name> --workspace=packages/shared
```

### Working with Shared Package

When you modify the shared package:
```bash
npm run build --workspace=packages/shared
```

The changes will be automatically available to other packages that depend on it.

### Available Scripts

| Script               | Description                               |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Start both API and UI in development mode |
| `npm run dev:api`    | Start API in development mode             |
| `npm run dev:ui`     | Start UI in development mode              |
| `npm run build`      | Build all packages                        |
| `npm run build:api`  | Build API package                         |
| `npm run build:ui`   | Build UI package                          |
| `npm run test`       | Run tests in all packages                 |
| `npm run lint`       | Lint all packages                         |
| `npm run type-check` | Type check all packages                   |
| `npm run clean`      | Clean all packages                        |

## 🔧 Configuration

- **TypeScript**: Each package has its own `tsconfig.json`
- **ESLint**: Shared configuration at root level
- **Workspaces**: npm workspaces for dependency management

## 🤝 Contributing

1. Make changes in the appropriate package
2. Run tests: `npm run test`
3. Run linting: `npm run lint`
4. Build all packages: `npm run build`
5. Commit your changes

## 🆘 Need Help?

- **Deployment & Development**: See [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- **Package-specific issues**: Check individual package READMEs
- **Monorepo issues**: Ensure you're running commands from the root directory

## 📄 License

MIT License - see LICENSE file for details.
