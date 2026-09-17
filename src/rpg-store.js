'use strict'
const { database } = require('./auth-store')

const RANKS=['E','D','C','B','A','S','SS','SSS','Monarch']
const MASTERS=[
 {key:'goku',name:'Goku',universe:'Dragon Ball',passive:'Saiyan Spirit',skill:'Kamehameha',ultimate:'Limit Break'},
 {key:'jinwoo',name:'Sung Jin-Woo',universe:'Solo Leveling',passive:'Shadow Authority',skill:'Dagger Rush',ultimate:'Arise'},
 {key:'gojo',name:'Satoru Gojo',universe:'Jujutsu Kaisen',passive:'Infinity',skill:'Hollow Purple',ultimate:'Unlimited Void'},
 {key:'kakashi',name:'Kakashi Hatake',universe:'Naruto',passive:'Copy Ninja',skill:'Raikiri',ultimate:'Kamui'},
 {key:'ichigo',name:'Ichigo Kurosaki',universe:'Bleach',passive:'Substitute Soul',skill:'Getsuga Tensho',ultimate:'Bankai'},
 {key:'luffy',name:'Monkey D. Luffy',universe:'One Piece',passive:'Unbreakable Will',skill:'Red Roc',ultimate:'Gear Fifth'},
 {key:'tanjiro',name:'Tanjiro Kamado',universe:'Demon Slayer',passive:'Total Concentration',skill:'Hinokami Kagura',ultimate:'Sun Breathing'},
 {key:'frieren',name:'Frieren',universe:"Frieren: Beyond Journey's End",passive:'Ancient Mage',skill:'Zoltraak',ultimate:'Mana Release'},
 {key:'senku',name:'Senku Ishigami',universe:'Dr. Stone',passive:'Ten Billion Percent',skill:'Science Arsenal',ultimate:'Kingdom of Science'},
 {key:'denji',name:'Denji',universe:'Chainsaw Man',passive:'Devil Heart',skill:'Chainsaw Rush',ultimate:'Hero of Hell'}
]
function db(){const d=database();if(!d)throw new Error('DATABASE_URL is required for RPG');return d}
function xpNeed(level){return 100+Number(level||1)*40}
function rankFor(level){return RANKS[Math.min(RANKS.length-1,Math.floor((Math.max(1,level)-1)/10))]}
function power(p){return Math.floor(p.hp/5+p.atk*3+p.def*2+p.spd*2+p.luck+p.crit*2+p.level*10)}
function norm(r){if(!r)return null;return {userId:r.user_id,username:r.username,rank:r.rank,level:+r.level,xp:+r.xp,hp:+r.hp,atk:+r.atk,def:+r.def,spd:+r.spd,luck:+r.luck,crit:+r.crit,powerScore:+r.power_score,currentMaster:r.current_master,currentTitle:r.current_title,guildId:r.guild_id,gold:+r.gold,gems:+r.gems,energy:+r.energy,storyChapter:+r.story_chapter,inventory:r.inventory||[],abilities:r.abilities||[],ultimatePower:+r.ultimate_power,ultimateUses:+r.ultimate_uses,bondPoints:+r.bond_points,winCount:+r.win_count,lossCount:+r.loss_count,drawCount:+r.draw_count,lastDailyAt:r.last_daily_at}}
async function ensureSchema(){
 await db().query(`
 CREATE TABLE IF NOT EXISTS rimuru_rpg_players(
 user_id TEXT PRIMARY KEY REFERENCES rimuru_wa_users(user_id) ON DELETE CASCADE,
 username TEXT NOT NULL DEFAULT '', rank TEXT NOT NULL DEFAULT 'E', level INT NOT NULL DEFAULT 1, xp INT NOT NULL DEFAULT 0,
 hp INT NOT NULL DEFAULT 100, atk INT NOT NULL DEFAULT 10, def INT NOT NULL DEFAULT 10, spd INT NOT NULL DEFAULT 10,
 luck INT NOT NULL DEFAULT 10, crit INT NOT NULL DEFAULT 5, power_score INT NOT NULL DEFAULT 75,
 current_master TEXT, current_title TEXT, guild_id BIGINT, gold BIGINT NOT NULL DEFAULT 0, gems BIGINT NOT NULL DEFAULT 0,
 energy INT NOT NULL DEFAULT 100, story_chapter INT NOT NULL DEFAULT 0, inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
 abilities JSONB NOT NULL DEFAULT '[]'::jsonb, ultimate_power INT NOT NULL DEFAULT 100, ultimate_uses INT NOT NULL DEFAULT 0,
 bond_points INT NOT NULL DEFAULT 0, win_count INT NOT NULL DEFAULT 0, loss_count INT NOT NULL DEFAULT 0, draw_count INT NOT NULL DEFAULT 0,
 last_daily_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS rimuru_guilds(
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, group_jid TEXT NOT NULL UNIQUE, founder_user_id TEXT NOT NULL,
 level INT NOT NULL DEFAULT 1, xp BIGINT NOT NULL DEFAULT 0, treasury BIGINT NOT NULL DEFAULT 0, description TEXT NOT NULL DEFAULT '',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS rimuru_guild_members(
 guild_id BIGINT NOT NULL REFERENCES rimuru_guilds(id) ON DELETE CASCADE,user_id TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'member',joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),PRIMARY KEY(guild_id,user_id));
 CREATE TABLE IF NOT EXISTS rimuru_guild_proposals(
 id BIGSERIAL PRIMARY KEY,group_jid TEXT NOT NULL,name TEXT NOT NULL,proposer_user_id TEXT NOT NULL,
 admin_ids JSONB NOT NULL DEFAULT '[]'::jsonb,votes JSONB NOT NULL DEFAULT '[]'::jsonb,status TEXT NOT NULL DEFAULT 'pending',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours');
 CREATE UNIQUE INDEX IF NOT EXISTS rimuru_guild_one_pending_per_group ON rimuru_guild_proposals(group_jid) WHERE status='pending';
 `)
}
async function ensurePlayer(userId,name=''){await ensureSchema();const q=await db().query(`INSERT INTO rimuru_rpg_players(user_id,username) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET username=CASE WHEN $2<>'' THEN $2 ELSE rimuru_rpg_players.username END,updated_at=NOW() RETURNING *`,[userId,name]);return norm(q.rows[0])}
async function getPlayer(id){await ensureSchema();return norm((await db().query('SELECT * FROM rimuru_rpg_players WHERE user_id=$1',[id])).rows[0])}
async function setMaster(id,key){const m=MASTERS.find(x=>x.key===String(key).toLowerCase());if(!m)return null;await ensurePlayer(id);const bonus={goku:[20,5,1,3],jinwoo:[10,5,2,5],gojo:[10,6,1,4],kakashi:[5,4,2,5],ichigo:[15,5,2,3],luffy:[20,5,3,2],tanjiro:[10,4,3,3],frieren:[5,7,1,3],senku:[0,2,2,4],denji:[20,6,1,3]}[m.key]||[5,3,2,2];const r=(await db().query(
`UPDATE rimuru_rpg_players SET current_master=$2,hp=hp+$3,atk=atk+$4,def=def+$5,spd=spd+$6,abilities=$7::jsonb,updated_at=NOW() WHERE user_id=$1 RETURNING *`,
[id,m.name,...bonus,JSON.stringify([{name:m.skill,power:30}])]
)).rows[0];r.power_score=power(norm(r));await db().query('UPDATE rimuru_rpg_players SET power_score=$2 WHERE user_id=$1',[id,r.power_score]);return {player:norm(r),master:m}}
async function addProgress(id,{xp=0,gold=0,gems=0,item=null,win=0,loss=0}={}){let p=await ensurePlayer(id);let level=p.level,nxp=p.xp+xp;while(nxp>=xpNeed(level)){nxp-=xpNeed(level);level++}const rank=rankFor(level),inv=item?[...p.inventory,item]:p.inventory;const q=await db().query(`UPDATE rimuru_rpg_players SET xp=$2,level=$3,rank=$4,gold=GREATEST(0,gold+$5),gems=GREATEST(0,gems+$6),inventory=$7::jsonb,win_count=win_count+$8,loss_count=loss_count+$9,hp=hp+($3-level)*5,atk=atk+($3-level),def=def+($3-level),updated_at=NOW() WHERE user_id=$1 RETURNING *`,[id,nxp,level,rank,gold,gems,JSON.stringify(inv),win,loss]);let n=norm(q.rows[0]);const ps=power(n);await db().query('UPDATE rimuru_rpg_players SET power_score=$2 WHERE user_id=$1',[id,ps]);n.powerScore=ps;return n}
async function daily(id){const p=await ensurePlayer(id),now=Date.now();if(p.lastDailyAt&&now-new Date(p.lastDailyAt).getTime()<86400000)return {ok:false,remaining:86400000-(now-new Date(p.lastDailyAt).getTime())};const gold=100+Math.floor(Math.random()*151),gems=Math.random()<.2?1:0;await db().query('UPDATE rimuru_rpg_players SET gold=gold+$2,gems=gems+$3,last_daily_at=NOW(),updated_at=NOW() WHERE user_id=$1',[id,gold,gems]);return {ok:true,gold,gems}}
async function createProposal(groupJid,name,proposer,adminIds){await ensureSchema();const existing=(await db().query("SELECT * FROM rimuru_guild_proposals WHERE group_jid=$1 AND status='pending' AND expires_at>NOW()",[groupJid])).rows[0];if(existing)return {ok:false,message:`A guild proposal (*${existing.name}*) is already waiting for votes.`};if((await db().query('SELECT 1 FROM rimuru_guilds WHERE group_jid=$1 OR LOWER(name)=LOWER($2)',[groupJid,name])).rowCount)return {ok:false,message:'That group already has a guild or the guild name is taken.'};const others=adminIds.filter(x=>x!==proposer);if(!others.length){const g=await createGuild(groupJid,name,proposer);return {ok:true,created:true,guild:g}};const p=(await db().query('INSERT INTO rimuru_guild_proposals(group_jid,name,proposer_user_id,admin_ids,votes) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) RETURNING *',[groupJid,name,proposer,JSON.stringify(adminIds),JSON.stringify([proposer])])).rows[0];return {ok:true,created:false,proposal:p,needed:Math.floor(adminIds.length/2)+1}}
async function voteProposal(groupJid,userId){const c=await db().connect();try{await c.query('BEGIN');const p=(await c.query("SELECT * FROM rimuru_guild_proposals WHERE group_jid=$1 AND status='pending' AND expires_at>NOW() FOR UPDATE",[groupJid])).rows[0];if(!p){await c.query('ROLLBACK');return {ok:false,message:'There is no active guild proposal in this group.'}}const admins=p.admin_ids||[];if(!admins.includes(userId)){await c.query('ROLLBACK');return {ok:false,message:'Only group admins can vote on this guild proposal.'}}const votes=[...new Set([...(p.votes||[]),userId])],needed=Math.floor(admins.length/2)+1;if(votes.length>=needed){const g=(await c.query('INSERT INTO rimuru_guilds(name,group_jid,founder_user_id) VALUES($1,$2,$3) RETURNING *',[p.name,groupJid,p.proposer_user_id])).rows[0];await c.query("UPDATE rimuru_guild_proposals SET status='approved',votes=$2::jsonb WHERE id=$1",[p.id,JSON.stringify(votes)]);await c.query("INSERT INTO rimuru_guild_members(guild_id,user_id,role) VALUES($1,$2,'founder') ON CONFLICT DO NOTHING",[g.id,p.proposer_user_id]);await c.query('UPDATE rimuru_rpg_players SET guild_id=$2 WHERE user_id=$1',[p.proposer_user_id,g.id]);await c.query('COMMIT');return {ok:true,created:true,guild:g,votes:votes.length,needed}}await c.query('UPDATE rimuru_guild_proposals SET votes=$2::jsonb WHERE id=$1',[p.id,JSON.stringify(votes)]);await c.query('COMMIT');return {ok:true,created:false,name:p.name,votes:votes.length,needed}}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
async function createGuild(groupJid,name,founder){const g=(await db().query('INSERT INTO rimuru_guilds(name,group_jid,founder_user_id) VALUES($1,$2,$3) RETURNING *',[name,groupJid,founder])).rows[0];await db().query("INSERT INTO rimuru_guild_members(guild_id,user_id,role) VALUES($1,$2,'founder') ON CONFLICT DO NOTHING",[g.id,founder]);await ensurePlayer(founder);await db().query('UPDATE rimuru_rpg_players SET guild_id=$2 WHERE user_id=$1',[founder,g.id]);return g}
async function guildForGroup(jid){await ensureSchema();return (await db().query('SELECT * FROM rimuru_guilds WHERE group_jid=$1',[jid])).rows[0]||null}
async function guildForPlayer(id){await ensureSchema();return (await db().query('SELECT g.* FROM rimuru_guilds g JOIN rimuru_guild_members m ON m.guild_id=g.id WHERE m.user_id=$1 LIMIT 1',[id])).rows[0]||null}
async function joinGroupGuild(jid,id){const g=await guildForGroup(jid);if(!g)return null;await ensurePlayer(id);await db().query("INSERT INTO rimuru_guild_members(guild_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",[g.id,id]);await db().query('UPDATE rimuru_rpg_players SET guild_id=$2 WHERE user_id=$1',[id,g.id]);await db().query('UPDATE rimuru_guilds SET member_count=(SELECT COUNT(*) FROM rimuru_guild_members WHERE guild_id=$1) WHERE id=$1',[g.id]);return g}
async function leaderboard(limit=10){await ensureSchema();return (await db().query('SELECT * FROM rimuru_rpg_players ORDER BY power_score DESC,level DESC LIMIT $1',[limit])).rows.map(norm)}
module.exports={ensureSchema,ensurePlayer,getPlayer,setMaster,addProgress,daily,createProposal,voteProposal,guildForGroup,guildForPlayer,joinGroupGuild,leaderboard,MASTERS,RANKS,xpNeed}
