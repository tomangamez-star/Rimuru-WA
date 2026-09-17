RIMURU-WA — WHATSAPP RPG UI UPGRADE

REPLACE:
  src/ui.js
  src/rpg.js
  src/rpg-store.js
  src/economy-store.js
  src/economy-router.js

This is a complete-file package. No installer scripts.

CHANGES
- /start now sends the existing Ryuden welcome image, then native WhatsApp path buttons:
  ⚔️ Enter Odyssey
  🎰 Enter Casino
  📜 Main Menu
- RPG is now button-first instead of Telegram-style command dumps.
- /rpg opens a compact WhatsApp dashboard.
- Native buttons navigate Explore, Master, Inventory, Guild, Odyssey, Daily, and back.
- Master selection is button-based.
- Exploration results offer Continue / Inventory / RPG Home buttons.
- Registration gate remains global.
- Guild admin-vote system remains.
- /addcoin and /setbal remain owner-only.
- AI master/NPC communication is intentionally NOT connected yet. The button/state placeholder is prepared, but deterministic game state remains authoritative.
- Existing server.js/message-guard.js remain untouched.

IMPORTANT SERVER NOTE
Your server's interactive callback dispatcher must pass IDs beginning with rpg_ and start_ to ui.section(), not only menu_/casino_.
If your current server.js still filters IDs to only menu_ or casino_, the new buttons will render but taps will not route.
