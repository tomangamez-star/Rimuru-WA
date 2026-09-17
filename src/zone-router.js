'use strict'
const {database}=require('./auth-store'),{isOwner}=require('./access'),{isModerator}=require('./economy-router')
const VALID=new Set(['normal','casino','combat','duels'])
const LABEL={normal:'🌊 Ryuden',casino:'🎰 Casino',combat:'⚔️ Combat',duels:'🥊 Duels'}
function db(){const d=database();if(!d)throw Error('DATABASE_URL is required for zones');return d}
let ready=false
async function ensureSchema(){if(ready)return;await db().query(`CREATE TABLE IF NOT EXISTS rimuru_wa_zones(group_jid TEXT PRIMARY KEY,zone TEXT NOT NULL CHECK(zone IN ('normal','casino','combat','duels')),display_name TEXT NOT NULL DEFAULT '',set_by TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()); CREATE UNIQUE INDEX IF NOT EXISTS rimuru_wa_one_group_per_zone ON rimuru_wa_zones(zone);`);ready=true}
async function zoneFor(jid){if(!String(jid).endsWith('@g.us'))return null;await ensureSchema();return (await db().query('SELECT * FROM rimuru_wa_zones WHERE group_jid=$1',[jid])).rows[0]||null}
async function groupFor(zone){await ensureSchema();return (await db().query('SELECT * FROM rimuru_wa_zones WHERE zone=$1',[zone])).rows[0]||null}
function required(command){
 if(['/slots','/cf','/coinflip','/dice','/roulette','/casino'].includes(command))return 'casino'
 if(['/combat','/fight'].includes(command))return 'combat'
 if(['/duel','/duels','/challenge'].includes(command))return 'duels'
 return null
}
async function guard(sock,m,command){
 const need=required(command); if(!need)return false
 const jid=m.key.remoteJid
 if(!String(jid).endsWith('@g.us')){await sock.sendMessage(jid,{text:`📍 *${LABEL[need].toUpperCase()} ZONE ONLY*\n\nThis command is available inside the Community's *${LABEL[need]}* group.`},{quoted:m});return true}
 const here=await zoneFor(jid); if(here?.zone===need)return false
 const target=await groupFor(need)
 const destination=target?.display_name||LABEL[need]
 await sock.sendMessage(jid,{text:`📍 *WRONG ZONE*\n\nThis command belongs in *${destination}*.\nHead to that Community group and try again.`},{quoted:m})
 return true
}
async function handle(sock,m,c,userId){
 if(!['/setzone','/zone','/zones'].includes(c.command))return false
 const jid=m.key.remoteJid
 if(c.command==='/zone'){const z=await zoneFor(jid);await sock.sendMessage(jid,{text:z?`📍 This group is registered as *${LABEL[z.zone]}*.`:'📍 This group has no Rimuru zone assigned.'},{quoted:m});return true}
 if(c.command==='/zones'){await ensureSchema();const rows=(await db().query('SELECT * FROM rimuru_wa_zones ORDER BY zone')).rows;await sock.sendMessage(jid,{text:`🗺️ *RIMURU COMMUNITY ZONES*\n\n${rows.length?rows.map(x=>`${LABEL[x.zone]} — *${x.display_name||'Registered group'}*`).join('\n'):'No zones registered yet.'}`},{quoted:m});return true}
 if(!(isOwner(userId)||await isModerator(userId))){await sock.sendMessage(jid,{text:'🛡️ Only the Original Owner or a Rimuru moderator can configure zones.'},{quoted:m});return true}
 if(!String(jid).endsWith('@g.us')){await sock.sendMessage(jid,{text:'📍 Run */setzone* inside the group you want to register.'},{quoted:m});return true}
 const z=String(c.args[0]||'').toLowerCase()
 if(!VALID.has(z)){await sock.sendMessage(jid,{text:'Use */setzone normal*, */setzone casino*, */setzone combat*, or */setzone duels*.'},{quoted:m});return true}
 let name=''
 try{name=(await sock.groupMetadata(jid))?.subject||''}catch{}
 await ensureSchema()
 await db().query(`INSERT INTO rimuru_wa_zones(group_jid,zone,display_name,set_by) VALUES($1,$2,$3,$4) ON CONFLICT(group_jid) DO UPDATE SET zone=EXCLUDED.zone,display_name=EXCLUDED.display_name,set_by=EXCLUDED.set_by,updated_at=NOW()`,[jid,z,name,userId])
 await sock.sendMessage(jid,{text:`✅ *ZONE REGISTERED*\n\n${name?`*${name}*\n`:''}${LABEL[z]}\n\nRimuru will now enforce commands assigned to this zone.`},{quoted:m});return true
}
module.exports={ensureSchema,zoneFor,groupFor,guard,handle,required,LABEL}
