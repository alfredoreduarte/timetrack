# TimeTrack Mac App - Portable Build Guide

This guide explains how to create a portable test version of the TimeTrack Mac app that can be easily distributed and run on other Macs.

## Quick Start

1. **Navigate to the mac-app directory:**
   ```bash
   cd packages/mac-app
   ```

2. **Run the portable build script:**
   ```bash
   ./build_portable.sh
   ```

3. **The script will create a ready-to-distribute zip file in the `build/` directory**

## What the Build Script Does

The `build_portable.sh` script automates the entire process:

1. **Cleans previous builds** - Removes old build artifacts
2. **Builds the app in Release mode** - Optimized for performance
3. **Creates an unsigned archive** - Builds without code signing for portability
4. **Exports the app bundle** - Extracts the standalone `.app` file
5. **Creates a portable package** with:
   - `TimeTrack.app` - The main application
   - `README.txt` - Installation instructions for end users
   - `install.sh` - Optional installation helper script
6. **Generates a timestamped zip file** ready for distribution

## System Requirements

### For Building:
- macOS with Xcode 15.4 or later
- Xcode command line tools installed
- Access to the TimeTrack project

### For Running (End Users):
- macOS 13.0 or later (compatible with Intel and Apple Silicon Macs)
- Internet connection to access TimeTrack API
- No additional software installation required

## Distribution Process

### 1. Build the Portable Version
```bash
./build_portable.sh
```

### 2. Locate the Distribution File
The script creates a zip file in the format:
```
build/TimeTrack-Portable-YYYYMMDD-HHMM.zip
```

### 3. Send to Test Users
- Upload to cloud storage (Dropbox, Google Drive, etc.)
- Send via email (if file size permits)
- Share via internal distribution system

### 4. Installation Instructions for End Users

#### Option A: Using the Install Script (Recommended)
1. Extract the zip file
2. Open Terminal and navigate to the extracted folder
3. Run: `./install.sh`
4. The app will be installed to Applications folder

#### Option B: Manual Installation
1. Extract the zip file
2. Drag `TimeTrack.app` to the Applications folder
3. Launch from Applications or Spotlight

#### First Launch Security
Due to macOS security restrictions, first-time users need to:
1. Right-click on `TimeTrack.app`
2. Select "Open" from the context menu
3. Click "Open" in the security dialog
4. The app will launch and subsequent launches will work normally

## Troubleshooting

### Build Issues

**"xcodebuild command not found"**
```bash
# Install Xcode command line tools
xcode-select --install
```

**"Archive creation failed"**
- Ensure Xcode project builds successfully in Xcode first
- Check that all dependencies are available
- Verify scheme name matches in the script

**"Code signing errors"**
- The script is designed to build without code signing
- If errors persist, check Xcode project settings
- Ensure "Automatically manage signing" is enabled in Xcode

### Runtime Issues (End Users)

**"App can't be opened because it is from an unidentified developer"**
- Right-click the app and select "Open"
- This is normal for unsigned apps

**"Cannot connect to API"**
- Verify internet connection
- Check that API server (https://api.track.alfredo.re) is accessible
- For local development, ensure API server is running

**App crashes on launch**
- Check macOS version (requires 13.0+)
- Try running from Terminal to see error messages
- Verify app bundle integrity

## Advanced Configuration

### Custom API URL
To build for a different API endpoint:

1. **Edit the APIClient.swift file** before building:
   ```swift
   private let baseURL = "https://your-custom-api.com"
   ```

2. **Or set environment variable** when running:
   ```bash
   TIMETRACK_API_URL=https://your-api.com ./build_portable.sh
   ```

### Custom Bundle Identifier
To avoid conflicts with official builds:

1. **Edit the Xcode project settings**
2. **Change the Bundle Identifier** from `com.timetrack.mac` to your custom identifier
3. **Rebuild the portable version**

### Build Variants

You can modify the script for different build configurations:

```bash
# Debug build (larger file, more debugging info)
CONFIGURATION="Debug" ./build_portable.sh

# Custom scheme
SCHEME_NAME="TimeTrack-Beta" ./build_portable.sh
```

## File Structure

After building, the portable package contains:

```
build/portable/
├── TimeTrack.app/          # Main application bundle
│   ├── Contents/
│   │   ├── MacOS/TimeTrack # Executable
│   │   ├── Info.plist       # App metadata
│   │   └── Resources/       # Assets and resources
├── README.txt              # End-user instructions
└── install.sh             # Installation helper
```

## Security Considerations

### For Distribution:
- The portable build is **unsigned** and will trigger security warnings
- Only distribute to trusted users
- Consider notarization for wider distribution

### For End Users:
- Users need to explicitly allow the app to run
- The app requires network access for API communication
- All data is transmitted to your TimeTrack API server

## Automation

For continuous distribution, you can integrate the build script into your workflow:

```bash
# Example automation script
#!/bin/bash
cd packages/mac-app
./build_portable.sh
# Upload to distribution server
scp build/TimeTrack-Portable-*.zip user@server:/path/to/downloads/
```

## Support

For issues with the portable build process:
1. Check this guide for common solutions
2. Verify Xcode and macOS versions
3. Test the build process on a clean system
4. Review build logs for specific error messages

For end-user support:
- Direct users to the included README.txt
- Provide the troubleshooting section above
- Consider creating video tutorials for first-time setup