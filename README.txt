RIMURU WA — PLAYER WINDOWS + GLOBAL OUTPUT GUARD + 60 MASTERS + GROQ AUTO-FALLBACK

Replace the included src files with these complete files.
No installer script is used.

WHAT CHANGED
1) Player-owned RPG windows
- Every RPG native button is stamped with the player who opened it.
- If another group member taps that player's RPG/Master/Inventory/etc. window, Rimuru refuses the action with NOT YOUR WINDOW.
- The foreign tap does not mutate the owner's RPG state.
- Public/non-RPG menus remain shareable.

2) Global WhatsApp account output protection
- Replaces the old per-user 4th-message mute behavior at server level.
- If Rimuru is about to emit more than 3 replies inside ~1.5 seconds, the account enters a randomized 5–10 second cooldown.
- Replies during cooldown are queued instead of blasted out.
- When cooldown ends, Rimuru sends one anti-spam notice, then drains queued replies at ~650ms spacing.
- This protects the bot account from bursts caused by many users at once.

3) Master Archive
- 10 featured Masters remain on the first selection screen.
- New Explore More Masters button opens 50 additional Masters.
- Total: 60 Masters.
- Archive is paged 10 per page, with Previous/Next and Featured navigation.
- Maximum 4 Masters from any one anime/franchise.
- Sukuna is included.
- /masters shows featured choices; /masters 1 opens archive page 1.
- /master <key> still works.

4) Groq AI fixed using the proven OG Rimuru strategy
- GROQ_MODEL is optional, not a single point of failure.
- If set, it is tried first.
- Automatic fallbacks: openai/gpt-oss-20b -> openai/gpt-oss-120b.
- Rimuru checks Groq's active model list when possible and skips unavailable candidates.
- Failed models automatically fall through to the next candidate.
- If every Groq model fails, Rimuru/Master gives a local in-character fallback instead of breaking game systems.
- Groq HTTP errors now include a short response body in logs for easier diagnosis.

RENDER ENV
Required for AI:
GROQ_API_KEY=<your key>

Optional override:
GROQ_MODEL=<preferred Groq model id>

You can leave GROQ_MODEL unset. The bot will use the automatic fallback chain.

FILES
src/server.js
src/message-guard.js
src/ui.js
src/rpg.js
src/rpg-store.js
src/ai.js
src/economy-store.js
src/economy-router.js

QUICK TEST
1. /start -> Enter Odyssey.
2. Open Master selection as Player A in a group.
3. Player B taps one of Player A's Master buttons -> should get NOT YOUR WINDOW and no selection occurs.
4. Player A taps Explore More Masters -> archive page 1 should open; Sukuna is available in the archive.
5. /ai on then chat with Rimuru; /talk after selecting a Master to test Master AI.
6. Generate a burst of 4+ reply-producing requests close together -> global cooldown should activate, then queued replies should resume slowly.

NOTE
Combat mechanics were intentionally NOT redesigned in this build. That remains the next RPG gameplay upgrade.
