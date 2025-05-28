# TimeTrack - Electron Desktop Application

A modern Electron desktop application for time tracking built with React, TypeScript, and Tailwind CSS.

## Features

- **User Authentication** - Login and registration with JWT tokens
- **Time Tracking** - Start/stop timers with real-time updates
- **Project Management** - Create and organize projects and tasks
- **Time Entries** - View, edit, and delete time tracking records
- **Reports & Analytics** - Analyze time tracking data with charts and summaries
- **System Tray Integration** - Quick access from system tray
- **Keyboard Shortcuts** - Efficient navigation and timer controls
- **Modern UI** - Clean, professional interface with Tailwind CSS

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Desktop**: Electron 28
- **State Management**: Redux Toolkit
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Icons**: Heroicons
- **Notifications**: React Hot Toast
- **HTTP Client**: Axios

## Prerequisites

- Node.js 16+ (recommended: Node.js 18+)
- npm or yarn
- TimeTrack API server running on `localhost:3000`

## Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd timetrack-ui
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

This will start both the React development server (Vite) and the Electron application.

## Available Scripts

- `npm run dev` - Start development mode (React + Electron)
- `npm run dev:react` - Start only React development server
- `npm run dev:electron` - Start only Electron (requires React server running)
- `npm run build` - Build for production
- `npm run build:react` - Build React app only
- `npm run build:electron` - Build Electron main process only
- `npm run package` - Package the app for distribution
- `npm run package:dir` - Package without creating installer
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## Project Structure

```
timetrack-ui/
├── electron/           # Electron main process
│   ├── main.ts        # Main Electron process
│   ├── preload.ts     # Preload script for IPC
│   └── utils.ts       # Utility functions
├── src/               # React application
│   ├── components/    # Reusable components
│   ├── pages/         # Page components
│   ├── store/         # Redux store and slices
│   ├── services/      # API services
│   ├── App.tsx        # Main App component
│   └── main.tsx       # React entry point
├── public/            # Static assets
└── dist/              # Build output
```

## API Integration

The application connects to a REST API running on `localhost:3000`. Make sure the TimeTrack API server is running before starting the application.

### API Endpoints Used

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/me` - Get current user
- `GET /api/projects` - Get user projects
- `POST /api/projects` - Create project
- `GET /api/time-entries` - Get time entries
- `POST /api/time-entries/start` - Start timer
- `POST /api/time-entries/:id/stop` - Stop timer

## Electron Features

### System Tray

- Minimize to system tray
- Quick timer controls from tray menu
- Show/hide application window

### Keyboard Shortcuts

- `Cmd/Ctrl + Space` - Start timer
- `Cmd/Ctrl + Shift + Space` - Stop timer
- `Cmd/Ctrl + N` - New project

### IPC Communication

The app uses Electron's IPC for secure communication between the main and renderer processes.

## Development

### Hot Reload

The development setup includes hot reload for both React components and Electron main process changes.

### Debugging

- React DevTools available in development
- Electron DevTools automatically opened in development
- Console logs available in both main and renderer processes

## Building for Production

1. Build the application:

```bash
npm run build
```

2. Package for distribution:

```bash
npm run package
```

This will create platform-specific installers in the `release/` directory.

## Supported Platforms

- macOS (Apple Silicon and Intel)
- Windows (x64)
- Linux (AppImage)

## Configuration

### Environment Variables

- `NODE_ENV` - Set to 'development' for development mode
- API base URL is configured in `src/services/api.ts`

### Electron Builder

Configuration for packaging is in `package.json` under the `build` section.

## Troubleshooting

### Common Issues

1. **API Connection Failed**

   - Ensure the TimeTrack API server is running on `localhost:3000`
   - Check network connectivity

2. **Electron App Won't Start**

   - Make sure React dev server is running first
   - Check for port conflicts (default: 5173)

3. **Build Errors**
   - Clear node_modules and reinstall dependencies
   - Ensure Node.js version compatibility

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
