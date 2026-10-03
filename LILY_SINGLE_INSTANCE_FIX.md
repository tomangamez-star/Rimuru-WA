# Lily single-instance ownership patch

Copy the files over the matching repository paths and deploy normally. No new environment variables are required.

## What changes

- A Supabase lease allows exactly one Render process to use a `WA_SESSION_ID`.
- A fresh deployment serves `/health` while waiting for the old deployment to shut down.
- Standby processes do not connect to WhatsApp or poll Telegram.
- The active process refreshes ownership every 10 seconds.
- A stale lease expires after 45 seconds.
- Graceful shutdown releases ownership immediately.
- A WhatsApp `conflict/replaced` disconnect waits 60 seconds before a safe recovery attempt instead of entering a rapid reconnect war. This also protects the first rollout, where the old deployment does not yet understand leases.

Lily's memories, economy and WhatsApp authentication remain unchanged.
