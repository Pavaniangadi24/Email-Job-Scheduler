# Outbox: Run and Demo Guide

This guide is written for Windows and follows the recommended Docker setup. Work through **Setup** once. After that, **Start the app** is the normal launch routine. The demo script is designed for a short recording of about five minutes.

## 1. What you need

Install or have these ready:

- Docker Desktop, started and running
- Git, if you need to clone the repository
- Node.js 22 or newer and npm, needed for the one-time Ethereal setup command
- A Google OAuth client, so real Google sign-in works
- A Slack app, if you want to demonstrate Slack alerts
- Internet access while Docker downloads/builds the images and while OAuth/SMTP connect to their real providers

The application runs in Docker. You do not need to install PostgreSQL, Redis, Elasticsearch, or run their commands separately.

## 2. Get the project

If the repository is already on your computer, open PowerShell in the project folder and skip the clone commands. Otherwise:

```powershell
git clone https://github.com/Pavaniangadi24/Email-Job-Scheduler.git
cd Email-Job-Scheduler
```

Confirm Docker Desktop is running:

```powershell
docker --version
docker compose version
docker info
```

If `docker info` reports that it cannot connect, start Docker Desktop and retry.

## 3. Prepare the environment file

The application reads secrets and external provider settings from a root-level `.env` file. That file is private to your computer and must not be committed.

If `.env` does not exist, create it from the example:

```powershell
Copy-Item .env.example .env
```

If you already have `.env`, **do not overwrite it**. Open it in VS Code:

```powershell
code .env
```

Keep the database, Redis, Elasticsearch, and callback settings from `.env.example`. Docker Compose supplies the container-to-container addresses and callbacks. You must set a private session secret and your provider credentials before sign-in and mail sending work.

Generate a random session secret in PowerShell:

```powershell
-join ((1..48 | ForEach-Object { '{0:x2}' -f (Get-Random -Maximum 256) }) -join '')
```

Copy the generated text into `.env` as the value of `SESSION_SECRET`. Do not share it. It also protects encrypted Slack credentials; rotating it later means reconnecting Slack.

## 4. Set up Ethereal test email

Ethereal is a real SMTP test service. It accepts the message but **does not deliver it to a real inbox**; you inspect the captured message in Ethereal.

From the project root, run:

```powershell
npm install
npm run ethereal:setup
```

The command prints an Ethereal username and password. Put them in `.env`:

```dotenv
ETHEREAL_USER=the-username-printed-by-the-command
ETHEREAL_PASS=the-password-printed-by-the-command
```

Do not put quotation marks around the values. Save `.env`. Later, when composing a campaign, use that exact `ETHEREAL_USER` as the **From address**. The app can then authenticate to Ethereal SMTP and the demo sender matches the test account.

When messages send, open [Ethereal Messages](https://ethereal.email/messages) and sign in with the generated account to inspect them. Keep these credentials private.

## 5. Set up real Google sign-in

Google sign-in is not mocked. The dashboard requires valid OAuth credentials.

1. In Google Cloud Console, create or select a project.
2. Configure the OAuth consent screen. While the app is in Testing mode, add the Google account you will use for the demo as a test user.
3. Create an OAuth client ID of type **Web application**.
4. Add this authorized redirect URI exactly:

   ```text
   http://localhost:4000/api/auth/google/callback
   ```

5. Copy the client ID and client secret into `.env`:

   ```dotenv
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```
6. Save `.env`.

Do not use a client secret from a different OAuth app or redirect URI. Google OAuth will return an error if the callback does not match exactly.

## 6. Set up real Slack alerts (optional, but required to demo the Slack feature)

If Slack is not configured, the rest of the app still works; rate-limit events simply do not send a Slack notification.

1. Create a Slack app at the Slack API site and choose the workspace where you can install apps.
2. Under **OAuth & Permissions**, add the **Bot Token Scopes** `chat:write` and `incoming-webhook`.
3. Add this redirect URL exactly:

   ```text
   http://localhost:4000/api/integrations/slack/callback
   ```

4. Install or reinstall the app into your workspace so the requested scopes are granted.
5. Copy the app's client ID and client secret into `.env`:

   ```dotenv
   SLACK_CLIENT_ID=your-slack-client-id
   SLACK_CLIENT_SECRET=your-slack-client-secret
   ```

6. Save `.env`. Keep credentials private.
7. During the demo, sign in to Outbox, open the profile menu at bottom-left, select **Connect Slack for alerts**, approve the Slack installation, and return to the dashboard. The profile menu should show the connected workspace.

Slack sends a real notification when a sender hits the hourly cap. Connect Slack **before** the rate-limit demo. A notification is sent at most once per sender per UTC clock hour, so for a repeat demonstration use a different sender address or wait until the next UTC hour.

## 7. Start the application

Open PowerShell in the project root and start the complete app:

```powershell
docker compose up --build -d
```

The first build can take several minutes because Docker downloads Elasticsearch and builds the API and dashboard images. Wait for the services to start, then check them:

```powershell
docker compose ps -a
```

Expected services are `postgres`, `redis`, `elasticsearch`, `migrate`, `api`, and `web`. `migrate` is a one-time job and should show `Exited (0)` after it successfully applies database migrations. The other services should show `Up`; Postgres, Redis, and Elasticsearch should become healthy.

Check the API and dashboard from PowerShell:

```powershell
Invoke-RestMethod http://localhost:4000/health
Invoke-WebRequest -Method Head http://localhost:5173/
```

The API should return `status: ok`; the dashboard request should return HTTP 200. Now open:

- Dashboard: http://localhost:5173
- API health: http://localhost:4000/health

Sign in using the Google account you added as a test user. If sign-in fails, recheck the client ID/secret, Google test-user setting, and exact callback URL.

### Queue dashboard

Open the BullMQ dashboard at:

```text
http://localhost:4000/admin/queues
```

It requires a signed-in browser session. If it opens in a browser where you are not signed in, first sign in at the Outbox dashboard in that same browser.

### Stop and restart safely

Stop the containers without deleting scheduled work or database data:

```powershell
docker compose down
```

Start them again later with:

```powershell
docker compose up -d
```

The named Postgres and Redis volumes preserve the application state. **Do not run `docker compose down -v`** for a normal stop; `-v` deletes the database, Redis queue, and Elasticsearch data.

## 8. Create a demo lead file

Use Notepad to create `demo-leads.csv` in the project folder with this content:

```csv
email,name
alex@example.com,Alex
jamie@example.com,Jamie
morgan@example.com,Morgan
```

These are example addresses. Ethereal captures test messages; it will not deliver them to these inboxes. You may use your own test addresses if you prefer, but never upload a real contact list for a public recording.

## 9. Five-minute demo plan

Before recording, start the app, make sure Google sign-in works, prepare the CSV, and connect Slack if you will show the bonus rate-limit section. Use a screen recorder that captures the browser and, for the restart segment, a terminal window. Do not show `.env`, OAuth secrets, SMTP passwords, session cookies, or access tokens.

### 0:00–0:30 | Introduce the app

**Show:** Outbox dashboard after signing in. Briefly point out Scheduled, Sent emails, the compose button, and the user profile.

**Say:**

> “This is Outbox, a Docker-based email scheduler. I sign in with Google, schedule a batch from a CSV, and track scheduled and sent messages. PostgreSQL stores the authoritative email state, and BullMQ with persistent Redis handles delayed work. Ethereal is the test SMTP provider, so messages can be inspected without sending real email.”

### 0:30–1:35 | Compose and schedule

1. Click **Compose email**.
2. In **From address**, use the exact Ethereal `ETHEREAL_USER` value from `.env`.
3. Enter a clear subject, for example `Outbox demo: hello`.
4. Enter a short body, for example `Hello! This is a test message sent by the Outbox scheduler.`
5. Choose `demo-leads.csv` under Recipients. Show the detected count is **3**.
6. Set the start time to about one minute in the future. The control uses your computer's local time.
7. Leave delay at **2 seconds** and hourly limit at **200** for this delivery demo.
8. Click **Schedule emails**.

**Say:**

> “The CSV parser finds and deduplicates the email addresses. Each message is stored in PostgreSQL with a stable ID and queued as a delayed BullMQ job. The campaign has a two-second minimum gap between messages, and the sender also remains under the configured hourly cap.”

### 1:35–2:15 | Show scheduled records and queue visibility

1. Show the success message and the **Scheduled emails** table.
2. Point out recipient, subject, scheduled time, and queued status.
3. Open **Queue monitor** in the sidebar or open the Bull Board URL in another tab.
4. Show the email queue and delayed/waiting jobs if the screen has not yet advanced.

**Say:**

> “The dashboard refreshes automatically. Bull Board gives a live view of the queue. The database remains the source of truth, so the API reconciles pending scheduled rows back into BullMQ at startup.”

### 2:15–3:00 | Show delivery and Ethereal preview

1. Wait for the start time and delivery. With three messages and two seconds between sends, allow roughly 10–20 seconds after the scheduled start.
2. Click **Sent emails**. Show the delivered status and sent time. If a message fails, its row appears here as Failed with an error available from the row action.
3. Open [Ethereal Messages](https://ethereal.email/messages), sign in with the test account, and show one captured message and its subject/body.

**Say:**

> “These messages were accepted by Ethereal's SMTP server and captured for inspection. Ethereal is deliberately a fake mailbox provider, so this demo does not send to a real recipient.”

### 3:00–4:00 | Prove restart persistence

Do this while at least one job is still scheduled for the future. If the first batch is already sent, compose a second batch with one lead and set its start time at least five minutes ahead.

1. Leave the scheduled email visible in the dashboard.
2. In PowerShell, run:

   ```powershell
   docker compose restart api
   ```

3. Wait for the API to return, then verify health:

   ```powershell
   Invoke-RestMethod http://localhost:4000/health
   ```

4. Refresh the dashboard or queue monitor. Show the email is still scheduled/delayed. Later, show it reaches the sent view after its scheduled time.

**Say:**

> “I restarted the API while a future email was pending. On startup, the scheduler recovered pending rows from PostgreSQL and reconciled their stable IDs into BullMQ. The future job stayed delayed instead of starting over or being lost.”

A five-minute recording may not have enough time to show that five-minute future job actually send. It is sufficient to show it still queued after the restart; for the final delivery, keep the app running and show it afterward, or schedule the restart probe only a couple of minutes ahead and capture that portion separately.

### 4:00–4:45 | Optional Slack rate-limit demonstration

Only do this if Slack has been connected and you have time to wait for the notification.

1. Click **Compose email** and use the same Ethereal sender used for the previous demo.
2. Import two lead addresses.
3. Set the start time about one minute ahead, delay to **2 seconds**, and **Hourly sender limit** to **1**.
4. Schedule the batch.
5. Show the first message proceeds and the following message is deferred by the shared Redis sender limit. Open Bull Board to show the deferred job and Slack to show the real alert.

**Say:**

> “This campaign requests one email per hour for this sender. The Redis Lua reservation is atomic across workers, so the second message is delayed into a later eligible window rather than dropped. Because Slack is connected, the rate-limit event also sends a real Slack notification.”

This deliberately defers the extra message for about an hour, so do not wait for it to send during the recording. The dashboard's status list reflects the email's database status; use Bull Board to show the queue's actual deferred delay. Slack alerts are deduplicated per sender per UTC hour, so use a fresh sender or wait for a new UTC hour if this alert was already demonstrated.

### 4:45–5:00 | Close

**Say:**

> “The implementation uses no cron jobs. Delayed work is handled by BullMQ, PostgreSQL preserves email state across restarts, Redis coordinates sender pacing and hourly caps, and Elasticsearch provides tenant-scoped search. Ethereal keeps the send demo safe to inspect.”

## 10. Common problems

### Docker says the API cannot use port 5433, 4000, 5173, 6379, or 9200

Another program is already using that port. Close that program and run `docker compose up -d` again. This project uses host port **5433** for Postgres because 5432 may already be occupied; the API uses the private Compose address `postgres:5432`.

### Google says redirect URI mismatch

The Google OAuth client's authorized redirect URI must exactly match:

```text
http://localhost:4000/api/auth/google/callback
```

After changing `.env`, recreate the API container:

```powershell
docker compose up -d --force-recreate api
```

### Google login returns service unavailable

Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are filled in `.env`, then recreate the API as above. Also ensure your Google account is listed as a test user if the consent screen is in Testing mode.

### Slack connection fails or no alert arrives

Check the Slack client ID/secret, callback URL, installed app scopes, and that you completed the Slack installation. The callback must be:

```text
http://localhost:4000/api/integrations/slack/callback
```

Reconnect Slack from the dashboard profile menu after changing credentials. A sender only generates one alert per UTC hour; trying again immediately may not send another.

### Email remains queued

Check the scheduled time is in the future, `ETHEREAL_USER` and `ETHEREAL_PASS` are set correctly, and the queue's state in Bull Board. If an hourly sender cap was hit, the job is intentionally delayed, not dropped. Inspect API logs with:

```powershell
docker compose logs --tail=100 api
```

### Check all containers and logs

```powershell
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 migrate
```

## 11. What to submit after the demo

- Keep the GitHub repository private.
- Confirm the latest `main` branch is pushed.
- In repository **Settings → Collaborators**, invite `Mitrajit` and `Yadav036`.
- Record a video no longer than five minutes using the timeline above. Do not include `.env`, tokens, passwords, cookies, or real lead data in the recording.
- Include this guide, `README.md`, and the demo video link/file in the submission as required by the assignment.
