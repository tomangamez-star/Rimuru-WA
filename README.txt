RIMURU WA — ODYSSEY COMPLETION PASS V4

Replace package.json and src/economy-router.js, then ADD the other included src files.
No existing server.js, ui.js, rpg.js, rpg-store.js or ai.js needs to be overwritten.
The package start command preloads the upgrade layer cleanly over the current deployed base.

Included:
- Persistent /mod add, /mod remove, /mod list (Original Owner only)
- /endmission confirmation + /missions log
- NPC conversation closes when mission is abandoned
- NPC hard knowledge boundary; meta/bot/AI/bug questions route to Rimuru
- NPC replies capped to 1–3 short sentences
- Master hard knowledge boundary; meta questions route to Rimuru
- Persistent Supabase scoped AI memories: Rimuru, each Master, each NPC
- Memory extraction for names/nicknames, age, likes/dislikes, favorites, preferences
- 15-part authored Odyssey I story layer and progression
- Story boss encounters at Parts 5, 10 and 15
- Faster combat: normal fights target roughly 4–5 good attacks
- One combined combat result + next-turn interface per action

TEST AFTER DEPLOY:
/mod list
/missions
/endmission
/story
/combat
/talk then tell Master a preference; later restart/redeploy and mention it naturally
During NPC talk ask a bot/meta question; Rimuru should answer instead of the NPC.
