# macOS App Store Compliance Guide

## Current App Status Assessment

### ✅ Already Implemented
- App Sandbox enabled (`com.apple.security.app-sandbox`)
- Network client access (`com.apple.security.network.client`)
- User-selected file read access (`com.apple.security.files.user-selected.read-only`)
- SwiftUI-based native macOS app
- No deprecated APIs
- 64-bit architecture support

### 🔄 Needs Review/Enhancement

## Required Entitlements Analysis

### Current Entitlements in `TimeTrack.entitlements`:
```xml
com.apple.security.app-sandbox: true
com.apple.security.network.client: true
com.apple.security.files.user-selected.read-only: true
```

### Additional Entitlements Needed:

#### 1. Outgoing Network Connections
Already have `com.apple.security.network.client` ✅

#### 2. User Data Access
For exporting time tracking data:
```xml
<key>com.apple.security.files.user-selected.read-write</key>
<true/>
```

#### 3. Hardened Runtime (Required for notarization)
```xml
<key>com.apple.security.cs.allow-jit</key>
<false/>
<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
<false/>
<key>com.apple.security.cs.allow-dyld-environment-variables</key>
<false/>
<key>com.apple.security.cs.disable-library-validation</key>
<false/>
```

## Privacy Policy Compliance

### Required Privacy Disclosures for macOS:
- **Network Usage**: Explain API communication with TimeTrack servers
- **Data Storage**: Local data storage and cloud sync
- **System Integration**: Menu bar presence and system notifications

### macOS-Specific Privacy Requirements:
- No location data collection (good - not needed)
- No camera/microphone usage (good - not needed)
- Network usage properly declared in entitlements ✅

## App Store Review Guidelines Compliance

### Design Guidelines
- [ ] **Native macOS UI**: Using SwiftUI ✅
- [ ] **Menu Bar Integration**: Properly implemented ✅
- [ ] **Keyboard Shortcuts**: Standard macOS shortcuts
- [ ] **Window Management**: Proper window behavior
- [ ] **macOS Design Patterns**: Native look and feel ✅

### Technical Requirements
- [ ] **64-bit Only**: Required for App Store ✅
- [ ] **Sandboxing**: Properly configured ✅
- [ ] **Code Signing**: Required for distribution
- [ ] **Notarization**: Required for macOS 10.15+
- [ ] **No Private APIs**: All APIs are public ✅

### Content Requirements
- [ ] **No Inappropriate Content**: TimeTrack is productivity app ✅
- [ ] **Accurate Description**: App metadata matches functionality
- [ ] **Privacy Policy**: Accessible and comprehensive
- [ ] **Age Rating**: 4+ appropriate for productivity app ✅

## App Metadata Requirements

### App Information
```
App Name: TimeTrack
Category: Productivity
Subcategory: Business
Copyright: © 2025 TimeTrack
Age Rating: 4+
```

### App Description Template
```
TimeTrack - Professional Time Tracking for Mac

Efficiently track your time and manage projects with TimeTrack, the native macOS time tracking application designed for professionals, freelancers, and teams.

KEY FEATURES:
• Native macOS design with menu bar integration
• Real-time time tracking with start/stop timers
• Project and task organization
• Detailed time and earnings reports
• Export data for invoicing and billing
• Secure cloud synchronization
• Professional reporting and analytics

DESIGNED FOR PROFESSIONALS:
• Freelancers tracking billable hours
• Consultants managing multiple clients
• Teams coordinating project time
• Anyone seeking better productivity insights

MACOS INTEGRATION:
• Menu bar quick access
• Native macOS notifications
• Keyboard shortcuts support
• Retina display optimization
• Dark mode support

PRIVACY & SECURITY:
• App Store approved sandboxing
• Secure data encryption
• Privacy-focused design
• Local data storage option

Track your time more efficiently with TimeTrack's native macOS experience.
```

### Keywords
```
time tracking, productivity, project management, timesheet, billing, freelance, consulting, timer, work hours, reporting
```

## Code Signing & Notarization

### Developer ID Requirements
1. **Apple Developer Program**: Active membership required
2. **Developer ID Application Certificate**: For code signing
3. **Developer ID Installer Certificate**: For installer packages

### Build Configuration
```bash
# Code signing identity
CODE_SIGN_IDENTITY = "Developer ID Application: [Your Name] ([Team ID])"

# Enable Hardened Runtime
ENABLE_HARDENED_RUNTIME = YES

# Enable App Sandbox
CODE_SIGN_ENTITLEMENTS = TimeTrack.entitlements
```

### Notarization Process
```bash
# Build and export app
xcodebuild -project TimeTrack.xcodeproj -scheme TimeTrack -configuration Release -archivePath TimeTrack.xcarchive archive

# Export for distribution
xcodebuild -exportArchive -archivePath TimeTrack.xcarchive -exportPath . -exportOptionsPlist ExportOptions.plist

# Submit for notarization
xcrun notarytool submit TimeTrack.pkg --apple-id [your-apple-id] --password [app-specific-password] --team-id [team-id] --wait

# Staple notarization
xcrun stapler staple TimeTrack.app
```

## Menu Bar App Considerations

### Current Implementation Status
- ✅ Menu bar presence with MenuBarManager
- ✅ Start/stop timer from menu bar
- ✅ Project selection from menu bar
- ✅ Current time display in menu bar

### App Store Guidelines for Menu Bar Apps
- [ ] **User Control**: User can hide/show menu bar item ✅
- [ ] **No Always-On**: App should not require menu bar presence
- [ ] **Graceful Degradation**: App works without menu bar access
- [ ] **Standard Behavior**: Follows macOS menu bar conventions ✅

## Testing Requirements

### Pre-Submission Testing
- [ ] **Fresh macOS Installation**: Test on clean system
- [ ] **Multiple macOS Versions**: Test on supported OS versions
- [ ] **Different Hardware**: Intel and Apple Silicon Macs
- [ ] **Network Conditions**: Test with/without internet
- [ ] **Permissions**: Test all permission requests
- [ ] **App Sandbox**: Verify all features work in sandbox
- [ ] **Performance**: Monitor CPU, memory, battery usage

### Automated Testing
- [ ] **Unit Tests**: Core functionality testing
- [ ] **UI Tests**: User interface automation
- [ ] **Performance Tests**: Resource usage monitoring
- [ ] **Security Tests**: Sandbox compliance verification

## Version Information Management

### Bundle Configuration
```xml
<!-- CFBundleVersion: Build number (incremental) -->
<key>CFBundleVersion</key>
<string>1</string>

<!-- CFBundleShortVersionString: Marketing version -->
<key>CFBundleShortVersionString</key>
<string>1.0</string>

<!-- Bundle Identifier -->
<key>CFBundleIdentifier</key>
<string>com.timetrack.mac.TimeTrack</string>

<!-- Minimum macOS Version -->
<key>LSMinimumSystemVersion</key>
<string>12.0</string>
```

## Privacy Manifest (Required iOS 17+/macOS 14+)

Create `PrivacyInfo.xcprivacy`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryNetworking</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>NSPrivacyAccessedAPICategoryNetworking.1</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAccountManagement</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

## Distribution Checklist

### Pre-Submission
- [ ] All features tested and working
- [ ] No compiler warnings
- [ ] App Store guidelines reviewed
- [ ] Privacy policy updated
- [ ] Terms of service updated
- [ ] App icons all sizes included
- [ ] Screenshots prepared
- [ ] App metadata written
- [ ] Keywords researched

### Code Quality
- [ ] No memory leaks
- [ ] No crashes under normal use
- [ ] Proper error handling
- [ ] Network failure resilience
- [ ] Data corruption prevention
- [ ] User data backup/recovery

### Security & Privacy
- [ ] All network calls use HTTPS
- [ ] User data properly encrypted
- [ ] No sensitive data in logs
- [ ] Proper keychain usage
- [ ] Sandbox compliance verified
- [ ] Privacy manifest included

### Submission Ready
- [ ] Archive built successfully
- [ ] Code signed with Developer ID
- [ ] Notarization completed
- [ ] App Store Connect configured
- [ ] Screenshots uploaded
- [ ] Metadata finalized
- [ ] Review notes prepared

---

## Next Steps

1. **Update Entitlements**: Add required permissions
2. **Add Privacy Manifest**: Create PrivacyInfo.xcprivacy
3. **Prepare Build Scripts**: Automated building and signing
4. **Create App Store Assets**: Icons, screenshots, descriptions
5. **Submit for Review**: Upload to App Store Connect

This compliance review ensures TimeTrack meets all macOS App Store requirements for a successful submission.