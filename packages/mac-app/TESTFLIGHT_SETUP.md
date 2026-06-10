# TimeTrack macOS — TestFlight Pipeline Setup

End state: clicking **Run workflow** on `macOS → TestFlight` in GitHub Actions builds the Mac app, signs the `.pkg`, and uploads it to TestFlight.

Apple team: **Orbital Labworks, LLC** (`HL8D756J57`).
Bundle ID: `com.orbitalabworks.timetrack` — **shared with the iOS app via Universal Purchase**. One App Store record covers both platforms; iOS customers get the Mac app free and vice versa.

> Most of the bootstrap is shared with the iOS pipeline. **Do the iOS bootstrap first** (`packages/ios-app/TESTFLIGHT_SETUP.md`) — this doc only calls out the macOS-specific deltas.

---

## Shared from iOS setup

These come from the iOS setup and are reused as-is for macOS — no extra work:

- Pablo's two asks (license agreement, API key) — same Apple Developer team covers both apps.
- **The `com.orbitalabworks.timetrack` App ID identifier** — already registered for iOS. macOS reuses the same identifier (Universal Purchase). The only extra requirement is that **App Sandbox** is enabled on that App ID's capabilities — required for Mac App Store distribution. If it's missing, edit the identifier in the developer portal and tick App Sandbox.
- **The App Store Connect app record** — same TimeTrack record as iOS, with macOS added as a sibling platform.
- The `timetrack-signing` Match storage repo — Match keeps macOS and iOS profiles in separate subdirectories of the same repo.
- The SSH deploy key on the signing repo — same key, same secret.
- All six GitHub Actions secrets — `APP_STORE_CONNECT_API_KEY_*`, `MATCH_PASSWORD`, `MATCH_KEYCHAIN_PASSWORD`, `MATCH_SSH_PRIVATE_KEY`. The Mac workflow reads the same secret names.

## macOS-specific steps

### 1. Enable macOS on the existing TimeTrack ASC record

In App Store Connect, open the existing **TimeTrack** app, then add macOS as a supported platform. Apple's UI surfaces this either as:

- A **+ macOS App** option in the app's left sidebar, or
- An auto-prompt after the first Mac TestFlight upload — Apple detects the matching bundle ID and offers to enable Universal Purchase

Either path works. If neither is obvious in the UI, skip ahead — uploading the first build typically triggers the prompt.

### 2. Seed Match with Mac App Store distribution signing

macOS App Store builds need **two** certificates (Apple's quirk):
- 3rd Party Mac Developer Application
- 3rd Party Mac Developer Installer

Match handles both — that's what `additional_cert_types: ["mac_installer_distribution"]` in the Mac `Matchfile` does. From `packages/mac-app`:

```bash
export MATCH_PASSWORD="<same password as iOS bootstrap>"
bundle exec fastlane mac match_setup
```

After it completes, the `timetrack-signing` repo will contain new subtrees alongside the iOS ones — something like `certs/distribution/<TEAM>/<sha>.cer` for the application cert and an installer cert in a sibling path, plus `profiles/appstore/macos/...` for the macOS provisioning profile.

Match keys provisioning profiles by `(bundle_id, platform)`, so sharing the bundle ID with iOS is fine — the macOS profile is stored separately.

### 3. (No new GitHub Secrets needed)

The `macOS → TestFlight` workflow reads the same secret names the iOS workflow uses. If iOS is already shipping, macOS just works once Match is seeded for macOS.

### 4. Ship a build

1. <https://github.com/alfredoreduarte/timetrack/actions/workflows/build-mac-testflight.yml>
2. **Run workflow**, optionally with release notes.
3. Wait ~10 min. The build appears in App Store Connect → My Apps → TimeTrack → TestFlight → **macOS** tab.

> Note: Mac App Store apps go through a slightly different Apple review path than iOS — first TestFlight build typically processes in 5–15 minutes; later notarization/processing can take up to an hour. This is normal.

---

## Maintenance

- **Apple cert quirk.** Mac installer certificates expire on a slightly different cadence from application certificates. If `upload_to_testflight` fails with `unable to find installer signing identity`, rerun `bundle exec fastlane mac match_setup` to refresh.
- **Catalyst.** This app is native AppKit + SwiftUI, not Mac Catalyst. It shares the iOS bundle ID for Universal Purchase but is built from the Mac Xcode project as a separate native binary.
- **Build numbers.** Auto-incremented from TestFlight's latest macOS build, independently of the iOS app's build number — TestFlight tracks build numbers per platform.
