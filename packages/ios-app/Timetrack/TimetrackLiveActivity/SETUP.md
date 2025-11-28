# TimetrackLiveActivity Setup Instructions

The Live Activity extension files have been created, but you need to add the Widget Extension target in Xcode.

## Steps to Add Widget Extension Target

1. **Open the Xcode project**
   ```bash
   open /Users/alfredo/dev/timetrack-monorepo/packages/ios-app/Timetrack/Timetrack.xcodeproj
   ```

2. **Add a new Widget Extension target**
   - File → New → Target...
   - Search for "Widget Extension"
   - Click Next
   - Configure:
     - Product Name: `TimetrackLiveActivity`
     - Team: Your development team (BCFAZ48S56)
     - Bundle Identifier: `com.timetrack.ios.Timetrack.LiveActivity`
     - **IMPORTANT**: Uncheck "Include Configuration App Intent" (we don't need it)
     - **IMPORTANT**: Uncheck "Include Live Activity" (we already have the files)
   - Click Finish

3. **Delete the auto-generated files**
   - Delete the auto-generated widget files that Xcode created
   - Keep only our custom files in TimetrackLiveActivity folder

4. **Add existing files to the target**
   - Right-click on TimetrackLiveActivity folder in Xcode
   - Add Files to "Timetrack"...
   - Select all files in the TimetrackLiveActivity folder:
     - TimetrackLiveActivityBundle.swift
     - TimetrackLiveActivity.swift
     - StopTimerIntent.swift
     - TimerActivityAttributes.swift
     - Info.plist
     - TimetrackLiveActivity.entitlements
   - Ensure "TimetrackLiveActivity" target is checked

5. **Configure the entitlements**
   - Select the TimetrackLiveActivity target
   - Go to Signing & Capabilities
   - Add "App Groups" capability
   - Add `group.com.timetrack.shared`

6. **Add TimerActivityAttributes to main app**
   - Ensure TimerActivityAttributes.swift is added to the main Timetrack target
   - Go to Build Phases → Compile Sources and verify it's listed

7. **Build and test**
   - Build the project (Cmd+B)
   - Fix any compilation errors
   - Test on a physical device (Live Activities don't work on simulators)

## Files Summary

| File | Purpose |
|------|---------|
| `TimetrackLiveActivityBundle.swift` | Widget bundle entry point |
| `TimetrackLiveActivity.swift` | Lock Screen and Dynamic Island views |
| `StopTimerIntent.swift` | Button action to stop timer |
| `TimerActivityAttributes.swift` | Shared data structure (also in main app) |
| `Info.plist` | Extension configuration |
| `TimetrackLiveActivity.entitlements` | App Group for shared storage |

## Troubleshooting

### "Live Activities are not enabled"
- Ensure `NSSupportsLiveActivities = YES` is in the main app's Info.plist
- This has been added to the project build settings

### Button doesn't stop timer
- Check that the auth token is being stored in shared UserDefaults
- Verify the app group is configured correctly on both targets

### Live Activity doesn't appear
- Live Activities require iOS 16.1+
- Test on a physical device, not simulator
- Check that ActivityAuthorizationInfo().areActivitiesEnabled returns true
