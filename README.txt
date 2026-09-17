RIMURU-WA — RYUDEN ODYSSEY RPG FOUNDATION

REPLACE:
  src/ui.js
  src/economy-store.js
  src/economy-router.js

ADD:
  src/rpg.js
  src/rpg-store.js

NO INSTALLER. NO server.js replacement.
This intentionally preserves your current button/spam server fix.

WHAT THIS ADDS
- Global /start registration gate: every slash command reaches ui.route first, so unregistered users are told to /start.
- RPG player schema tied to the existing Rimuru WhatsApp user ID.
- E -> D -> C -> B -> A -> S -> SS -> SSS -> Monarch ranks.
- Masters + master abilities.
- /rpg profile
- /masters and /master [key]
- /explore with enemies, bosses, treasure, story echoes, equipment drops, XP, leveling and 10% RPG-gold defeat loss.
- /daily
- /inventory
- /rlb RPG power leaderboard
- Guilds tied to WhatsApp groups.
- ONLY group admins can propose /guild create [name].
- Guild proposals require admin voting with /guild accept.
- Majority of current group admins approves. Proposer counts as the first vote.
- If the group has only one admin, creation is immediate because there are no other admins to vote.
- /guild join joins the approved guild for that WhatsApp group.
- Owner economy commands /addcoin and /setbal (/setbalance).

OWNER COMMAND SETUP
Set ONE of these Render env vars to your WhatsApp number in international format:
  OWNER_NUMBER=234...
or:
  OWNER_NUMBERS=234...,234...
Existing OWNER_ID is also accepted.

Admin coin commands:
  Reply to a user's message: /addcoin 500000
  Reply to a user's message: /setbal 1000000
If no reply is used, the owner targets themself.

IMPORTANT
This is the RPG foundation port, not the Cards phase.
It keeps casino coins separate from RPG Gold/Gems.
Existing server.js and message-guard.js should remain untouched.

TEST
1. From an unregistered number: /bal -> should demand /start.
2. /start
3. /rpg
4. /masters
5. /master gojo
6. /explore
7. /daily
8. In a WhatsApp group, as admin: /guild create Tempest
9. Another group admin: /guild accept
10. Member: /guild join
11. Owner reply to user: /addcoin 500000
12. Owner reply to user: /setbal 1000000
