# TimeTrack Mac App

A native macOS SwiftUI application for the TimeTrack time tracking system.

## Features

- **User Authentication**: Login and registration with your TimeTrack account
- **Timer Management**: Start and stop time tracking with real-time timer display
- **Project Selection**: Choose from your available projects when starting timers
- **Recent Entries**: View your latest time entries with restart functionality
- **Clean UI**: Native macOS design following Apple's design guidelines

## Requirements

- macOS 14.0 or later
- Xcode 15.4 or later
- TimeTrack API server accessible (uses https://api.track.alfredo.re by default)

## Setup

1. **Open the project in Xcode:**
   ```bash
   cd packages/mac-app
   open TimeTrack.xcodeproj
   ```

2. **Configure API URL (optional):**
   - The app defaults to `https://api.track.alfredo.re` for production use
   - For local development, set `TIMETRACK_API_URL=http://localhost:3011` environment variable
   - Or modify the `baseURL` in `APIClient.swift`

3. **Build and run:**
   - Select the TimeTrack scheme in Xcode
   - Press ⌘R to build and run the app

## Architecture

The app follows the MVVM (Model-View-ViewModel) pattern with SwiftUI:

### Models
- `User`, `Project`, `TimeEntry` - Data models matching the API schema
- `APIError`, `AuthResponse` - API response models

### Services
- `APIClient` - HTTP client for API communication
- `AuthService` - Authentication operations
- `TimerService` - Timer and project operations

### ViewModels
- `AuthViewModel` - Manages authentication state
- `TimerViewModel` - Manages timer state and recent entries

### Views
- `LoginView` - User authentication
- `RegisterView` - User registration
- `DashboardView` - Main app interface
- `TimerView` - Timer controls and project selection

## API Integration

The app integrates with the TimeTrack API using the following endpoints:

- `POST /auth/login` - User authentication
- `POST /auth/register` - User registration
- `GET /auth/me` - Get current user info
- `GET /projects` - Get user's projects
- `GET /time-entries/current` - Get currently running timer
- `GET /time-entries` - Get recent time entries
- `POST /time-entries/start` - Start a new timer
- `POST /time-entries/{id}/stop` - Stop a running timer

## Development Notes

- The app uses `UserDefaults` to persist the JWT authentication token
- Timer updates every second when running to show real-time elapsed time
- Network requests are handled asynchronously with async/await
- Error handling displays user-friendly messages for common API errors
- The app requires network permissions (configured in entitlements)

## Building for Distribution

1. Configure code signing in Xcode project settings
2. Create an archive: Product → Archive
3. Export the app with Developer ID for distribution outside the App Store
4. Notarize the app if distributing outside the App Store

## Troubleshooting

**"Cannot connect to API"**
- Ensure you have internet connectivity to reach https://api.track.alfredo.re
- For local development, ensure the API server is running on localhost:3011
- Check network permissions in System Preferences → Security & Privacy

**"Invalid credentials"**
- Verify the API server is using the same user database
- Try registering a new account through the Mac app

**App won't start**
- Check minimum macOS version (14.0+)
- Verify Xcode version (15.4+)
- Clean build folder: Product → Clean Build Folder