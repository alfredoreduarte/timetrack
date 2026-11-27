# Going live

What's left to take payments once the release is in production, in order.
Each step says where it happens and how to check it. Nothing here needs a
code change.

Server paths below are on the droplet (`ssh root@track.alfredo.re`):

- production: `~/websites/timetrack-production/docker.env`
- staging: `~/websites/timetrack-staging/docker.staging.env`

After editing an env file, restart the API so it picks the values up:

```bash
# production
cd ~/websites/timetrack-production && docker compose -f docker-compose.prod.yml up -d api
# staging
cd ~/websites/timetrack-staging && docker compose -f docker-compose.staging.yml up -d api
```

## 1. Contact details on the site

Stripe checks the website before it activates an account, and it needs a
customer-service contact on it.

Edit `packages/landing/content/site.md`:

- `supportEmail`: an address you read, for support, billing and privacy
  requests. It appears on `/support`.
- `operator`: who runs Trackr (your name or your company), shown under each
  legal page.

Merge to `main` to deploy. **Check:** <https://track.alfredo.re/support>
shows the address.

The Terms, Privacy Policy and Refund & Cancellation Policy (`content/legal/`)
are a solid plain-language starting point written for this product, but
they aren't legal advice: have them reviewed for where you operate.

## 2. Email for password resets

Without an email provider, "forgot password" says a link was sent but
nothing goes out. Any SMTP provider works (Postmark, Resend, Amazon SES,
Mailgun):

1. Create an account and verify a sending domain (for example
   `track.alfredo.re`). The provider gives you SPF and DKIM DNS records to add.
2. Add to production's `docker.env`:

   ```
   SMTP_HOST=<provider host>
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<provider username>
   SMTP_PASS=<provider password or API key>
   FROM_EMAIL=Trackr <noreply@track.alfredo.re>
   ```

3. Restart the API.

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
3. From a checkout of this repo, with a **test** secret key:

   ```bash
   cd packages/api
   STRIPE_SECRET_KEY=sk_test_... API_PUBLIC_URL=https://api.staging.track.alfredo.re \
     npx ts-node scripts/stripe-setup.ts
   ```

   It creates the "TimeTrack Pro" product, the $15/month and $144/year
   prices and the webhook endpoint, then prints the lines to add. Running it
   again is safe: it reuses what exists.
4. Add the printed `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `STRIPE_PRICE_MONTHLY` and `STRIPE_PRICE_YEARLY` to staging's
   `docker.staging.env`, and restart the staging API.

**Check, on <https://app.staging.track.alfredo.re>:**

- Billing shows the plans. Subscribe with the test card `4242 4242 4242 4242`
  (any future date, any CVC): you land back in the app on Pro.
- "Manage subscription" opens the Stripe portal; cancelling there shows the
  end date in the app.
- In Stripe, Developers → Webhooks: the endpoint's recent deliveries are
  all `200`.

## 4. Stripe, live

1. **Activate the account** in Stripe: business details, bank account,
   identity. Stripe reviews the website: steps 1 and 2 above should be done.
2. In **Live mode**, save the customer portal settings again (live and test
   have separate settings).
3. Set the statement descriptor (in your public business details) to
   something customers will recognize on their card statement, such as
   `TRACKR`.
4. Optional but worth deciding now: **taxes.** Prices are charged as shown,
   with no tax added. If you need to collect VAT or sales tax, set up
   Stripe Tax and register where required.
5. Run the setup script with the **live** key against production:

   ```bash
   cd packages/api
   STRIPE_SECRET_KEY=sk_live_... API_PUBLIC_URL=https://api.track.alfredo.re \
     npx ts-node scripts/stripe-setup.ts
   ```

6. Add the four printed values to production's `docker.env`, then restart
   the API.

**Check:**

- `curl -s https://api.track.alfredo.re/health` answers `OK`.
- Your own account is grandfathered: Billing shows Pro, free, with nothing
  to buy. Every account that existed before launch is.
- A brand-new account's Billing page says "Pro trial — 14 days left" and
  offers to subscribe.
- Optionally, subscribe yourself with a real card from a new account, then
  refund the charge in Stripe.

## 5. After launch

- **Uptime:** point a free monitor (UptimeRobot, Better Stack) at
  `https://api.track.alfredo.re/health` and `https://track.alfredo.re/`.
- **Backups:** each production deploy writes a `backup_prod_*.sql` dump in
  `~/websites/timetrack-production` and never removes old ones. Copy them off
  the droplet regularly, and prune old ones, e.g.
  `find ~/websites/timetrack-production -name 'backup_prod_*.sql' -mtime +30 -delete`.
  The privacy policy says deleted data can stay in these until they're
  removed.
- **Docker logs:** cap the container logs in `/etc/docker/daemon.json`
  (`"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "5"}`),
  then restart Docker during a quiet moment.
- **Stripe emails:** in Settings → Customer emails, turn on receipts and
  failed-payment emails, so customers hear about card problems.
