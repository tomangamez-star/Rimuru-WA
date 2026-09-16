PHASE 1 FIXED PACKAGE

Upload/replace all four files under src/ exactly as included:
- src/server.js (REPLACE)
- src/auth-store.js (REPLACE)
- src/economy-store.js (NEW/REPLACE)
- src/economy-router.js (NEW/REPLACE)

No manual patching is required.

All four files pass `node --check`.

After Render redeploys, logs should contain:
  Phase 1 economy schema ready

Then test:
  /balance
  /dep 100000
  /wd 50000
  /bank

The existing WhatsApp session table is untouched.
