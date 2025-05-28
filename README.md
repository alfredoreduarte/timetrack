# TimeTrack Monorepo

A monorepo containing the TimeTrack application with API, UI, and shared packages.

## 📁 Project Structure

```
timetrack-monorepo/
├── packages/
│   ├── api/           # TimeTrack API server (to be added)
│   ├── ui/            # Electron desktop application
│   └── shared/        # Shared types, constants, and utilities
├── package.json       # Root package.json with workspaces
└── README.md         # This file
```

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ (recommended: Node.js 18+)
- npm 7+ (for workspaces support)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd timetrack-monorepo
```

2. Install all dependencies:

```bash
npm install
```

This will install dependencies for all packages in the monorepo.

### Development

#### Start both API and UI (when API is added):

```bash
npm run dev
```

#### Start individual packages:

```bash
# UI only
npm run dev:ui

# API only (when added)
npm run dev:api
```

#### Build all packages:

```bash
npm run build
```

#### Run tests across all packages:

```bash
npm run test
```

#### Lint all packages:

```bash
npm run lint
```

## 📦 Packages

### @timetrack/ui

The Electron desktop application built with React, TypeScript, and Tailwind CSS.

**Location:** `packages/ui/`

**Key Features:**

- Electron desktop app
- React 18 + TypeScript
- Redux Toolkit for state management
- Tailwind CSS for styling
- System tray integration
- Time tracking functionality

**Development:**

```bash
cd packages/ui
npm run dev
```

### @timetrack/api

The API server for TimeTrack (to be added).

**Location:** `packages/api/`

**Status:** Placeholder - add your existing API project here

**To add your API project:**

1. Copy your API project files to `packages/api/`
2. Update `packages/api/package.json` with your API's configuration
3. Add `@timetrack/shared` as a dependency
4. Update the root scripts to properly start your API

### @timetrack/shared

Shared types, constants, and utilities used by both API and UI packages.

**Location:** `packages/shared/`

**Exports:**

- TypeScript interfaces and types
- API endpoint constants
- Utility functions for date formatting, validation, etc.
- Common constants and configuration

**Usage in other packages:**

```typescript
import { User, Project, TimeEntry, API_ENDPOINTS } from "@timetrack/shared";
```

## 🛠️ Development Workflow

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

#### To the root (affects all packages):

```bash
npm install <package-name> -w packages/ui -w packages/api -w packages/shared
```

### Working with Shared Package

When you modify the shared package:

1. Build the shared package:

```bash
npm run build --workspace=packages/shared
```

2. The changes will be automatically available to other packages that depend on it.

### Scripts Available

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
| `npm run package:ui` | Package UI for distribution               |

## 🔧 Configuration

### TypeScript

Each package has its own `tsconfig.json`. The shared package provides common types that can be imported by other packages.

### ESLint

Shared ESLint configuration is defined at the root level and inherited by all packages.

### Workspaces

This monorepo uses npm workspaces for dependency management. Dependencies are hoisted to the root `node_modules` when possible.

## 📝 Adding Your API Project

To integrate your existing API project:

1. **Copy your API files:**

```bash
cp -r /path/to/your/api/* packages/api/
```

2. **Update API package.json:**

   - Change the name to `@timetrack/api`
   - Add `@timetrack/shared` as a dependency
   - Update scripts as needed

3. **Use shared types in your API:**

```typescript
import { User, Project, TimeEntry } from "@timetrack/shared";
```

4. **Update root scripts:**
   - Modify the `dev:api` script to start your API server
   - Update other scripts as needed

## 🚀 Deployment

### UI Application

```bash
npm run package:ui
```

This creates platform-specific installers in `packages/ui/release/`.

### API Server

Add deployment scripts to `packages/api/package.json` and reference them from the root.

## 🤝 Contributing

1. Make changes in the appropriate package
2. Run tests: `npm run test`
3. Run linting: `npm run lint`
4. Build all packages: `npm run build`
5. Commit your changes

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

1. **Dependency conflicts:**

   - Clear all node_modules: `npm run clean`
   - Reinstall: `npm install`

2. **TypeScript errors with shared package:**

   - Build shared package: `npm run build --workspace=packages/shared`
   - Restart TypeScript server in your editor

3. **Workspace not found errors:**
   - Ensure you're running commands from the root directory
   - Check that package names match in package.json files

### Getting Help

- Check individual package READMEs for package-specific issues
- Ensure all dependencies are installed: `npm install`
- Verify Node.js and npm versions meet requirements
