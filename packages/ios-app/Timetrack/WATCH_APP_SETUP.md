# Apple Watch App Setup Guide

This guide explains how to add the TimeTrack Apple Watch companion app to the iOS Xcode project.

## Overview

The Apple Watch app provides:
- **Current Earnings Display**: Real-time view of today's and weekly earnings
- **Project Picker**: Quick access to start timers for different projects  
- **Recent Entries**: Quickly restart recently worked on tasks
- **Complications**: Watch face widgets showing earnings and timer status

## Step 1: Add Watch App Target to Xcode

1. Open `Timetrack.xcodeproj` in Xcode
2. Click on the project name in the navigator
3. Click the "+" button at the bottom of the targets list
4. Select **watchOS** → **Watch App** → **Next**
5. Configure the Watch App:
   - **Product Name**: `TimeTrack Watch`
   - **Bundle Identifier**: `com.timetrack.ios.Timetrack.watchkitapp`
   - **Language**: Swift
   - **Include Notification Scene**: ✅ Yes
   - **Include Complication**: ✅ Yes

This will create two new targets:
- `TimeTrack Watch App` (the main Watch app)
- `TimeTrack Watch App Extension` (the app logic)

## Step 2: Copy Watch App Files

Copy all files from the `TimeTrack-Watch` directory into the newly created Watch app targets:

### Main Watch App Target (`TimeTrack Watch App`):
- Copy any assets and storyboards if needed
- The main app target primarily contains UI assets

### Watch App Extension Target (`TimeTrack Watch App Extension`):
Replace the default generated files with:

```
TimeTrack Watch App Extension/
├── TimeTrackWatchApp.swift          (Main app entry point)
├── Views/
│   ├── ContentView.swift            (Main tab view)
│   ├── CurrentStatusView.swift      (Earnings display)
│   ├── ProjectsView.swift           (Project picker)
│   └── RecentEntriesView.swift      (Recent entries)
└── Complications/
    └── TimeTrackComplicationProvider.swift (Watch face complications)
```

## Step 3: Configure App Groups

To share data between iPhone and Watch apps:

1. **Enable App Groups capability** for both iOS and Watch targets
2. **Create an App Group**: `group.com.timetrack.ios.shared`
3. **Add the App Group** to both targets in Xcode:
   - iOS Target: Signing & Capabilities → App Groups → Add `group.com.timetrack.ios.shared`
   - Watch Target: Signing & Capabilities → App Groups → Add `group.com.timetrack.ios.shared`

## Step 4: Set Up Watch Connectivity

### iPhone App Changes

Add WatchConnectivity to the iOS app:

```swift
import WatchConnectivity

// Add to AuthViewModel or create new WatchConnectivityManager
class WatchConnectivityManager: NSObject, WCSessionDelegate {
    static let shared = WatchConnectivityManager()
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }
    
    // Send data to Watch
    func sendDataToWatch(_ data: [String: Any]) {
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(data, replyHandler: nil, errorHandler: { error in
                print("Error sending to Watch: \(error)")
            })
        }
    }
    
    // WCSessionDelegate methods
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        // Handle activation
    }
    
    func sessionDidBecomeInactive(_ session: WCSession) {
        // Handle inactive state
    }
    
    func sessionDidDeactivate(_ session: WCSession) {
        // Handle deactivation
    }
    
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        // Handle messages from Watch (start/stop timer commands)
        DispatchQueue.main.async {
            if let action = message["action"] as? String {
                switch action {
                case "startTimer":
                    if let projectId = message["projectId"] as? String {
                        // Start timer for project
                    }
                case "stopTimer":
                    // Stop current timer
                    break
                case "restartEntry":
                    if let entryId = message["entryId"] as? String {
                        // Restart specific entry
                    }
                default:
                    break
                }
            }
        }
    }
}
```

## Step 5: Configure Watch App Icons

Create Watch app icons in the required sizes:

### Watch App Icons Needed:
- **38mm**: 80x80, 88x88
- **40mm**: 88x88, 100x100  
- **44mm**: 92x92, 102x102, 108x108
- **App Store**: 1024x1024

Add these to the Watch App's `Assets.xcassets` → `AppIcon.appiconset`

## Step 6: Configure Complications

1. **Enable Complication Support** in Watch App target
2. **Add WidgetKit framework** to Watch App Extension
3. **Configure supported complication families** in `TimeTrackComplicationProvider.swift`
4. **Test complications** in Watch Simulator

### Supported Complication Families:
- `.accessoryCircular` - Small circular complication
- `.accessoryRectangular` - Larger rectangular widget  
- `.accessoryInline` - Single line of text/icons

## Step 7: Update iOS App Integration

Add Watch app integration to the iOS app:

### 1. Timer State Sharing
Update TimerViewModel to send updates to Watch:

```swift
func startTimer(for project: Project, task: Task? = nil) {
    // Existing start timer logic...
    
    // Send to Watch
    WatchConnectivityManager.shared.sendDataToWatch([
        "action": "timerStarted",
        "project": project.name,
        "isRunning": true
    ])
}
```

### 2. Earnings Data Sharing
Update DashboardViewModel to send earnings data:

```swift
private func updateWatchData() {
    let watchData: [String: Any] = [
        "todaysEarnings": todaysEarnings,
        "todaysHours": todaysHours,
        "currentProject": currentProject?.name ?? "No Project",
        "isTimerRunning": timerViewModel.isRunning,
        "recentEntries": recentEntries.prefix(5).map { entry in
            [
                "id": entry.id,
                "projectName": entry.project?.name ?? "",
                "taskName": entry.task?.name,
                "duration": entry.duration,
                "earnings": entry.earnings
            ]
        }
    ]
    
    WatchConnectivityManager.shared.sendDataToWatch(watchData)
}
```

## Step 8: Build and Test

### Testing Steps:
1. **Build iPhone app** first
2. **Build Watch app** extension
3. **Install both apps** on paired devices or simulators
4. **Test data synchronization** between iPhone and Watch
5. **Test complications** on Watch face
6. **Test timer controls** from Watch app

### Debug Tips:
- Use **Watch Simulator** paired with **iOS Simulator**
- Check **Console app** for Watch app logs
- Verify **WatchConnectivity** session is active
- Test with **airplane mode** to ensure offline functionality

## Step 9: App Store Submission

### Watch App Requirements:
- **Independent Watch App**: Can run without iPhone nearby (watchOS 6+)
- **App Icons**: All required sizes provided
- **Complications**: Working and useful
- **Privacy Policy**: Updated to include Watch data usage
- **Screenshots**: Watch app screenshots for App Store

### Submission Checklist:
- [ ] Watch app builds successfully
- [ ] iPhone and Watch apps communicate properly
- [ ] Complications display correct data
- [ ] All Watch app icons included
- [ ] Watch app tested on real device
- [ ] Privacy policy updated for Watch usage
- [ ] App Store metadata includes Watch features

## Step 10: Maintenance

### Regular Updates:
- Keep Watch app in sync with iOS app features
- Update complications with new data sources
- Test on new watchOS versions
- Monitor Watch app performance and battery usage

---

This setup creates a fully functional Apple Watch companion app that enhances the TimeTrack experience with quick access to timer controls, earnings display, and convenient project selection directly from the wrist.