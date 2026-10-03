# Lily true multi-pair patch

This build replaces the single replaceable WhatsApp socket with a session manager.

## What changed

- Pairing a number creates a new session; it does not clear an existing one.
- All saved session IDs are discovered from `rimuru_wa_auth` during startup.
- Every account has an independent Baileys socket, authentication namespace, connection state, pause state, retry loop and dashboard controls.
- AI memories and conversation history are namespaced by Lily account while economy/RPG progress remains shared.
- The Accounts screen lists every Lily slot and can pair, pause, reconnect or remove each one.
- Telegram remains completely removed.

## Deploy

Replace the repository files with this build and redeploy normally. Existing primary authentication under `WA_SESSION_ID` is preserved.

Optional Render variable:

- `WA_MAX_SESSIONS=5` — maximum simultaneously configured accounts (allowed range 1–20).

Use `/dashboard`, open **Accounts**, enter an optional slot label and the new number, then enter the generated pairing code in WhatsApp under **Linked devices → Link with phone number**.

Only use **Remove** when you intentionally want to log out and permanently delete that slot's saved WhatsApp authentication.
