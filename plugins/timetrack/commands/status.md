---
description: Show what TimeTrack is tracking right now (this session's timer, parallel timers, plan)
allowed-tools: mcp__plugin_timetrack_timetrack__whoami, mcp__plugin_timetrack_timetrack__list_timers
---
Call the TimeTrack `whoami` tool, then `list_timers` with status "active". Report briefly:

- This session's timer (your context names its timer id if hooks started it): status, project, tracked time.
- Other running or paused timers (parallel agent sessions), one line each.
- The plan and, on the Free plan, how many parallel agent timers are in use out of the limit.

Format durations as hours and minutes. If a timer has no project, say so and offer to assign one.
