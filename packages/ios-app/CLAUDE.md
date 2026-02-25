# iOS App Package

**Stack**: SwiftUI, MVVM, URLSession, UserDefaults, Combine, WatchConnectivity

Native iOS app with watchOS companion for at-a-glance time tracking.

## Key File

- `Timetrack/TimetracApp.swift` — App entry point

## Architecture

**MVVM pattern**:
- **Models**: Codable structs matching API schema
- **ViewModels**: `@MainActor ObservableObject` with `@Published` properties
- **Views**: SwiftUI components reactive to ViewModel state
- **Services**: `APIClient` (async/await), `AuthService` (JWT), `TimerService`

### @MainActor Rules
- All ViewModels use `@MainActor` for UI thread isolation
- Handle `deinit` cleanup properly (can't be `@MainActor` — cancel subscriptions via stored references)

### Live Data Synchronization
Use Combine reactive subscriptions, not polling timers:

```swift
viewModel.$property
    .debounce(for: .milliseconds(10), scheduler: RunLoop.main)
    .sink { [weak self] value in self?.update(value) }
    .store(in: &cancellables)
```

The `.debounce` prevents races when `@Published` properties update via `Task { @MainActor }` closures.

## iOS/watchOS-Specific Rules

- iOS modifiers (`keyboardType`, `autocapitalization`, etc.) are appropriate here
- Use `UIColor`, not `NSColor`
- Auth token stored in `UserDefaults`
- WatchConnectivity for iPhone ↔ Watch communication
- Watch complications for glanceable timer display
