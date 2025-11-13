#!/bin/bash

# TimeTrack macOS App Store Build Script
# This script builds, signs, and prepares the macOS app for App Store submission

set -e  # Exit on any error

# Configuration
PROJECT_NAME="TimeTrack"
SCHEME="TimeTrack"
CONFIGURATION="Release"
BUNDLE_ID="com.timetrack.mac.TimeTrack"

# Developer info (customize these)
DEVELOPER_TEAM_ID="YOUR_TEAM_ID"
APPLE_ID="your-apple-id@example.com"
APP_SPECIFIC_PASSWORD="your-app-specific-password"

# Paths
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${PROJECT_DIR}/build"
ARCHIVE_PATH="${BUILD_DIR}/${PROJECT_NAME}.xcarchive"
EXPORT_PATH="${BUILD_DIR}/AppStore"
APP_PATH="${EXPORT_PATH}/${PROJECT_NAME}.app"

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
    
    # Check if we're in the right directory
    if [ ! -f "${PROJECT_NAME}.xcodeproj/project.pbxproj" ]; then
        log_error "Not in the correct directory. Please run this script from the project root."
        exit 1
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
    xcodebuild clean -project "${PROJECT_NAME}.xcodeproj" -scheme "$SCHEME" -configuration "$CONFIGURATION"
    
    log_success "Clean completed"
}

# Build and archive
build_archive() {
    log_info "Building and archiving ${PROJECT_NAME}..."
    
    xcodebuild archive \
        -project "${PROJECT_NAME}.xcodeproj" \
        -scheme "$SCHEME" \
        -configuration "$CONFIGURATION" \
        -archivePath "$ARCHIVE_PATH" \
        -derivedDataPath "${BUILD_DIR}/DerivedData" \
        CODE_SIGN_IDENTITY="3rd Party Mac Developer Application: ${DEVELOPER_TEAM_ID}" \
        PROVISIONING_PROFILE="" \
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
    <string>manual</string>
    <key>signingCertificate</key>
    <string>3rd Party Mac Developer Application</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>${BUNDLE_ID}</key>
        <string>TimeTrack macOS App Store</string>
    </dict>
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
        | tee "${BUILD_DIR}/export.log"
    
    if [ ! -d "$APP_PATH" ]; then
        log_error "Export failed. Check ${BUILD_DIR}/export.log for details."
        exit 1
    fi
    
    log_success "App exported for App Store"
}

# Validate app
validate_app() {
    log_info "Validating app..."
    
    # Check code signing
    codesign --verify --deep --strict --verbose=2 "$APP_PATH"
    if [ $? -ne 0 ]; then
        log_error "Code signing validation failed"
        exit 1
    fi
    
    # Check app structure
    if [ ! -f "${APP_PATH}/Contents/MacOS/${PROJECT_NAME}" ]; then
        log_error "App binary not found"
        exit 1
    fi
    
    # Check entitlements
    codesign -d --entitlements :- "$APP_PATH" > "${BUILD_DIR}/entitlements_actual.plist"
    
    log_success "App validation completed"
}

# Create installer package
create_installer() {
    log_info "Creating installer package..."
    
    PKG_PATH="${EXPORT_PATH}/${PROJECT_NAME}.pkg"
    
    productbuild --component "$APP_PATH" /Applications \
        --sign "3rd Party Mac Developer Installer: ${DEVELOPER_TEAM_ID}" \
        "$PKG_PATH"
    
    if [ ! -f "$PKG_PATH" ]; then
        log_error "Installer creation failed"
        exit 1
    fi
    
    log_success "Installer package created: $PKG_PATH"
}

# Upload to App Store Connect (optional)
upload_to_app_store() {
    if [ "$1" == "--upload" ]; then
        log_info "Uploading to App Store Connect..."
        
        xcrun altool --upload-app \
            --type macos \
            --file "${EXPORT_PATH}/${PROJECT_NAME}.pkg" \
            --username "$APPLE_ID" \
            --password "$APP_SPECIFIC_PASSWORD" \
            --verbose
        
        if [ $? -eq 0 ]; then
            log_success "Upload completed successfully"
        else
            log_error "Upload failed"
            exit 1
        fi
    else
        log_info "Skipping upload. Use --upload flag to upload to App Store Connect"
        log_info "Package ready for manual upload: ${EXPORT_PATH}/${PROJECT_NAME}.pkg"
    fi
}

# Generate build report
generate_report() {
    log_info "Generating build report..."
    
    REPORT_PATH="${BUILD_DIR}/build_report.txt"
    
    cat > "$REPORT_PATH" << EOF
TimeTrack macOS App Store Build Report
=====================================
Date: $(date)
Configuration: $CONFIGURATION
Bundle ID: $BUNDLE_ID
Team ID: $DEVELOPER_TEAM_ID

Files Generated:
- Archive: $ARCHIVE_PATH
- App: $APP_PATH
- Package: ${EXPORT_PATH}/${PROJECT_NAME}.pkg
- Build Log: ${BUILD_DIR}/build.log
- Export Log: ${BUILD_DIR}/export.log

App Information:
- Bundle Version: $(defaults read "${APP_PATH}/Contents/Info" CFBundleVersion)
- Version String: $(defaults read "${APP_PATH}/Contents/Info" CFBundleShortVersionString)
- App Size: $(du -sh "$APP_PATH" | cut -f1)

Code Signing:
$(codesign -dv "$APP_PATH" 2>&1)

Next Steps:
1. Test the app thoroughly
2. Upload to App Store Connect (use --upload flag)
3. Submit for App Review
4. Monitor review status
EOF
    
    log_success "Build report generated: $REPORT_PATH"
    cat "$REPORT_PATH"
}

# Main execution
main() {
    log_info "Starting TimeTrack macOS App Store build process..."
    
    check_prerequisites
    clean_build
    build_archive
    create_export_options
    export_app_store
    validate_app
    create_installer
    upload_to_app_store "$@"
    generate_report
    
    log_success "Build process completed successfully!"
    log_info "App is ready for App Store submission"
}

# Script usage
usage() {
    echo "Usage: $0 [--upload]"
    echo "  --upload    Upload to App Store Connect after building"
    echo ""
    echo "Before running:"
    echo "1. Update DEVELOPER_TEAM_ID in this script"
    echo "2. Update APPLE_ID and APP_SPECIFIC_PASSWORD for upload"
    echo "3. Ensure provisioning profiles are installed"
    echo "4. Ensure certificates are installed in Keychain"
}

# Handle arguments
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    usage
    exit 0
fi

# Run main function with all arguments
main "$@"