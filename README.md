# Rimuru WhatsApp Bot — Website Controlled

The primary Lily account and secondary Boy Alone auto-reply account share one secure website at `/dashboard`. The password determines which isolated control room opens.

## Commands

Owner website:

- Pair multiple WhatsApp accounts with phone-number codes.
- View connection, storage, provider and memory status.
- Reconnect, pause/resume, inspect incidents, and take control from a stale deployment.

WhatsApp:

- `/ping` or `/test` — immediate reply with processing and delivery latency.
- `/dbping` — performs a real Supabase query and reports query time.
- `/image` — reads and uploads a bundled image, then reports disk/upload time.
- `/api` — downloads and uploads an external image, then reports each stage.

## Required environment variables

- `DASHBOARD_PASSWORD` — strong private password for `/dashboard`.
- `BOY_ALONE_PASSWORD` — separate password for the limited Boy Alone dashboard. Never reuse the owner password.
- `DATABASE_URL` — Supabase Postgres connection string; use the pooler URL.
- `WA_SESSION_ID` — optional; defaults to `rimuru-wa-test`.
- `WA_MAX_SESSIONS` — optional maximum paired accounts; defaults to `5`.

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
with phone number** screen. The primary saved session remains Lily. New secondary
sessions default to Boy Alone mode. Signing in with `BOY_ALONE_PASSWORD` exposes
only Boy Alone's personality, cooldown, reply state, muted chats and scoped memory.

## Reading the result

- `Processing` is time spent inside the command handler.
- `Delivery` estimates how long WhatsApp took to deliver the message to the bot.

Test immediately, after several rapid commands, after 30–60 minutes idle, and
after a deployment restart. The Supabase session should survive restarts.
