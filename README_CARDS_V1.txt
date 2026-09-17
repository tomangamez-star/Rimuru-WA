RIMURU WA — CARDS V1 (Telegram Archive Bridge)
================================================

FILES
Replace:
  src/ui-upgrade.js
Add:
  src/cards.js
  src/card-media.js

No server.js replacement. No RPG/Casino/AI engine replacement.

RENDER ENVIRONMENT
Required:
  TELEGRAM_CARD_ARCHIVE_CHAT_ID=-100xxxxxxxxxx

IMPORTANT FOR THE EXISTING OG ARCHIVE:
  TELEGRAM_CARD_ARCHIVE_BOT_TOKEN=<OG Telegram Rimuru bot token>

Why this second token exists:
Telegram file_id values are bot-specific. The shoob_cards catalogue was archived by OG Telegram Rimuru, so a different Telegram bot normally cannot call getFile with those old file_ids. Merely adding the WhatsApp controller bot to the archive does NOT grant Bot API access to old group history.

This does NOT replace TELEGRAM_BOT_TOKEN. TELEGRAM_BOT_TOKEN remains WhatsApp Rimuru's controller bot. TELEGRAM_CARD_ARCHIVE_BOT_TOKEN is only used for getFile/download calls against the old archive file_ids. It does not poll Telegram, so it will not conflict with OG Rimuru's getUpdates polling.

Optional Supabase cache:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
  SUPABASE_CARD_CACHE_BUCKET=rimuru-wa-card-cache   (optional override)

If the service-role/secret storage key is configured, first successful card fetch is cached in Supabase Storage. Later sends read the cache first, reducing repeated Telegram downloads. WhatsApp/Baileys still uploads the requested media from Render, so /collection is intentionally text-only and claims do not resend artwork.

COMMANDS
  /cards                 card hub/status
  /collection            text-only collection (bandwidth friendly)
  /cardinfo <id>         metadata only
  /card <id>             explicitly open/send artwork
  /spawncard             owner/mod: random unowned archive card
  /spawncard <id>        owner/mod: exact archive card
  !claim card <id>       claim active group spawn

CLAIM RULES
- Group only.
- User must already be registered with /start.
- Active spawn lasts 10 minutes.
- Exact ID required.
- First successful atomic database claim wins.
- A card can only have one WhatsApp owner globally.
- Claim response is text only; artwork is not resent.

DATABASE
Creates automatically:
  rimuru_wa_card_claims
  rimuru_wa_card_spawns
Reads the existing shared:
  shoob_cards

TEST ORDER
1. Deploy and confirm startup is healthy.
2. In a group: /spawncard
3. Verify the archived artwork appears and caption says !claim card <id>.
4. Two users can try the same !claim card <id>; only one should win.
5. Winner: /collection
6. /cardinfo <id> should send text only.
7. /card <id> should send artwork and should use Supabase cache after first successful fetch when cache credentials are configured.

If spawn says Telegram getFile failed, TELEGRAM_CARD_ARCHIVE_BOT_TOKEN is not the bot identity that originally created those archive file_ids. Use OG Rimuru's Telegram bot token for this read-only archive bridge or re-ingest the archive with the WhatsApp controller bot.
