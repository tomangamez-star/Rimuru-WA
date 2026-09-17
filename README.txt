RIMURU WA — ODYSSEY WORLD + COMBAT V2

Replace the included src files in Rimuru-WA with these files.
No installer script.

Original Owner
- WhatsApp number recognized in code: 2349110799878
- /owner or /ownerpanel
- /addcoin and /setbal remain Original-Owner only.
- /ai global on|off is Original-Owner only.
- Regular users can still /ai on|off for their own conversation preference; this does not change global AI state.

Major RPG changes
- Turn-based owned combat windows: Attack, Guard, Skill, Item, Ultimate, Retreat.
- Persistent active battle state in Supabase.
- Technique inspection and upgrades.
- Shop with RPG Gold and rarer Gem purchases.
- Master training: RPG Gold cost, 30-minute cooldown, stat growth, Bond growth.
- Master chat can earn +1 Bond at most once per 5 minutes.
- Master ultimate unlock milestone at 60 Bond through training.
- 10 exploration advances per rolling 15-minute window.
- Fixed Odyssey I plot foundation: The Thirteenth Echo.
- Persistent story flags and NPC state.
- Kael NPC scene with free-form AI conversation plus Accept/Decline quest choice.
- NPC messages are named so users know who is speaking.
- AI never directly mutates authoritative story/reward/combat state.
- Stronger Master personality prompting, including Gojo/Sukuna profiles.
- /lb now opens Wealth vs Odyssey leaderboard choices.
- /wealthlb (or /wlb) = wealth leaderboard.
- /rlb = Odyssey leaderboard.
- Leaderboard name formatting cleaned up.

Existing Optimization V1 preserved
- Player-owned RPG windows.
- Global outgoing WhatsApp burst guard.
- 60-master archive, max 4 per franchise.
- Groq automatic model fallback.

Groq
- GROQ_API_KEY required for live AI.
- GROQ_MODEL optional.
- Automatic fallback: openai/gpt-oss-20b -> openai/gpt-oss-120b.

Database
- RPG schema auto-migrates with additive columns for training, exploration history, techniques, story state and active battle.
