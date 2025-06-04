# Timezone Fix Implementation

## Problem
The dashboard "Today" card was not correctly calculating today's time entries due to timezone offset issues. The API was calculating "today" using the server's timezone (UTC) instead of the user's local timezone.

## Root Cause
- **API**: Used `new Date().setHours(0, 0, 0, 0)` which creates midnight in the server's timezone (UTC)
- **Database**: Correctly stores all times in UTC
- **UI**: Displays times in user's local timezone but API calculations didn't account for this

## Solution Implemented

### 1. API Changes (`packages/api/src/routes/users.ts`)

#### Added Timezone Support to Endpoints:
- `/users/dashboard-earnings` - Now accepts optional `timezone` query parameter
- `/users/stats` - Now accepts optional `timezone` query parameter

#### Helper Functions Added:
```typescript
// Validates IANA timezone strings
function isValidTimezone(timezone: string): boolean

// Calculates start of day in user's timezone, returns UTC Date
function getStartOfDayInTimezone(timezone: string): Date

// Calculates start of week in user's timezone, returns UTC Date
function getStartOfWeekInTimezone(timezone: string): Date
```

#### Timezone Calculation Logic:
1. Accept timezone parameter (defaults to "UTC" if not provided)
2. Validate timezone using `Intl.DateTimeFormat`
3. Calculate "start of day" and "start of week" in user's timezone
4. Convert back to UTC for database queries
5. Maintain backward compatibility (works without timezone parameter)

### 2. UI Changes (`packages/ui/src/services/api.ts`)

#### Updated API Client:
- `getDashboardEarnings()` now automatically detects and sends user's timezone
- Uses `Intl.DateTimeFormat().resolvedOptions().timeZone` to get user's timezone

### 3. Shared Utilities (`packages/shared/src/utils/timezone.ts`)

#### Created Shared Timezone Functions:
- `getStartOfDayInTimezone(timezone: string): Date`
- `getStartOfWeekInTimezone(timezone: string): Date`
- `isValidTimezone(timezone: string): boolean`
- `getUserTimezone(): string`

## How It Works

### Before (Broken):
```javascript
// API calculated "today" in server timezone (UTC)
const startOfToday = new Date();
startOfToday.setHours(0, 0, 0, 0); // 00:00 UTC

// For a user in EST (UTC-5), this would miss 5 hours of their "today"
```

### After (Fixed):
```javascript
// API calculates "today" in user's timezone, converts to UTC
const startOfToday = getStartOfDayInTimezone("America/New_York");
// Returns: 2025-06-03T04:00:00.000Z (midnight EST in UTC)

// Now correctly captures all of user's "today" entries
```

## Example Timezone Calculations

For a user in **America/New_York (EST/EDT)**:
- Local time: `6/3/2025, 9:15:19 PM`
- Start of day (UTC): `2025-06-03T04:00:00.000Z`
- Start of day (local): `6/3/2025, 12:00:00 AM`

This ensures that when the API queries for "today's" time entries, it correctly includes all entries from midnight in the user's timezone, not midnight UTC.

## Backward Compatibility

- All endpoints work without timezone parameter (defaults to UTC)
- Existing API clients continue to work unchanged
- Database schema unchanged (still stores UTC times)
- UI automatically sends timezone, no user action required

## Testing

The timezone calculations were verified with multiple timezones:
- UTC
- America/New_York (EDT, UTC-4)
- America/Los_Angeles (PDT, UTC-7)
- Europe/London (BST, UTC+1)
- Asia/Tokyo (JST, UTC+9)

All calculations correctly convert local "start of day" to appropriate UTC times for database queries.

## Benefits

1. **Accurate "Today" calculations** - Dashboard now shows correct daily totals
2. **Accurate "This Week" calculations** - Weekly stats respect user's timezone
3. **Standard approach** - Uses IANA timezone identifiers
4. **Minimal complexity** - Simple query parameter, no complex client-side calculations
5. **Automatic** - UI automatically detects and sends user's timezone
6. **Robust** - Validates timezones and falls back to UTC gracefully