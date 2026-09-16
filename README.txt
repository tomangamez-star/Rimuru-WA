RIMURU-WA PHASE 2 — Games + Leaderboard + Menu

Upload/replace ALL files in src/.

New:
- casino.js
- ui.js

Modified:
- server.js
- economy-store.js
- economy-router.js
- auth-store.js (same working Phase 1 DB export)

Adds:
- persistent registration-aware /start
- native-button /menu
- Casino, Balance, Leaderboard, Games, Utilities, Help buttons
- /help 1, /help 2, /help 3
- /lb and /leaderboard
- /casino and /games
- /slots
- /cf /coinflip
- /dice
- /roulette (red/black/even/odd/low/high/straight)
- persistent games played/won/lost/wagered/casino profit stats

Casino multipliers/rules ported from the original Tempest Rimuru source:
Slots 2-match 2x / 3-match 4x; coinflip 2x; dice exact-number 6x;
European roulette even-money 2x and straight 36x.

This phase intentionally leaves Blackjack/Mines and their stateful native gameplay
for the next game batch rather than replacing the already-proven /mines transport test.

After deploy:
1. /start twice (first welcome, second welcome-back)
2. /menu and press every button
3. /help 1
4. /lb
5. /slots 1000
6. /cf heads 1000
7. /dice 3 1000
8. /roulette red 1000
9. redeploy and verify balance + registration + leaderboard persist.
