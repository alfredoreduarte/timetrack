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

## Repeat for macOS

The macOS pipeline (`packages/mac-app`) reuses the same:
- Apple team (`HL8D756J57`)
- App Store Connect API Key (and so the same three secrets above)
- Match storage repo (`timetrack-signing`) — Match keeps macOS and iOS profiles separate inside the same repo
- `MATCH_PASSWORD`, `MATCH_KEYCHAIN_PASSWORD`, `MATCH_SSH_PRIVATE_KEY` secrets

What's different per platform:
- Bundle ID (`com.orbitalabworks.timetrack.mac`)
- `match` is invoked with `macos` platform (see the Mac Fastfile)
- A separate workflow file: `.github/workflows/build-mac-testflight.yml`

That work lives in PR B. Once both PRs are merged and step 6 is run for `mac`, you'll have one button per platform.

---

## Maintenance

- **Certs/profiles expire** annually. Fastlane Match renews them automatically when CI runs after expiry (it detects and re-issues). If a build fails with a signing error, run `bundle exec fastlane ios match_setup` locally to force a refresh.
- **API key rotation.** If Pablo regenerates the key, update the three `APP_STORE_CONNECT_API_KEY_*` secrets. Nothing else changes.
- **Adding TestFlight testers.** Done in App Store Connect → TestFlight → Internal/External Testers. Out of scope here.
- **Build number** auto-increments based on TestFlight's latest. The `MARKETING_VERSION` in the pbxproj stays under your control — bump it (e.g. `1.0` → `1.1`) when you want a new visible version.
- **Local development.** After the bootstrap, you'll need to open Xcode → Settings → Accounts and make sure the Orbital Labworks team appears under your Apple ID. Then Xcode can sign local debug builds against the new bundle IDs via your Developer-role membership.
