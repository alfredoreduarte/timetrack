---
questions:
  - q: "Do you see my prompts or code?"
    a: "No. The hook sends the event name, the session id, the working folder and, when a session starts, the git remote and branch. The importer adds message timestamps and token counts. Nothing else."
  - q: "What happens when three agents run at the same time?"
    a: "Each gets its own timer. By default the overlapping time on one project is billed once, at the highest applicable rate; you can switch a client to per-agent billing. The timesheet discloses the rule."
  - q: "Can my client check the hours?"
    a: "Send them a read-only share link: they see each day's work, which agent did it, how overlap was billed and, if you choose, the amounts. Every edit to an entry is kept in an audit trail, so the hours you bill are hours you can explain."
  - q: "How is this different from reading my session logs afterwards?"
    a: "Timers run live, pause at the last activity instead of when you come back, and land on the right client by git repo. When you do want the past, the plugin imports your last 30 days of Claude Code sessions on first run."
  - q: "Does it work with Cursor or other agents?"
    a: "Any client that speaks MCP over HTTP can start, pause and edit timers, and Cursor's hooks are understood too. The one-command plugin is for Claude Code."
  - q: "Can I cancel any time?"
    a: "Yes, from Billing in the app. You keep Pro until the end of the period you paid for, then move to Free with all your data. Tell us within 14 days of a charge you didn't mean to make and we'll refund it (see the refund policy)."
  - q: "Can I delete my data?"
    a: "Yes. Settings → Delete account removes everything, cancels any subscription and can't be undone. Export what you need from the Timesheet page first (Free covers the last 14 days), or ask us for a full copy."
  - q: "I already have an account. Do I have to pay?"
    a: "No — accounts created before paid plans launched keep every Pro feature for free."
---
