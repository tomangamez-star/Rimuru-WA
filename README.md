# Rimuru WhatsApp Bot — Website Controlled

Lily is controlled from the private owner dashboard at `/dashboard`.

## Commands

Owner website:

- Pair or replace the WhatsApp account with a phone-number code.
- View connection, storage, provider and memory status.
- Reconnect, pause/resume, inspect incidents, and take control from a stale deployment.

WhatsApp:

- `/ping` or `/test` — immediate reply with processing and delivery latency.
- `/dbping` — performs a real Supabase query and reports query time.
- `/image` — reads and uploads a bundled image, then reports disk/upload time.
- `/api` — downloads and uploads an external image, then reports each stage.

## Required environment variables

- `DASHBOARD_PASSWORD` — strong private password for `/dashboard`.
- `DATABASE_URL` — Supabase Postgres connection string; use the pooler URL.
- `WA_SESSION_ID` — optional; defaults to `rimuru-wa-test`.

## Deploy

Upload the contents to a GitHub repository and deploy it as a Node web service.
The included `render.yaml` is usable on Render. For the actual speed experiment,
an always-on host is preferred because Render Free sleeping would reproduce
Pantheon's cold-start problem.

Build command:

```text
npm ci
```

Start command:

```text
npm start
```

After deployment, open `https://YOUR-SERVICE.onrender.com/dashboard`, sign in,
and use **Take control** if the instance is in standby. Use the Accounts page
to generate a pairing code, then enter it in WhatsApp's **Linked devices → Link
with phone number** screen.

## Reading the result

- `Processing` is time spent inside the command handler.
- `Delivery` estimates how long WhatsApp took to deliver the message to the bot.

Test immediately, after several rapid commands, after 30–60 minutes idle, and
after a deployment restart. The Supabase session should survive restarts.
