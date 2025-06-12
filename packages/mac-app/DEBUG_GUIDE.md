# Debug Guide for Timer Issues

## Current Issues Reported:

### Issue 1: When timer IS running on API
- ❌ Timer form doesn't reflect running state
- ❌ Recent time entries list remains empty

### Issue 2: When timer is NOT running on API
- ✅ Timer UI shows correctly (no running timer)
- ✅ Recent time entries list works fine

## Debugging Steps

### 1. Check Console Output
Open **Console.app** and filter for "TimeTrack" to see debug logs:

```
🔍 Loading current entry...
📊 Current entry response: [entry-id or nil]
📊 Is running: [true/false]
✅ Found running timer, calculating elapsed time...
🕐 Calculating elapsed time from: [timestamp]
⏱️ Calculated elapsed time: [seconds] ([formatted])

🔍 Loading recent entries...
📊 Loaded [count] recent entries
   1. [entry-id] - [description] - Running: [true/false]
```

### 2. Test Scenarios

#### Scenario A: No Running Timer
1. Login to the app
2. Verify no timer is running on the API
3. Check console for:
   - `⏹️ No running timer found`
   - `📊 Loaded [X] recent entries` (where X > 0)
4. UI should show:
   - Timer at "00:00:00"
   - Start button available
   - Recent entries populated

#### Scenario B: Running Timer
1. Login to the app
2. Start a timer (or have one running from API)
3. Check console for:
   - `✅ Found running timer, calculating elapsed time...`
   - `⏱️ Calculated elapsed time: [X] seconds`
   - `📊 Loaded [X] recent entries`
4. UI should show:
   - Timer showing elapsed time (not 00:00:00)
   - Green color on timer
   - Stop button available
   - Project/task info displayed
   - Recent entries populated

### 3. Debug Controls

**New Debug Button:** Click the 🔄 button next to the timer to manually refresh
- Forces reload of current timer and recent entries
- Check console output after clicking

### 4. API Response Debugging

If issues persist, check these in Console.app:

```bash
# Look for these error patterns:
"❌ Error loading current entry:"
"❌ Error loading recent entries:"
"Error decoding current entry:"
"Raw response:"
"❌ Failed to parse start time:"
```

### 5. Common Issues & Fixes

#### Timer Shows 00:00:00 Despite Running Timer
**Likely Cause:** Date parsing issue
**Debug:** Look for `❌ Failed to parse start time:` in console
**Fix:** Check if API returns date in expected format

#### Recent Entries Empty When Timer Running
**Likely Cause:** API request error or authentication issue
**Debug:** Look for `❌ Error loading recent entries:` in console
**Fix:** Check token validity with refresh

#### Timer State Not Updating
**Likely Cause:** JSON decoding issue
**Debug:** Look for `Error decoding current entry:` and `Raw response:` in console
**Fix:** Check TimeEntry model matches API response

### 6. Manual Testing Commands

Open Terminal and test API directly:

```bash
# Check current timer (replace TOKEN)
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.track.alfredo.re/time-entries/current

# Check recent entries
curl -H "Authorization: Bearer YOUR_TOKEN" https://api.track.alfredo.re/time-entries?limit=10

# Expected responses:
# - Current timer: TimeEntry object OR null
# - Recent entries: {"entries": [...], "pagination": {...}}
```

### 7. Expected Fixes Applied

1. ✅ **Fixed getCurrentEntry API handling** - Now properly handles null responses
2. ✅ **Added comprehensive date parsing** - Supports multiple date formats
3. ✅ **Enhanced debug logging** - Better visibility into what's happening
4. ✅ **Added manual refresh** - Debug button to force data reload
5. ✅ **Improved error handling** - More detailed error messages

### 8. Next Steps

1. **Test both scenarios** (timer running/not running)
2. **Check console output** for error patterns
3. **Use manual refresh** if needed
4. **Report specific error messages** from console if issues persist

The debug output will help pinpoint exactly where the issue is occurring!