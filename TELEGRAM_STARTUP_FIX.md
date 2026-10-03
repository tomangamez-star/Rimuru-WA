# Telegram startup resilience fix

Replace `src/telegram-control.js` with the file in this archive and deploy.

The controller now starts in the background. If Telegram is unreachable, times out, or its environment variables are absent:

- WhatsApp stays online.
- The Lily dashboard stays online.
- Render does not exit with status 1.
- Telegram initialization retries every five seconds until it connects.

No new environment variables are required.
