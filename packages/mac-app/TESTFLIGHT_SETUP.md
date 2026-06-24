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

---

## Installing a TestFlight build locally

TestFlight for Mac apps requires Apple's dedicated **TestFlight** Mac app (separate from iOS TestFlight, free on the Mac App Store). End-to-end install flow once a build is uploaded:

1. Wait for ASC to finish processing the build. First Mac build for a brand-new app routinely takes 15–30 minutes to process, even after fastlane reports the upload succeeded. Watch its status under TestFlight → macOS → Builds.
2. Answer (or pre-answer in code) the **export compliance** question — see the gotcha section below.
3. In **Internal Testing → \<your group\> → Builds**, click **+** and attach the build. The group does not auto-pull builds; you have to attach each one once (subsequent uploads do auto-roll into existing groups).
4. Open the TestFlight Mac app, sign in with the Apple ID added as an internal tester, and click **Install** next to TimeTrack. Installs to `/Applications/TimeTrack.app` and auto-updates on every new TestFlight build.

> Adding internal testers requires an App Store Connect role of **App Manager**, **Admin**, or **Account Holder** on the Apple team. Developer-only roles cannot manage TestFlight testers. If your user picker is empty, check **Users and Access** in ASC.

---

## Gotchas hit and fixed (state as of 2026-06-24)

Everything in this section is already wired up in the repo — the gotchas are documented for context (and so the iOS pipeline can pre-emptively avoid the same traps).

### Info.plist keys ASC requires (PRs #146, #148)

altool / TestFlight validation now requires two Info.plist keys for every Mac App Store upload. Missing either silently lands the build in "Missing Compliance" or rejects the upload with a 409. Both are handled in `TimeTrack.xcodeproj/project.pbxproj`:

| Key | How it's set | Why it can't be set the obvious way |
|---|---|---|
| `LSApplicationCategoryType` | `INFOPLIST_KEY_LSApplicationCategoryType = "public.app-category.productivity"` on Debug+Release | (none — the build setting works for string values) |
| `ITSAppUsesNonExemptEncryption` | **Run Script build phase "Inject ITSAppUsesNonExemptEncryption"** that uses `PlistBuddy` to write `false` into the built `.app`'s `Info.plist` | Xcode silently **drops boolean `NO`** from `INFOPLIST_KEY_*` settings during plist synthesis — the obvious `INFOPLIST_KEY_ITSAppUsesNonExemptEncryption = NO` ships an `.app` without the key. ASC's web UI also has no fallback form for accounts below App Manager role. |

The Run Script phase has four moving parts you must keep together if anyone edits it:

1. **Phase order**: must be the last phase in `buildPhases`, after Sources/Frameworks/Resources, so the synthesized `Info.plist` already exists and the implicit codesign step still happens *after* the mutation.
2. **Sandbox allowlist**: `inputPaths` and `outputPaths` both list `$(TARGET_BUILD_DIR)/$(INFOPLIST_PATH)`. Without this, `ENABLE_USER_SCRIPT_SANDBOXING = YES` (Xcode 15+ default) denies the write and PlistBuddy silently no-ops — the same silent-fail mode that hit the first attempted fix.
3. **Virtual stamp output**: `outputPaths` also lists `$(DERIVED_FILE_DIR)/ITSAppUsesNonExemptEncryption.stamp`. Xcode 26 rejects builds with "mutable output but no other virtual output node" when input == output; the stamp gives the dependency graph a non-self-referential node.
4. **Read-back verification**: the script `Print`s the key after writing and hard-exits with a non-zero status if the value isn't `false`. Catches any future sandbox/path regression loudly instead of shipping another silent-fail build.

### CI pipeline quirks (Fastfile + workflow)

These are already baked in but document why the Fastfile looks the way it does:

- **`CODE_SIGN_STYLE = Manual` override at build time.** The pbxproj stays on `Automatic` so local Xcode dev works against your Apple ID. The Fastfile calls `update_code_signing_settings` to flip to Manual just before `build_mac_app`, pointing at the Match-managed `Apple Distribution` cert and `match AppStore com.orbitalabworks.timetrack macos` profile. Removing this override breaks CI with "No signing certificate 'Mac Development' found".
- **`output_name: "TimeTrack"` (no `.pkg` suffix).** `gym` appends `.pkg`. If you write `"TimeTrack.pkg"` you end up looking for `TimeTrack.pkg.pkg`.
- **`pkg: lane_context[SharedValues::PKG_OUTPUT_PATH]` in `upload_to_testflight`.** `File.expand_path("build/TimeTrack.pkg")` resolves relative to `packages/mac-app/fastlane/`, not `packages/mac-app/`. Use the lane context value instead.
- **`.p8` materialized to disk** in the GH Actions step `Materialize App Store Connect API key`. altool can't read the in-memory `.p8` fastlane writes via `is_key_content_base64: true`; it reliably reads from `~/.appstoreconnect/private_keys/AuthKey_<id>.p8`. The workflow base64-decodes the secret to that path and exports `ASC_API_KEY_PATH`; the Fastfile prefers `key_filepath` when that env var is set.
- **No `changelog:` on `upload_to_testflight`.** Passing `changelog:` forces fastlane to wait for the build to appear in ASC's build list (overriding `skip_waiting_for_build_processing: true`). For a first upload of a new app that wait is 10–30 min and trips the 60-min job cap. Release notes get set from the ASC UI, or via a separate `set_changelog` lane in the future.

### Apple's MAS validation tightened twice between 2026-06-10 and 2026-06-23

Both `LSApplicationCategoryType` and `ITSAppUsesNonExemptEncryption` were unenforced when the first successful Mac TestFlight build went up on 2026-06-10. By 2026-06-23 both were required. Treat the gotcha section as a moving target — Apple may add another required key without warning.

---

## Sibling state: iOS pipeline

iOS is paused waiting on Pablo (Account Holder) to register two extension bundle IDs and the App Group. Everything else is set up. See `packages/ios-app/TESTFLIGHT_SETUP.md` for the resumption checklist — it includes a preemptive port of the Mac gotchas above so the iOS pipeline doesn't re-derive them.
