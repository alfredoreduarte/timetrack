#!/bin/bash

# TimeTrack iOS App Store Build Script
# This script builds, signs, and prepares the iOS app for App Store submission

set -e  # Exit on any error

# Configuration
PROJECT_NAME="Timetrack"
WORKSPACE="${PROJECT_NAME}.xcworkspace"
PROJECT="${PROJECT_NAME}.xcodeproj"
SCHEME="Timetrack"
CONFIGURATION="Release"
BUNDLE_ID="com.timetrack.ios.Timetrack"

# Developer info (customize these)
DEVELOPER_TEAM_ID="YOUR_TEAM_ID"
APPLE_ID="your-apple-id@example.com"
APP_SPECIFIC_PASSWORD="your-app-specific-password"

# Paths
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${PROJECT_DIR}/build"
ARCHIVE_PATH="${BUILD_DIR}/${PROJECT_NAME}.xcarchive"
EXPORT_PATH="${BUILD_DIR}/AppStore"
IPA_PATH="${EXPORT_PATH}/${PROJECT_NAME}.ipa"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Xcode command line tools are installed
    if ! command -v xcodebuild &> /dev/null; then
        log_error "xcodebuild not found. Please install Xcode command line tools."
        exit 1
    fi
    
    # Check if we're in the correct directory
    if [ ! -f "${PROJECT}/project.pbxproj" ] && [ ! -d "$WORKSPACE" ]; then
        log_error "Not in the correct directory. Please run this script from the project root."
        exit 1
    fi
    
    # Check for workspace vs project
    if [ -d "$WORKSPACE" ]; then
        BUILD_TARGET="-workspace $WORKSPACE"
        log_info "Using workspace: $WORKSPACE"
    else
        BUILD_TARGET="-project $PROJECT"
        log_info "Using project: $PROJECT"
    fi
    
    log_success "Prerequisites check passed"
}

# Clean previous builds
clean_build() {
    log_info "Cleaning previous builds..."
    
    if [ -d "$BUILD_DIR" ]; then
        rm -rf "$BUILD_DIR"
    fi
    
    mkdir -p "$BUILD_DIR"
    mkdir -p "$EXPORT_PATH"
    
    # Clean Xcode build artifacts
    xcodebuild clean $BUILD_TARGET -scheme "$SCHEME" -configuration "$CONFIGURATION"
    
    # Clean derived data
    rm -rf ~/Library/Developer/Xcode/DerivedData/${PROJECT_NAME}-*
    
    log_success "Clean completed"
}

# Update version and build numbers
update_version_info() {
    log_info "Updating version information..."
    
    # Get current version info
    CURRENT_VERSION=$(xcodebuild -showBuildSettings $BUILD_TARGET -scheme "$SCHEME" -configuration "$CONFIGURATION" | grep MARKETING_VERSION | head -n 1 | sed 's/.*= //')
    CURRENT_BUILD=$(xcodebuild -showBuildSettings $BUILD_TARGET -scheme "$SCHEME" -configuration "$CONFIGURATION" | grep CURRENT_PROJECT_VERSION | head -n 1 | sed 's/.*= //')
    
    log_info "Current version: $CURRENT_VERSION ($CURRENT_BUILD)"
    
    # Option to increment build number
    if [ "$1" == "--increment-build" ]; then
        NEW_BUILD=$((CURRENT_BUILD + 1))
        
        # Update build number in project
        if [ -d "$WORKSPACE" ]; then
            # For workspace, update project file inside
            PROJECT_FILE=$(find . -name "*.xcodeproj" -type d | head -n 1)
            agvtool -noscm next-version -all -project "$PROJECT_FILE"
        else
            agvtool -noscm next-version -all
        fi
        
        log_info "Incremented build number to: $NEW_BUILD"
    fi
    
    log_success "Version information updated"
}

# Build and archive
build_archive() {
    log_info "Building and archiving ${PROJECT_NAME}..."
    
    xcodebuild archive \
        $BUILD_TARGET \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -archivePath "$ARCHIVE_PATH" \
        -derivedDataPath "${BUILD_DIR}/DerivedData" \
        -destination "generic/platform=iOS" \
        CODE_SIGN_IDENTITY="iPhone Distribution: ${DEVELOPER_TEAM_ID}" \
        PROVISIONING_PROFILE="" \
        CODE_SIGN_STYLE=Automatic \
        DEVELOPMENT_TEAM="$DEVELOPER_TEAM_ID" \
        OTHER_CODE_SIGN_FLAGS="--timestamp" \
        | tee "${BUILD_DIR}/build.log"
    
    if [ ! -d "$ARCHIVE_PATH" ]; then
        log_error "Archive failed. Check ${BUILD_DIR}/build.log for details."
        exit 1
    fi
    
    log_success "Archive created successfully"
}

# Create export options plist
create_export_options() {
    log_info "Creating export options..."
    
    cat > "${BUILD_DIR}/ExportOptions.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store</string>
    <key>teamID</key>
    <string>${DEVELOPER_TEAM_ID}</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>compileBitcode</key>
    <false/>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>signingCertificate</key>
    <string>iPhone Distribution</string>
    <key>destination</key>
    <string>upload</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>${BUNDLE_ID}</key>
        <string>TimeTrack iOS App Store</string>
    </dict>
    <key>manageAppVersionAndBuildNumber</key>
    <false/>
</dict>
</plist>
EOF
    
    log_success "Export options created"
}

# Export for App Store
export_app_store() {
    log_info "Exporting for App Store..."
    
    xcodebuild -exportArchive \
        -archivePath "$ARCHIVE_PATH" \
        -exportPath "$EXPORT_PATH" \
        -exportOptionsPlist "${BUILD_DIR}/ExportOptions.plist" \
        -allowProvisioningUpdates \
        | tee "${BUILD_DIR}/export.log"
    
    if [ ! -f "$IPA_PATH" ]; then
        log_error "Export failed. Check ${BUILD_DIR}/export.log for details."
        exit 1
    fi
    
    log_success "IPA exported for App Store"
}

# Validate app
validate_app() {
    log_info "Validating app..."
    
    # Basic file structure validation
    if [ ! -f "$IPA_PATH" ]; then
        log_error "IPA file not found"
        exit 1
    fi
    
    # Check IPA size (should be reasonable)
    IPA_SIZE=$(ls -lah "$IPA_PATH" | awk '{print $5}')
    log_info "IPA size: $IPA_SIZE"
    
    # Validate with App Store validation
    xcrun altool --validate-app \
        --type ios \
        --file "$IPA_PATH" \
        --username "$APPLE_ID" \
        --password "$APP_SPECIFIC_PASSWORD" \
        --verbose
    
    if [ $? -eq 0 ]; then
        log_success "App validation passed"
    else
        log_warning "Validation warnings detected. Check output above."
    fi
}

# Upload to App Store Connect (optional)
upload_to_app_store() {
    if [ "$1" == "--upload" ]; then
        log_info "Uploading to App Store Connect..."
        
        xcrun altool --upload-app \
            --type ios \
            --file "$IPA_PATH" \
            --username "$APPLE_ID" \
            --password "$APP_SPECIFIC_PASSWORD" \
            --verbose
        
        if [ $? -eq 0 ]; then
            log_success "Upload completed successfully"
            log_info "Check App Store Connect for processing status"
        else
            log_error "Upload failed"
            exit 1
        fi
    else
        log_info "Skipping upload. Use --upload flag to upload to App Store Connect"
        log_info "IPA ready for manual upload: $IPA_PATH"
    fi
}

# Generate build report
generate_report() {
    log_info "Generating build report..."
    
    REPORT_PATH="${BUILD_DIR}/build_report.txt"
    
    # Get app info from archive
    APP_PATH="${ARCHIVE_PATH}/Products/Applications/${PROJECT_NAME}.app"
    APP_VERSION=$(defaults read "${APP_PATH}/Info" CFBundleShortVersionString)
    BUILD_NUMBER=$(defaults read "${APP_PATH}/Info" CFBundleVersion)
    
    cat > "$REPORT_PATH" << EOF
TimeTrack iOS App Store Build Report
===================================
Date: $(date)
Configuration: $CONFIGURATION
Bundle ID: $BUNDLE_ID
Team ID: $DEVELOPER_TEAM_ID

Version Information:
- Marketing Version: $APP_VERSION
- Build Number: $BUILD_NUMBER

Files Generated:
- Archive: $ARCHIVE_PATH
- IPA: $IPA_PATH
- Build Log: ${BUILD_DIR}/build.log
- Export Log: ${BUILD_DIR}/export.log

App Information:
- IPA Size: $(ls -lah "$IPA_PATH" | awk '{print $5}')
- Target iOS Version: $(defaults read "${APP_PATH}/Info" MinimumOSVersion)
- Supported Devices: iPhone, iPad

Code Signing:
$(codesign -dv "$APP_PATH" 2>&1)

Next Steps:
1. Test the IPA on TestFlight or physical devices
2. Upload to App Store Connect (use --upload flag)  
3. Complete App Store Connect metadata
4. Submit for App Review
5. Monitor review status and respond to feedback

TestFlight Distribution:
- The generated IPA can be uploaded directly to TestFlight
- Ensure all team members have access for testing
- Test all features thoroughly before App Store submission

App Store Connect URLs:
- App Store Connect: https://appstoreconnect.apple.com
- TestFlight: https://testflight.apple.com
EOF
    
    log_success "Build report generated: $REPORT_PATH"
    cat "$REPORT_PATH"
}

# Create TestFlight export (alternative export method)
export_testflight() {
    if [ "$1" == "--testflight" ]; then
        log_info "Creating TestFlight export..."
        
        TESTFLIGHT_PATH="${BUILD_DIR}/TestFlight"
        mkdir -p "$TESTFLIGHT_PATH"
        
        cat > "${BUILD_DIR}/TestFlightExportOptions.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>${DEVELOPER_TEAM_ID}</string>
    <key>uploadBitcode</key>
    <false/>
    <key>uploadSymbols</key>
    <true/>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>destination</key>
    <string>export</string>
</dict>
</plist>
EOF
        
        xcodebuild -exportArchive \
            -archivePath "$ARCHIVE_PATH" \
            -exportPath "$TESTFLIGHT_PATH" \
            -exportOptionsPlist "${BUILD_DIR}/TestFlightExportOptions.plist"
        
        log_success "TestFlight export created in: $TESTFLIGHT_PATH"
    fi
}

# Main execution
main() {
    log_info "Starting TimeTrack iOS App Store build process..."
    
    check_prerequisites
    clean_build
    update_version_info "$@"
    build_archive
    create_export_options
    export_app_store
    validate_app
    export_testflight "$@"
    upload_to_app_store "$@"
    generate_report
    
    log_success "Build process completed successfully!"
    log_info "IPA is ready for App Store submission"
    
    # Show next steps
    echo ""
    log_info "Next Steps:"
    echo "1. Test the app thoroughly on devices or TestFlight"
    echo "2. Complete App Store Connect metadata (screenshots, description, etc.)"
    echo "3. Submit for App Store Review"
    echo "4. Monitor review status in App Store Connect"
}

# Script usage
usage() {
    echo "Usage: $0 [options]"
    echo "Options:"
    echo "  --upload              Upload to App Store Connect after building"
    echo "  --testflight          Create TestFlight export in addition to App Store"
    echo "  --increment-build     Automatically increment build number"
    echo "  --help, -h           Show this help message"
    echo ""
    echo "Before running:"
    echo "1. Update DEVELOPER_TEAM_ID in this script"
    echo "2. Update APPLE_ID and APP_SPECIFIC_PASSWORD for upload"
    echo "3. Ensure provisioning profiles are installed"
    echo "4. Ensure certificates are installed in Keychain"
    echo "5. Test the app thoroughly on devices"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Build only"
    echo "  $0 --increment-build                  # Build with auto-incremented build number"
    echo "  $0 --testflight --increment-build     # Build for TestFlight with incremented build"
    echo "  $0 --upload --increment-build         # Build, increment, and upload to App Store"
}

# Handle arguments
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    usage
    exit 0
fi

# Run main function with all arguments
main "$@"