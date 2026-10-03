# Lily Control Room patch

## Install

Copy the files in this archive over the matching paths in the Rimuru-WA repository, then commit and deploy normally.

In Render, add a secret environment variable named `DASHBOARD_PASSWORD` with a strong unique password. After the deployment finishes, open:

`https://YOUR-RENDER-SERVICE.onrender.com/dashboard`

## Included in V1

- Password-protected, mobile-first owner dashboard
- WhatsApp connection state, masked account, uptime and message activity
- Pause/resume and reconnect controls
- Deliberate current-session replacement with a pairing code
- Groq model availability, cooldown state and AI incident history
- Memory counts, search and individual deletion
- CSRF protection, secure cookies and login throttling

## Account architecture

This version controls the current WhatsApp account. It does not pretend to run multiple accounts in one process. True multi-number support needs a session manager with one isolated Baileys socket/auth namespace per number. The recommended later design is shared long-term user memory with per-account/per-chat short-term conversation history.

## Verification

Run:

```sh
npm ci
npm run check
node --test test/*.test.js
```

