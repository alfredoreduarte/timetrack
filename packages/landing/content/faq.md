---
questions:
  - q: "Do you see my prompts or code?"
    a: "No. The hook sends the event name, the session id, the working folder and, when a session starts, the git remote and branch. The importer adds message timestamps and token counts. Nothing else."
  - q: "What happens when three agents run at the same time?"
    a: "Each gets its own timer. By default the overlapping time on one project is billed once, at the highest applicable rate; you can switch a client to per-agent billing. The timesheet discloses the rule."
  - q: "Does it work with Cursor or other agents?"
    a: "Any client that speaks MCP over HTTP can start, pause and edit timers, and Cursor's hooks are understood too. The one-command plugin is for Claude Code."
  - q: "I already have an account. Do I have to pay?"
    a: "No — existing accounts keep every Pro feature for free."
---
