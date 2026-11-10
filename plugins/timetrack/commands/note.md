---
description: Log what you accomplished on this session's timer (shows up on the client timesheet)
argument-hint: "[what was done — optional, I'll summarize the session if empty]"
allowed-tools: mcp__plugin_timetrack_timetrack__add_note, mcp__plugin_timetrack_timetrack__list_timers
---
Add a work-log note to this session's TimeTrack timer. Your context names the timer id when hooks started it; otherwise use `list_timers` and pick the running timer for this repository.

Note text: $ARGUMENTS

If no text was given, write one or two plain sentences a client would understand, summarizing what this session accomplished so far (outcomes, not tool calls). Then call `add_note` and confirm in one line.
