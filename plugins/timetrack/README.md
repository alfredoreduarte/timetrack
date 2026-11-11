# TimeTrack for Claude Code

Bill every Claude Code session without thinking about it. Each session gets
its own timer, parallel sessions run side by side, and a session that goes
quiet stops billing on its own.

## Install

```
claude plugin install timetrack --marketplace alfredoreduarte/timetrack
```

Run it in your terminal. Inside a session the equivalent is
`/plugin marketplace add alfredoreduarte/timetrack`, then `/plugin install timetrack@timetrack`.

Claude Code asks for your **TimeTrack API key** — create one in TimeTrack under
**Settings → API keys**. It is stored in your system keychain.

## What happens

- **Session start** — a timer starts for this session. If the repository is
  linked to a project, the time goes to that client; otherwise the agent is
  told the timer id so it can assign a project when you mention one, and
  TimeTrack remembers the repository.
- **While the agent works** — prompts and tool calls are heartbeats. After 15
  minutes without one (configurable in TimeTrack), the timer pauses *at the
  last activity*, so nothing is billed overnight. The next prompt resumes it.
  If *you* pause or stop it (in TimeTrack or by asking Claude), it stays that
  way until you resume it or reopen the session with `--resume`; `/compact`
  and `/clear` never restart it.
- **Session end** — the timer stops.
- **First session after install** — your last 30 days of Claude Code sessions
  are imported in the background (turn off "Import past sessions" in
  `/config` to skip). If that fails (offline, say), it retries next session.
  Re-imports never touch sessions that were tracked live or that you edited.

The `timetrack` MCP server lets Claude manage time for you: pause or resume
timers, fix or backfill past entries, log notes for the client, and build
timesheets.

## Commands

| Command | What it does |
|---|---|
| `/timetrack:status` | This session's timer, other parallel timers, your plan |
| `/timetrack:note [text]` | Log what was done — appears on the client's timesheet |
| `/timetrack:timesheet [period] [project]` | Client-ready Markdown timesheet |
| `/timetrack:import [days]` | Preview and import older sessions |

## Privacy

The hook sends only the hook event name, the session id, the working
directory and, at session start, the git remote and branch. The importer sends
session ids, activity timestamps, repository names and token counts. **Prompts,
messages, tool input/output and code never leave your machine.** Every hook
request has a short timeout and the hook always exits successfully, so
TimeTrack can never block or break a session.
