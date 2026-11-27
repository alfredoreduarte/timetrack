# Going live

What's left to take payments once the release is in production, in order.
Each step says where it happens and how to check it. Nothing here needs a
code change.

Server paths below are on the droplet (`ssh root@track.alfredo.re`):

- production: `~/websites/timetrack-production/docker.env`
- staging: `~/websites/timetrack-staging/docker.staging.env`

**Editing an env file.** `deploy.sh` loads it with bash, so quote any value
with spaces or any of `< > $ & ; | \` ' "` (single quotes for secrets, so
nothing in them is expanded): `SMTP_PASS='...'`.

**Restarting the API after an edit.** The compose files fill
`JWT_SECRET`, `POSTGRES_PASSWORD` and `ALLOWED_ORIGINS` from the env file,
so always pass it (a bare `docker compose up` would start the API without
them and take it down). `--no-deps` restarts only the API: Postgres reads
the same env file, and without it compose would recreate the database
container too, for about half a minute of downtime.

```bash
# production
cd ~/websites/timetrack-production && docker compose --env-file docker.env -f docker-compose.prod.yml up -d --no-deps api
# staging
cd ~/websites/timetrack-staging && docker compose --env-file docker.staging.env -f docker-compose.staging.yml up -d --no-deps api
```

The next deploy still recreates the database container once, because its
env file changed; deploys take a backup first.

Then check it came back:

```bash
curl -s https://api.track.alfredo.re/health            # "status":"OK"
docker exec timetrack-api-prod printenv JWT_SECRET | wc -c  # more than 1
```

## 1. Before you announce (required)

**Contact details on the site.** Stripe checks the website before it
activates an account and needs a customer-service contact on it; the
Privacy Policy needs to say who runs the service. Edit
`packages/landing/content/site.md`:

- `supportEmail`: an address you read, for support, billing and privacy
  requests. It appears on `/support`.
- `operator`: who runs Trackr (your name or your company, and its country).
  It appears under each legal page, and the Terms' governing-law clause
  refers to it.

Merge to `main` to deploy. **Check:** <https://track.alfredo.re/support>
shows the address, and <https://track.alfredo.re/terms> names the operator.

**Backup cleanup.** Each production deploy writes a `backup_prod_*.sql`
dump in `~/websites/timetrack-production` and never removes old ones. The
Privacy Policy says these are deleted within 90 days, so add a daily
cleanup on the droplet (`crontab -e`):

```
15 3 * * * find /root/websites/timetrack-production /root/websites/timetrack-staging -maxdepth 1 -name 'backup_*.sql' -mtime +88 -delete
```

(`-mtime +88` matches dumps 89 or more full days old, so each one is gone
by day 90.) The same 90 days applies to any copy you keep elsewhere.

Deploys before this release also copied the dumps into Docker's build
cache. Clear it once, after this release is deployed (it only makes the
next build slower):

```bash
docker builder prune -af
```

The Terms, Privacy Policy and Refund & Cancellation Policy
(`content/legal/`) are a plain-language starting point written for this
product, but they aren't legal advice: have them reviewed for where you
operate.

## 2. Email for password resets

Without an email provider, "forgot password" says a link was sent but
nothing goes out. Any SMTP provider works (Postmark, Resend, Amazon SES,
Mailgun):

1. Create an account and verify a sending domain (for example
   `track.alfredo.re`). The provider gives you SPF and DKIM DNS records to add.
2. Add to production's `docker.env`, quoted as shown:

   ```
   SMTP_HOST=<provider host>
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER='<provider username>'
   SMTP_PASS='<provider password or API key>'
   FROM_EMAIL="Trackr <noreply@track.alfredo.re>"
   ```

3. Restart the API (see the top of this page).

**Check:** request a reset for your own account at
<https://app.track.alfredo.re/forgot-password>; the email arrives and its
link opens the app.

## 3. Stripe, in test mode on staging first

Billing stays off until all four `STRIPE_*` values are set, so this is safe
to do at any time.

1. In the Stripe dashboard, switch to **Test mode**.
2. **Customer portal:** Settings → Billing → Customer portal. Turn on
   cancelling subscriptions (at the end of the period), updating payment
   methods, invoice history, and switching between the monthly and yearly
   prices. Save. The app's "Manage subscription" button needs a saved
   portal configuration.
3. **Failed payments:** Settings → Billing → Revenue recovery → Retries.
   Set "If all retries for a payment fail" to **Cancel the subscription**.
   The Terms say a customer whose card keeps failing moves to Free; the app
   keeps Pro while Stripe is still retrying, and moves the account to Free
   once the subscription is cancelled.
4. From a checkout of this repo, with a **test** secret key:

   ```bash
   cd packages/api
   STRIPE_SECRET_KEY=sk_test_... API_PUBLIC_URL=https://api.staging.track.alfredo.re \
     npx ts-node scripts/stripe-setup.ts
   ```

   It creates the "Trackr Pro" product, the $15/month and $144/year prices
   and the webhook endpoint, then prints the lines to add. Running it again
   is safe: it reuses what exists.
5. Add the printed `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` to staging's
   `docker.staging.env`, and restart the staging API.

**Check, on <https://app.staging.track.alfredo.re>:**

- Register a **new** account (existing staging accounts are grandfathered
  and have nothing to buy). Billing says "Pro trial — 14 days left".
- To test a real charge rather than a trial, end that account's trial
  first:

  ```bash
  docker exec -i timetrack-postgres-staging psql -U timetrack_user -d timetrack_db \
    -c "UPDATE users SET trial_ends_at = now() - interval '1 day' WHERE email = '<the new account>';"
  ```

- Subscribe with the test card `4242 4242 4242 4242` (any future date, any
  CVC): you land back in the app on Pro.
- In Stripe, Developers → Webhooks: the endpoint's recent deliveries are all
  `200`, including `invoice.paid`.
- "Manage subscription" opens the Stripe portal; cancelling there shows the
  end date in the app.

## 4. Stripe, live

1. **Activate the account** in Stripe: business details, bank account,
   identity. Stripe reviews the website, so step 1 above must be done.
2. In **Live mode**, save the customer portal and revenue recovery settings
   again (live and test have separate settings).
3. Set the statement descriptor (in your public business details) to
   something customers will recognize on their card statement, such as
   `TRACKR`.
4. Decide on **taxes.** Prices are charged as shown, with no tax added. If
   you need to collect VAT or sales tax, set up Stripe Tax and register
   where required.
5. Run the setup script with the **live** key against production:

   ```bash
   cd packages/api
   STRIPE_SECRET_KEY=sk_live_... API_PUBLIC_URL=https://api.track.alfredo.re \
     npx ts-node scripts/stripe-setup.ts
   ```

6. Add the four printed values to production's `docker.env`, restart the
   API (see the top of this page), and once it's back, note the time:

   ```bash
   CUTOFF=$(date -u +%Y-%m-%dT%H:%M:%SZ); echo "$CUTOFF"
   ```

7. **Grandfathering.** Accounts that existed when this release was
   deployed already keep Pro for free. To extend that to everyone who
   signed up before payments went live (as the FAQ promises), in the same
   shell:

   ```bash
   docker exec -i timetrack-postgres-prod psql -U timetrack_user -d timetrack_db \
     -c "UPDATE users SET is_subscription_exempt = true WHERE \"createdAt\" < '$CUTOFF';"
   ```

   It prints `UPDATE` and the number of accounts. Accounts made from now
   on keep their trial.

**Check:**

- `curl -s https://api.track.alfredo.re/health` answers `OK`.
- Your own account is grandfathered: Billing shows Pro, free, with nothing
  to buy.
- A brand-new account's Billing page says "Pro trial — 14 days left" and
  offers to subscribe. Its first charge happens when the trial ends.
- Optionally, check a real charge end to end: end a throwaway account's
  trial as in step 3 (on `timetrack-postgres-prod`), subscribe with your own
  card, confirm `invoice.paid` in the webhook deliveries, then refund the
  charge and cancel the subscription in Stripe.

## 5. After launch

- **Uptime:** point a free monitor (UptimeRobot, Better Stack) at
  `https://api.track.alfredo.re/health` and `https://track.alfredo.re/`.
- **Backups off the droplet:** copy the pre-deploy dumps somewhere else
  from time to time, and delete those copies within 90 days too (the
  Privacy Policy promises that).
- **Logs:** the API's log files and the web, API and landing containers'
  logs rotate by size (set in the code and compose files), and the host's
  nginx logs rotate with logrotate.
- **Stripe emails:** in Settings → Customer emails, turn on receipts and
  failed-payment emails, so customers hear about card problems.
