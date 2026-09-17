RIMURU WA — COMMUNITY + RPG/CASINO/CARDS + /PLAY COMBINED PATCH

REPLACE:
  src/cards.js
  src/ui-upgrade.js
  src/rpg-upgrade.js
ADD:
  src/music.js
  src/zone-router.js
  src/rpg-balance-upgrade.js
  src/casino-polish.js
  render-build.sh

COMMUNITY ZONES
Supported now: normal, casino, combat, duels.
Guild zone is deliberately NOT added yet.
Inside each group, Owner/Mod:
  /setzone normal
  /setzone casino
  /setzone combat
  /setzone duels
View: /zone or /zones
Casino commands only execute in casino.
Combat/fight only execute in combat.
Duels are reserved/routed to duels; actual PvP is not implemented yet.

RPG
Training effective base reduced from 75 Gold to 20 Gold (existing level scaling retained).
Battle positive XP/Gold/Gems rewards increased ~20%.
/addrpgcoin <amount> or /addrpggold <amount> — reply to user; Owner/Mod.
/setrpgcoin and /setrpggold also supported.
Masters now comment after battle wins/losses.
Masters can assist once in a battle; chance scales with Bond and damage is deterministic in engine.

CASINO
Slots/coinflip/dice/roulette output explicitly shows WIN/LOSS/PUSH, net gained/lost and wallet.

CARDS
Keeps prior fixes: clean line breaks, exact/token name search, reply 1/2/3 to the exact result message.

MUSIC
/play <song or YouTube URL>
Persistent global bandwidth usage.
100 MB fast threshold, 150 MB total daily cap defaults.
One active download at a time.
Actual final MP3 size x2 is charged in Render-fast mode.
render-build.sh installs official standalone yt-dlp.
IMPORTANT: ffmpeg still must exist on Render PATH. The build fails loudly if it does not, instead of deploying a broken /play.
Set Render Build Command to:
  bash render-build.sh
Start command stays your existing npm start.

Optional env:
  MUSIC_FAST_DAILY_MB=100
  MUSIC_TOTAL_DAILY_MB=150
  MUSIC_MAX_MINUTES=15

GitHub slow-mode worker is still a later phase; this patch makes Render fast mode real.
