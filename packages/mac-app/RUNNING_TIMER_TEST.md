# Running Timer Test Scenario

## Test Objective
Verify that the Mac app correctly detects and displays a running timer when the app starts up.

## Test Setup
1. Open the TimeTrack Mac app
2. Login with existing credentials
3. Start a timer (select project, task, description)
4. Close the app completely
5. Reopen the app

## Expected Behavior ✅

### On App Startup (after login):
- [ ] App automatically loads current timer via API call to `/time-entries/current`
- [ ] If a timer is running, the timer display should show:
  - Large elapsed time counter (HH:MM:SS format)
  - Green color indicating running state
  - Project name with color indicator dot
  - Task name (if assigned)
  - Description (if provided)

### Timer Functionality:
- [ ] Elapsed time should increment every second
- [ ] Timer should show actual elapsed time since start (not from 00:00:00)
- [ ] Stop button should be available and functional
- [ ] Project and task information should display correctly

### Recent Entries:
- [ ] Recent entries should load and display previous time entries
- [ ] Each entry should show duration, project name, and timestamp

## Key Code Paths Being Tested

### TimerViewModel.loadCurrentEntry()
```swift
func loadCurrentEntry() async {
    currentEntry = try await apiClient.getCurrentEntry()

    if let entry = currentEntry, entry.isRunning {
        calculateElapsedTime(from: entry.startTime)
        startElapsedTimer()
    } else {
        stopElapsedTimer()
        elapsedTime = 0
    }
}
```

### UI Components
- **TimerView**: Displays elapsed time and running state
- **DashboardView**: Shows project/task info with populated data
- **Recent entries**: Uses improved helper methods

## API Calls Involved
1. `GET /auth/me` - Verify authentication
2. `GET /time-entries/current` - Get running timer
3. `GET /time-entries?limit=10` - Get recent entries
4. `GET /projects` - Get user projects

## Data Model Updates Tested
- `TimeEntry.isRunning` field (no longer computed)
- `TimeEntry.project` populated object
- `TimeEntry.task` populated object
- Enhanced query parameters support

## Manual Test Checklist

### Scenario A: No Running Timer
- [ ] Timer display shows "00:00:00"
- [ ] Start button is available
- [ ] No green color/running indicator

### Scenario B: Running Timer Found
- [ ] Timer shows correct elapsed time
- [ ] Green color indicates running state
- [ ] Project name appears correctly
- [ ] Task name appears (if assigned)
- [ ] Stop button is available
- [ ] Timer increments every second

### Scenario C: Token Refresh
- [ ] If token expires, app attempts refresh
- [ ] If refresh succeeds, timer data loads
- [ ] If refresh fails, user is logged out

## Success Criteria
✅ All checkboxes above are marked as complete
✅ No error messages in console
✅ Smooth user experience with no loading delays
✅ Data displays correctly using populated project/task info