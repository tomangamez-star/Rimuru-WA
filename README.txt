REUPLOAD — BUTTON TAP + SPAM PATCH

IMPORTANT: last time the modified server.js was NOT committed.

1. Put src/message-guard.js into your repo.
2. Put apply-patch.js in repo root.
3. Run:
   node apply-patch.js
4. You MUST now see src/server.js as modified.
5. Commit BOTH:
   src/server.js
   src/message-guard.js
6. Let Render redeploy.

Verification in GitHub:
Search src/server.js for:
  menu button text accepted

If that text is absent, the patch is NOT installed.

Behavior:
- Known WhatsApp menu labels may pass fromMe filtering.
- Ordinary fromMe messages stay ignored.
- First 3 reply-triggering messages in 5 seconds pass.
- 4th sends one warning and starts a random 5–10 second silence.
- During silence Rimuru intentionally doesn't reply.
