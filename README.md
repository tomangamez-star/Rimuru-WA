# Rimuru WhatsApp Speed Test — Telegram Controlled

This is a deliberately tiny WhatsApp latency test. It has no dashboard, media,
AI, moderation, card rendering, or Rimuru game logic.

## Commands

Private Telegram control bot (owner only):

- `/pair 2348076776671` — clears an invalid session and returns a phone code.
- `/status` — connection, saved-session and storage status.
- `/reconnect` — reconnects without deleting the saved session.
- `/ping` — verifies that the Telegram controller is alive.

WhatsApp:

- `/ping` or `/test` — immediate reply with processing and delivery latency.
- `/dbping` — performs a real Supabase query and reports query time.
- `/image` — reads and uploads a bundled image, then reports disk/upload time.
- `/api` — downloads and uploads an external image, then reports each stage.

## Required environment variables

- `TELEGRAM_BOT_TOKEN` — from Telegram BotFather.
- `TELEGRAM_OWNER_ID` — your numeric Telegram user ID, not username.
- `DATABASE_URL` — Supabase Postgres connection string; use the pooler URL.
- `WA_SESSION_ID` — optional; defaults to `rimuru-wa-test`.

The Telegram controller silently ignores everyone except the configured owner,
and it accepts commands only in the owner's private chat.

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

After deployment, message your Telegram controller:

```text
/status
/pair 2348076776671
```

Enter the returned code immediately in WhatsApp's **Linked devices → Link with
phone number** screen. Once `/status` says `connected`, send `/ping` to the
WhatsApp account from another account.

## Reading the result

- `Processing` is time spent inside the command handler.
- `Delivery` estimates how long WhatsApp took to deliver the message to the bot.

Test immediately, after several rapid commands, after 30–60 minutes idle, and
after a deployment restart. The Supabase session should survive restarts.
