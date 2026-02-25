# UI Package

**Stack**: React 18, Redux Toolkit, TypeScript, Tailwind CSS, Vite, Electron

## Key Files

- `src/App.tsx` — React app root
- `src/main.tsx` — Web entry point
- `src/electron/main.ts` — Electron main process entry
- `src/services/api.ts` — Axios API client
- `src/store/index.ts` — Redux store configuration

## State Management

Redux slices: `auth`, `projects`, `tasks`, `timeEntries`, `dashboard`

- Async thunks handle API calls with standardized error handling
- Normalized state prevents duplication
- Real-time Socket.IO updates dispatched to Redux store

## Component Structure

- **Pages** (containers) — connect to Redux store
- **Components** — presentational and reusable
- **Custom hooks** — abstract complex logic

## Real-time (Socket.IO)

1. Client connects on authentication
2. Server creates user-specific room
3. Timer updates broadcast to room
4. Redux store updated via Socket.IO listeners
5. Electron IPC bridges main ↔ renderer

## Package Commands

```bash
npm run dev          # Start Vite dev server (port 5173)
npm run test         # Run Vitest tests
npm run package:ui   # Build Electron installer
```

## Environment Variables

```bash
VITE_API_URL   # Must be http://localhost:3011 for local dev
               # (NOT http://api:3011 — that's Docker-internal only)
               # Vite bakes this at build time; rebuild after changing:
               # docker-compose up -d --build web
```

## Testing

- Vitest + Testing Library + MSW
- Test files: `src/components/__tests__/`, `src/pages/__tests__/`
