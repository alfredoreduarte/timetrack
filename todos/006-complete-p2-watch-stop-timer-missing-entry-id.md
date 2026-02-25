---
status: pending
priority: p2
issue_id: "006"
tags: [code-review, watchos, api, ios]
dependencies: []
---

# WatchAPIClient.stopTimer() Uses Non-Existent Endpoint

## Problem Statement

`WatchAPIClient.stopTimer()` calls `POST /time-entries/stop`, but that route does not exist on the API. The actual route is `POST /time-entries/:id/stop`. Every other client (iOS, macOS, web) passes the entry ID in the path. The Watch method omits the ID entirely, making it permanently broken.

The method is currently dead code (the Watch UI delegates timer control to the iPhone via WatchConnectivity), so there is no active regression. But it will silently fail with a 404 the moment anyone wires `WatchAPIClient` to a view.

## Findings

The stop route is registered as:
```
// packages/api/src/routes/timeEntries.ts, line 373
router.post("/:id/stop", ...)
```

All other clients pass the ID:
```swift
// packages/ios-app/Timetrack/Timetrack/Services/APIClient.swift, line 463
endpoint: "/time-entries/\(entryId)/stop"

// packages/mac-app/TimeTrack/Services/APIClient.swift, line 426
endpoint: "/time-entries/\(entryId)/stop"
```

```typescript
// packages/ui/src/services/api.ts, line 335
`/time-entries/${id}/stop`
```

The Watch client after PR #81:
```swift
// packages/ios-app/Timetrack/Timetrack Watch Watch App/APIClient.swift, line 182
endpoint: "/time-entries/stop",  // 404 — route does not exist
```

## Proposed Solutions

### Option A — Fetch current entry ID then stop (mirrors iOS client)
Modify `stopTimer()` to first call `getCurrentTimeEntry()`, extract the ID, then call `/time-entries/{id}/stop`.

```swift
func stopTimer() async throws {
    guard let current = try await getCurrentTimeEntry() else {
        throw APIClientError.clientError("No running timer")
    }
    _ = try await makeRequest(
        endpoint: "/time-entries/\(current.id)/stop",
        method: .POST,
        responseType: TimerResponse.self
    )
}
```

**Pros:** No API change required. Consistent with iOS/macOS clients.
**Cons:** Two network round-trips. If the entry isn't running, `getCurrentTimeEntry()` returns nil.
**Effort:** Small
**Risk:** Low

### Option B — Add a convenience `POST /time-entries/stop` endpoint on the API
Add a route that finds and stops the authenticated user's currently running entry server-side without requiring a client-supplied ID.

**Pros:** Fewer round-trips. Cleaner watch semantics (watch doesn't need to know the ID).
**Cons:** API change required; needs migration of callers if other clients ever use it.
**Effort:** Medium
**Risk:** Low

## Recommended Action

Option A — minimal, no API change, fixes the bug immediately. Option B is a better long-term design but out of scope for this cleanup PR.

## Technical Details

**Affected file:** `packages/ios-app/Timetrack/Timetrack Watch Watch App/APIClient.swift` line 181–186
**Affected API route:** `packages/api/src/routes/timeEntries.ts` line 373
**Currently dead code:** Yes — Watch UI uses `WatchConnectivityManager` not `WatchAPIClient` for stop

## Acceptance Criteria

- [ ] `WatchAPIClient.stopTimer()` calls the correct `POST /time-entries/:id/stop` endpoint
- [ ] Calling `stopTimer()` when no timer is running throws a meaningful error (not a 404)
- [ ] Watch app compiles and stop action works on simulator

## Work Log

- 2026-02-24: Identified during code review of PR #81. Not introduced by this PR — the path was `/api/time-entries/stop` before (also wrong). Pre-existing latent bug surfaced by the path audit.
