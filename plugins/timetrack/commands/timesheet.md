---
description: Build a client-ready timesheet (Markdown) for a period and optionally one project
argument-hint: "[period, e.g. this week | last month | 2026-03] [project name]"
allowed-tools: mcp__plugin_timetrack_timetrack__list_projects, mcp__plugin_timetrack_timetrack__timesheet
---
Build a TimeTrack timesheet for: $ARGUMENTS

1. Work out the date range from the request (default: the current month so far) and the user's timezone if you know it.
2. If a project is named, find its id with `list_projects`.
3. Call `timesheet` with format "markdown" and show the result as is.
4. Below it, add one short paragraph a developer could paste into an invoice email, using the totals and the disclosure lines. Don't invent hours or amounts.
