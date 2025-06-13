#!/bin/bash

# TimeTrack Mac App - Portable Build Script
# This script creates a portable test version that can be copied to another Mac

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 TimeTrack Mac App - Portable Build Script${NC}"
echo "=================================================="

# Configuration
PROJECT_NAME="TimeTrack"
SCHEME_NAME="TimeTrack"
CONFIGURATION="Release"
BUILD_DIR="build"
ARCHIVE_PATH="$BUILD_DIR/TimeTrack.xcarchive"
EXPORT_PATH="$BUILD_DIR/export"
PORTABLE_DIR="$BUILD_DIR/portable"
APP_NAME="TimeTrack.app"
BUNDLE_ID="com.timetrack.mac"

# Check if we're in the right directory
if [ ! -f "TimeTrack.xcodeproj/project.pbxproj" ]; then
    echo -e "${RED}❌ Error: Please run this script from the packages/mac-app directory${NC}"
    exit 1
fi

# Check if Xcode is installed
if ! command -v xcodebuild &> /dev/null; then
    echo -e "${RED}❌ Error: Xcode command line tools not found. Please install Xcode.${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 Build Configuration:${NC}"
echo "  • Project: $PROJECT_NAME"
echo "  • Scheme: $SCHEME_NAME"
echo "  • Configuration: $CONFIGURATION"
echo "  • Bundle ID: $BUNDLE_ID"
echo ""

# Clean up previous builds
echo -e "${YELLOW}🧹 Cleaning up previous builds...${NC}"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
mkdir -p "$PORTABLE_DIR"

# Clean the project
echo -e "${YELLOW}🔧 Cleaning Xcode project...${NC}"
xcodebuild clean \
    -project TimeTrack.xcodeproj \
    -scheme "$SCHEME_NAME" \
    -configuration "$CONFIGURATION"

# Build and archive the project
echo -e "${YELLOW}🔨 Building and archiving the project...${NC}"
xcodebuild archive \
    -project TimeTrack.xcodeproj \
    -scheme "$SCHEME_NAME" \
    -configuration "$CONFIGURATION" \
    -archivePath "$ARCHIVE_PATH" \
    -destination "generic/platform=macOS" \
    CODE_SIGN_IDENTITY="" \
    CODE_SIGNING_REQUIRED=NO \
    CODE_SIGNING_ALLOWED=NO

# Check if archive was created successfully
if [ ! -d "$ARCHIVE_PATH" ]; then
    echo -e "${RED}❌ Error: Archive creation failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Archive created successfully${NC}"

# Export the app without code signing
echo -e "${YELLOW}📦 Exporting app bundle...${NC}"
mkdir -p "$EXPORT_PATH"

# Create export options plist for development distribution
cat > "$BUILD_DIR/ExportOptions.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>development</string>
    <key>signingStyle</key>
    <string>manual</string>
    <key>stripSwiftSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
</dict>
</plist>
EOF

# Try to export with the plist first
if ! xcodebuild -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_PATH" \
    -exportOptionsPlist "$BUILD_DIR/ExportOptions.plist" 2>/dev/null; then

    echo -e "${YELLOW}⚠️  Standard export failed, copying directly from archive...${NC}"
    # If export fails, copy directly from the archive
    cp -R "$ARCHIVE_PATH/Products/Applications/$APP_NAME" "$EXPORT_PATH/"
fi

# Check if the app was exported
if [ ! -d "$EXPORT_PATH/$APP_NAME" ]; then
    echo -e "${RED}❌ Error: App export failed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ App exported successfully${NC}"

# Create portable package
echo -e "${YELLOW}📋 Creating portable package...${NC}"

# Copy the app to portable directory
cp -R "$EXPORT_PATH/$APP_NAME" "$PORTABLE_DIR/"

# Create a simple README for the portable version
cat > "$PORTABLE_DIR/README.txt" << EOF
TimeTrack Mac App - Portable Test Version
=========================================

This is a portable test version of TimeTrack that can be run on any compatible Mac.

System Requirements:
• macOS 13.0 or later (Intel and Apple Silicon Macs)
• Internet connection to access TimeTrack API

Installation:
1. Copy the TimeTrack.app to your Applications folder (optional)
2. Double-click TimeTrack.app to launch
3. If you see a security warning, right-click the app and select "Open"
4. Login with your TimeTrack credentials

Features:
• Native macOS timer with menu bar integration
• Real-time time tracking
• Project selection and management
• Earnings display
• Recent entries with restart functionality

Support:
For issues or questions, please contact the development team.

Built on: $(date)
Version: 1.0 (Portable Test Build)
EOF

# Create a simple install script
cat > "$PORTABLE_DIR/install.sh" << 'EOF'
#!/bin/bash

echo "TimeTrack Mac App - Installation Helper"
echo "======================================="

APP_NAME="TimeTrack.app"
INSTALL_PATH="/Applications/$APP_NAME"

if [ ! -d "$APP_NAME" ]; then
    echo "❌ Error: $APP_NAME not found in current directory"
    exit 1
fi

echo "Installing TimeTrack to Applications folder..."

# Remove existing installation
if [ -d "$INSTALL_PATH" ]; then
    echo "Removing existing installation..."
    rm -rf "$INSTALL_PATH"
fi

# Copy to Applications
cp -R "$APP_NAME" "/Applications/"

if [ -d "$INSTALL_PATH" ]; then
    echo "✅ TimeTrack installed successfully!"
    echo ""
    echo "You can now:"
    echo "1. Find TimeTrack in your Applications folder"
    echo "2. Launch it from Spotlight (Cmd+Space, type 'TimeTrack')"
    echo "3. Add it to your Dock for easy access"
    echo ""
    echo "Note: On first launch, you may need to right-click and select 'Open'"
    echo "      to bypass macOS security restrictions."
else
    echo "❌ Installation failed"
    exit 1
fi
EOF

chmod +x "$PORTABLE_DIR/install.sh"

# Get app info
APP_SIZE=$(du -sh "$PORTABLE_DIR/$APP_NAME" | cut -f1)
BUNDLE_VERSION=$(plutil -p "$PORTABLE_DIR/$APP_NAME/Contents/Info.plist" | grep CFBundleShortVersionString | cut -d'"' -f4)

echo ""
echo -e "${GREEN}🎉 Portable build completed successfully!${NC}"
echo "============================================="
echo -e "${BLUE}📍 Location:${NC} $PORTABLE_DIR"
echo -e "${BLUE}📦 App Size:${NC} $APP_SIZE"
echo -e "${BLUE}🏷️  Version:${NC} $BUNDLE_VERSION"
echo ""
echo -e "${YELLOW}📋 Package Contents:${NC}"
echo "  • TimeTrack.app - The main application"
echo "  • README.txt - Installation and usage instructions"
echo "  • install.sh - Optional installation helper script"
echo ""
echo -e "${YELLOW}🚀 Distribution Instructions:${NC}"
echo "1. Zip the entire 'portable' folder:"
echo "   cd $BUILD_DIR && zip -r TimeTrack-Portable.zip portable/"
echo ""
echo "2. Send the zip file to your test user"
echo ""
echo "3. Test user should:"
echo "   • Extract the zip file"
echo "   • Run install.sh (optional) or manually copy TimeTrack.app to Applications"
echo "   • Right-click TimeTrack.app and select 'Open' on first launch"
echo ""
echo -e "${GREEN}✅ Ready for distribution!${NC}"

# Create the zip file automatically
echo -e "${YELLOW}📦 Creating distribution zip...${NC}"
cd "$BUILD_DIR"
zip -r "TimeTrack-Portable-$(date +%Y%m%d-%H%M).zip" portable/ > /dev/null
echo -e "${GREEN}✅ Zip file created: $BUILD_DIR/TimeTrack-Portable-$(date +%Y%m%d-%H%M).zip${NC}"