# Lily website-only control patch

Copy the included files over the matching repository paths. Delete `src/telegram-control.js`, commit, and redeploy.

## Changes

- Telegram is completely removed from startup and control.
- No Telegram token or Telegram owner ID is required.
- The owner website controls status, pairing, reconnecting, pause/resume, AI health, incidents and memory.
- A password-protected **Take control** button resolves a permanently stuck standby lease.
- The previous process detects the ownership transfer, shuts down WhatsApp, and the selected deployment waits 12 seconds before connecting.

After deployment, open `/dashboard`, sign in, and press **Take control** if the instance shows Standby. Once it becomes Active, pairing and reconnect controls are enabled.

You may remove `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OWNER_ID` from Render after deployment.
