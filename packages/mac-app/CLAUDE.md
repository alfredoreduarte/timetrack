# macOS App Package

**Stack**: SwiftUI, MVVM, URLSession, UserDefaults, Combine

Menu bar app with live timer display and popover controls.

## Key File

- `TimeTrack/TimeTrackApp.swift` — App entry point

## Build Scripts

```bash
./build_portable.sh   # Build portable Mac app
./build_appstore.sh   # Build for App Store submission
```

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

The `.debounce` ensures all `@MainActor` tasks finish before the subscriber reads updated values, preventing races when `@Published` properties update via `Task { @MainActor }` closures.

Example: `MenuBarManager` subscribes to `TimerViewModel.$elapsedTime` for instant menu bar updates.

## macOS-Specific Rules

- NO iOS modifiers (`keyboardType`, `autocapitalization`, etc.)
- Use `NSColor`, not `UIColor`
- Window-based thinking, not screen-based
- Auth token stored in `UserDefaults` (not httpOnly cookie)
