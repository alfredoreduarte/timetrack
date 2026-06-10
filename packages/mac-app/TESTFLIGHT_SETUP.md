# TimeTrack macOS — TestFlight Pipeline Setup

End state: clicking **Run workflow** on `macOS → TestFlight` in GitHub Actions builds the Mac app, signs the `.pkg`, and uploads it to TestFlight.

Apple team: **Orbital Labworks, LLC** (`HL8D756J57`).
Bundle ID: `com.orbitalabworks.timetrack.mac`.

> Most of the bootstrap is shared with the iOS pipeline. **Do the iOS bootstrap first** (`packages/ios-app/TESTFLIGHT_SETUP.md`) — this doc only calls out the macOS-specific deltas.

---

## Shared from iOS setup

These come from the iOS setup and are reused as-is for macOS — no extra work:

- Pablo's two asks (license agreement, API key) — same Apple Developer team covers both apps.
- The `timetrack-signing` Match storage repo — Match keeps macOS and iOS profiles in separate subdirectories of the same repo.
- The SSH deploy key on the signing repo — same key, same secret.
- All six GitHub Actions secrets — `APP_STORE_CONNECT_API_KEY_*`, `MATCH_PASSWORD`, `MATCH_KEYCHAIN_PASSWORD`, `MATCH_SSH_PRIVATE_KEY`. The Mac workflow reads the same secret names.

## macOS-specific steps

### 1. Register the macOS bundle ID

From `packages/mac-app`:

```bash
bundle exec fastlane produce -u "" \
  --app_identifier com.orbitalabworks.timetrack.mac \
  --app_name "TimeTrack" \
  --skip_itc \
  --platform osx
```

`--platform osx` (Apple's legacy name for macOS in the API) registers a macOS App ID rather than an iOS one — important so the right capabilities show up. Sandboxing and Network (client) are auto-enabled because the entitlements file already declares them.

### 2. Create the macOS app record in App Store Connect

```bash
bundle exec fastlane produce \
  --app_identifier com.orbitalabworks.timetrack.mac \
  --app_name "TimeTrack" \
  --platform osx \
  --language "en-US" \
  --skip_devcenter
```

If App Store Connect rejects the SKU as duplicate (because the iOS app reserved it), pass an explicit `--sku com.orbitalabworks.timetrack.mac`.

### 3. Seed Match with Mac App Store distribution signing

macOS App Store builds need **two** certificates (Apple's quirk):
- 3rd Party Mac Developer Application
- 3rd Party Mac Developer Installer

Match handles both — that's what `additional_cert_types: ["mac_installer_distribution"]` in the Mac `Matchfile` does. From `packages/mac-app`:

```bash
export MATCH_PASSWORD="<same password as iOS bootstrap>"
bundle exec fastlane mac match_setup
```

After it completes, the `timetrack-signing` repo will contain two new subtrees alongside the iOS ones — something like `certs/distribution/<TEAM>/<sha>.cer` for the application cert and an installer cert in a sibling path, plus `profiles/appstore/macos/...` for the macOS provisioning profile.

### 4. (No new GitHub Secrets needed)

The `macOS → TestFlight` workflow reads the same secret names the iOS workflow uses. If iOS is already shipping, macOS just works once the bundle ID is registered and Match is seeded.

### 5. Ship a build

1. <https://github.com/alfredoreduarte/timetrack/actions/workflows/build-mac-testflight.yml>
2. **Run workflow**, optionally with release notes.
3. Wait ~10 min. The build appears in App Store Connect → My Apps → TimeTrack (Mac) → TestFlight.

> Note: Mac App Store apps go through a slightly different Apple review path than iOS — first TestFlight build typically processes in 5–15 minutes; later notarization/processing can take up to an hour. This is normal.

---

## Maintenance

- **Apple cert quirk.** Mac installer certificates expire on a slightly different cadence from application certificates. If `upload_to_testflight` fails with `unable to find installer signing identity`, rerun `bundle exec fastlane mac match_setup` to refresh.
- **Catalyst.** This app is native AppKit + SwiftUI, not Mac Catalyst, so it ships from the Mac project independently of the iOS one. The two share nothing at build time.
- **Build numbers.** Auto-incremented from TestFlight's latest macOS build, independently of the iOS app's build number.
