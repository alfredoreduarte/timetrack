---
title: "Privacy Policy"
description: "What Trackr collects, why, who processes it, how long it's kept and how to delete it. Never your prompts or code."
updated: "November 27, 2026"
---

Trackr is a time tracker for developers who work with AI agents. This policy explains what we collect, why, and what you can do about it. The short version: we keep what's needed to track and bill your time, we never receive your prompts or code, we don't sell or share your data for advertising, and you can delete everything yourself.

## What we collect

**Your account.** Your name, email address and a hashed password (we can't read it). Your preferences, such as your default rate, currency and idle timeout.

**Your time data.** Projects, tasks, rates, time entries, timers and their segments, and the notes you or your agents add. This is the core of the service.

**What the Claude Code plugin and agents send.** For each agent session: the session id, the event name (session started, activity, session ended), the working folder path and, when a session starts, the git remote URL (with any credentials stripped) and branch. The importer adds message timestamps and token counts per model, so time and API-equivalent cost can be calculated. **We never receive your prompts, the agent's replies, tool input or output, or the contents of your files.**

**Billing.** If you subscribe, Stripe handles the payment. We store your Stripe customer and subscription ids and your plan status, never your card details.

**Technical data.** Our servers record IP addresses and request details in their logs, to keep the service secure and to fix problems.

## How we use it

- To run the service: track time, build timesheets and share links, and show you reports.
- To bill you for a paid plan and manage your subscription.
- To keep the service secure, prevent abuse and fix problems.
- To answer you when you contact us, and to tell you about important changes to the service or these policies.

We don't sell your data, we don't use it for advertising, and we don't use third-party analytics or ad trackers.

## Cookies and local storage

The landing site sets no cookies. The web app keeps your sign-in token and profile in your browser's local storage so you stay signed in; signing out removes them.

## Who processes it for us

We use a small number of providers to run the service, each only for its own part:

- **DigitalOcean** hosts the servers and the database.
- **Stripe** processes payments and subscriptions.
- **An email delivery provider** sends account emails such as password resets.

Your data may be processed in countries other than yours, including the United States. Where the law requires it, we rely on safeguards such as the providers' standard contractual clauses.

We share data otherwise only when the law requires it, or to protect the rights and safety of our users or the service. Share links you create are visible to anyone who has the link, until you revoke them.

## How long we keep it

We keep your data while your account exists. When you delete your account from **Settings**, your projects, entries, timers, notes, API keys, share links and account details are deleted right away, and your Stripe customer record is deleted, which cancels any subscription. Copies of the database made before software updates can still contain deleted data until those copies are removed. Server logs are rotated, so older entries are deleted as new ones are written.

## Your rights

You can:

- **See and export** your data: timesheets export as CSV or Markdown, and you can ask us for a copy of everything.
- **Correct** it in the app, or ask us to.
- **Delete** your account and all of its data from **Settings → Account → Delete account**.
- **Object** to how we use your data, or ask us to restrict it.

If you live in the EU, the UK or a similar jurisdiction, you can also complain to your data protection authority.

## Security

Passwords are hashed with bcrypt. API keys and share link tokens are stored only as hashes, so even we can't read them. All traffic uses HTTPS. No system is perfectly secure, but we take care to keep your data safe, and we'll tell you without undue delay if a breach affects you.

## Children

Trackr isn't meant for anyone under 16, and we don't knowingly collect their data.

## Changes

If we change this policy in a meaningful way, we'll tell you by email or in the app before the change takes effect.

## Contact

For privacy questions or requests, see [Support](/support).
