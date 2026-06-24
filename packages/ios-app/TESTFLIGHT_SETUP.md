# TimeTrack iOS — TestFlight Pipeline Setup

End state: clicking **Run workflow** on `iOS → TestFlight` in GitHub Actions builds the iOS app (with the watchOS companion and Live Activity extension) and uploads it to TestFlight. No further steps. This document is the one-time bootstrap to get there.

Apple team: **Orbital Labworks, LLC** (`HL8D756J57`).
Bundle IDs: `com.orbitalabworks.timetrack`, `.watchkitapp`, `.liveactivity`.
App Group: `group.com.timetrack.shared`.

---

## Step 1 — Pablo (Account Holder)

Forward the message at `PABLO-BOOTSTRAP-MESSAGE.md` (repo root, gitignored). He owes you:

1. Acceptance of the updated Apple Developer Program License Agreement at <https://developer.apple.com/account>.
2. An App Store Connect **API Key** (role: **App Manager**, "Access to Cloud Managed Distribution Certificate" enabled). He sends you the `.p8` file, the **Key ID**, and the **Issuer ID**.

Optional, deferrable: EU trader status filing (only if shipping to the EU App Store).

Once you have the API key, save the three values somewhere safe — Apple does not let the `.p8` be re-downloaded.

## Step 2 — Register identifiers (via API, no UI needed)

With the API key in hand, register the bundle IDs and the app group. Fastlane's `produce` and `cert/sigh` modules can do this, but the simplest path is the App Store Connect API. From your machine:

```bash
# Set these once in your shell or in packages/ios-app/fastlane/.env
export APP_STORE_CONNECT_API_KEY_ID="<key id from Pablo>"
export APP_STORE_CONNECT_API_KEY_ISSUER_ID="<issuer id from Pablo>"
export APP_STORE_CONNECT_API_KEY_CONTENT="$(base64 -i /path/to/AuthKey_XXXXXXXXXX.p8)"
```

Then register each bundle ID. From `packages/ios-app`:

```bash
bundle install
bundle exec fastlane produce -u "" \
  --app_identifier com.orbitalabworks.timetrack \
  --app_name "TimeTrack" \
  --skip_itc \
  --app_group group.com.timetrack.shared

bundle exec fastlane produce -u "" \
  --app_identifier com.orbitalabworks.timetrack.watchkitapp \
  --skip_itc

bundle exec fastlane produce -u "" \
  --app_identifier com.orbitalabworks.timetrack.liveactivity \
  --skip_itc
```

`--skip_itc` registers the App ID under the Developer Portal but doesn't create an App Store Connect record (next step). The `--app_group` flag on the main app links the shared group; if `produce` doesn't accept it on your fastlane version, link the group via `fastlane spaceship`'s capabilities API or the App Store Connect web UI.

## Step 3 — Create the iOS app record in App Store Connect

```bash
bundle exec fastlane produce \
  --app_identifier com.orbitalabworks.timetrack \
  --app_name "TimeTrack" \
  --language "en-US" \
  --skip_devcenter
```

`--skip_devcenter` is the inverse: we already registered the App ID in step 2, so this only creates the App Store Connect record. SKU defaults to the bundle ID, which is fine.

## Step 4 — Create the `timetrack-signing` repo

```bash
gh repo create alfredoreduarte/timetrack-signing --private --description "Fastlane Match storage for TimeTrack signing assets" --confirm
```

Clone it locally somewhere (Match will populate it):

```bash
git clone git@github.com:alfredoreduarte/timetrack-signing.git ../timetrack-signing
```

## Step 5 — Create an SSH deploy key for the signing repo

GitHub Actions reads from the signing repo using a deploy key (read-only SSH key scoped to that one repo).

```bash
ssh-keygen -t ed25519 -f ~/.ssh/timetrack_signing_deploy -C "timetrack-signing deploy key" -N ""
# Add the public key as a deploy key on github.com/alfredoreduarte/timetrack-signing
gh api repos/alfredoreduarte/timetrack-signing/keys -f title="GitHub Actions" -f key="$(cat ~/.ssh/timetrack_signing_deploy.pub)" -F read_only=true
```

Keep `~/.ssh/timetrack_signing_deploy` (the private key) for step 7. Make sure your local `~/.ssh/config` lets you push to the signing repo with your normal SSH key — match will use whatever your local SSH agent has.

## Step 6 — Seed Match with App Store distribution signing

This is the only step that touches Apple to create the production cert and profiles. From `packages/ios-app`:

```bash
# Pick a strong MATCH_PASSWORD (used to symmetrically encrypt the signing repo contents).
# Save it to a password manager — you'll add it to GitHub Secrets in step 7.
export MATCH_PASSWORD="<strong random password>"

bundle exec fastlane ios match_setup
```

This runs `match appstore` for all three bundle IDs and pushes the encrypted artifacts to `timetrack-signing`. After it finishes, peek at the repo — there should be a `certs/distribution/` directory and `profiles/appstore/`.

If you ever lose the password, run `bundle exec fastlane match nuke distribution` to wipe everything and re-run `match_setup`.

## Step 7 — Add GitHub Actions Secrets

Add these on `github.com/alfredoreduarte/timetrack` → Settings → Secrets and variables → Actions:

| Secret name | Value |
|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` | Key ID from Pablo (10-char alphanumeric) |
| `APP_STORE_CONNECT_API_KEY_ISSUER_ID` | Issuer ID from Pablo (UUID) |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | `base64 -i /path/to/AuthKey_XXXXXXXXXX.p8` — single-line base64 |
| `MATCH_PASSWORD` | The strong password from step 6 |
| `MATCH_KEYCHAIN_PASSWORD` | Any strong random string. CI's temp keychain password — never reused outside the runner. |
| `MATCH_SSH_PRIVATE_KEY` | Contents of `~/.ssh/timetrack_signing_deploy` (the **private** key, full PEM body including `-----BEGIN…END-----` lines) |

Quick add via gh CLI from this machine:

```bash
gh secret set APP_STORE_CONNECT_API_KEY_ID --body "<key id>"
gh secret set APP_STORE_CONNECT_API_KEY_ISSUER_ID --body "<issuer id>"
gh secret set APP_STORE_CONNECT_API_KEY_CONTENT --body "$(base64 -i /path/to/AuthKey_XXXXXXXXXX.p8)"
gh secret set MATCH_PASSWORD --body "$(pbpaste)"   # paste from password manager
gh secret set MATCH_KEYCHAIN_PASSWORD --body "$(openssl rand -hex 32)"
gh secret set MATCH_SSH_PRIVATE_KEY < ~/.ssh/timetrack_signing_deploy
```

## Step 8 — Ship a build

1. Go to <https://github.com/alfredoreduarte/timetrack/actions/workflows/build-ios-testflight.yml>
2. Click **Run workflow**.
3. Optionally fill in **Release notes** (shown in TestFlight).
4. Run.

The first run takes ~15 minutes (cold caches). Subsequent runs are ~8 minutes. When it finishes, check App Store Connect → TestFlight; the build appears under "Processing" then moves to "Ready to Submit" once Apple's pipeline finishes its scan.

---

## Sibling: macOS pipeline (already shipping)

The macOS pipeline (`packages/mac-app`) reuses the same:
- Apple team (`HL8D756J57`)
- App Store Connect API Key (and so the same three secrets above)
- Match storage repo (`timetrack-signing`) — Match keeps macOS and iOS profiles separate inside the same repo
- `MATCH_PASSWORD`, `MATCH_KEYCHAIN_PASSWORD`, `MATCH_SSH_PRIVATE_KEY` secrets

What's different per platform:
- The same `com.orbitalabworks.timetrack` bundle ID — **Universal Purchase**, one ASC app record covers iOS + macOS, customers cross-buy. (Earlier iterations used a `.mac` suffix; that's gone.)
- `match` is invoked with `macos` platform + `additional_cert_types: ["mac_installer_distribution"]` (Mac App Store needs a separate installer cert).
- A separate workflow file: `.github/workflows/build-mac-testflight.yml`.

The Mac side has hit four MAS-specific gotchas that iOS will also hit on its first upload — see "Gotchas to anticipate when iOS unblocks" below before retriggering the iOS workflow.

---

## Current iOS pipeline state (as of 2026-06-24)

**Paused.** All infrastructure is set up except the items below. Resume when Pablo is available.

### Blockers (require the Account Holder)

1. **Register two extension bundle IDs** in the developer portal under the Orbital Labworks team:
   - `com.orbitalabworks.timetrack.watchkitapp`
   - `com.orbitalabworks.timetrack.liveactivity`
2. **Register the App Group** `group.com.timetrack.shared` and tick it as a capability on all three iOS App IDs (main app + the two extensions). The watchOS app and Live Activity extension need it to share Keychain auth state with the main app.

The main app's `com.orbitalabworks.timetrack` App ID is already registered (shared with macOS via Universal Purchase).

### Resumption checklist (when Pablo is done)

1. Confirm all three App IDs exist and have the App Group ticked under their Capabilities tab.
2. `cd packages/ios-app && bundle exec fastlane ios match_setup` — seeds iOS distribution certs and profiles for all three bundle IDs. Requires the four env vars from `~/.appstoreconnect/match-passwords.env` plus the three `APP_STORE_CONNECT_API_KEY_*` env vars.
3. **Apply the preemptive Info.plist fixes from the Mac side** to the iOS target's `project.pbxproj` (see next section). Skipping this guarantees the first iOS upload lands in the same Missing Compliance / 409 validation traps the Mac side hit on builds 1.0 (1) through 1.0 (3).
4. Trigger the `iOS → TestFlight` workflow on main. Job should complete in ~10 min.

---

## Gotchas to anticipate when iOS unblocks

The Mac pipeline went through four sequential failures between 2026-06-10 and 2026-06-23 because Apple tightened MAS validation rules and Xcode quietly drops certain build settings. Apply the same fixes to the iOS `project.pbxproj` *before* the first iOS upload — see `packages/mac-app/TESTFLIGHT_SETUP.md` "Gotchas hit and fixed" for the full story; brief version:

1. **`LSApplicationCategoryType` is required.** Add `INFOPLIST_KEY_LSApplicationCategoryType` (likely `"public.app-category.productivity"` for iOS too) to Debug + Release configs of the main app target.

2. **`ITSAppUsesNonExemptEncryption` is required.** Xcode silently strips boolean `NO` from `INFOPLIST_KEY_*` settings during plist synthesis, so the obvious approach won't work. The Mac side uses a Run Script build phase that calls `PlistBuddy` to inject the key into the built `.app`'s `Info.plist`. Port that phase to the iOS target verbatim (UUID can be reused; phase ordering, `inputPaths`/`outputPaths` sandbox allowlist, virtual stamp output, and read-back verification all transfer 1:1). The Mac Fastfile already handles three targets (main app + Watch + Live Activity extension) for `update_code_signing_settings`; the Run Script only needs to run on the main app target (the extensions inherit `ITSAppUsesNonExemptEncryption` from the bundling app per Apple's docs, but verify).

3. **`CODE_SIGN_STYLE = Manual` override at build time.** Already in place in the iOS Fastfile for all three shipping targets (Timetrack, Watch app, LiveActivity extension). Don't remove it — the pbxproj stays Automatic for local dev, the Fastfile flips to Manual for CI.

4. **No `changelog:` on `upload_to_testflight`.** Already removed. Don't re-add it (60-min job-cap risk on first uploads of a new app).

The Mac doc also covers `output_name` without `.pkg`, the `lane_context` pkg path, and the `.p8` materialization step — those are already handled in the iOS workflow file too, but the same caveats apply if anyone refactors.

---

## Maintenance

- **Certs/profiles expire** annually. Fastlane Match renews them automatically when CI runs after expiry (it detects and re-issues). If a build fails with a signing error, run `bundle exec fastlane ios match_setup` locally to force a refresh.
- **API key rotation.** If Pablo regenerates the key, update the three `APP_STORE_CONNECT_API_KEY_*` secrets. Nothing else changes.
- **Adding TestFlight testers.** Done in App Store Connect → TestFlight → Internal/External Testers. Out of scope here.
- **Build number** auto-increments based on TestFlight's latest. The `MARKETING_VERSION` in the pbxproj stays under your control — bump it (e.g. `1.0` → `1.1`) when you want a new visible version.
- **Local development.** After the bootstrap, you'll need to open Xcode → Settings → Accounts and make sure the Orbital Labworks team appears under your Apple ID. Then Xcode can sign local debug builds against the new bundle IDs via your Developer-role membership.
