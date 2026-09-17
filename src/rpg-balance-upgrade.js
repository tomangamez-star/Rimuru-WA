'use strict'
const store=require('./rpg-store'),{database}=require('./auth-store'),{isOwner,norm}=require('./access'),{isModerator,canonicalUserId}=require('./economy-router')
const TRAIN_BASE=20,REWARD_MULT=1.20
let installed=false
function db(){const d=database();if(!d)throw Error('DATABASE_URL is required');return d}

function jidId(v){return v?norm(String(v).split(':')[0].split('@')[0]):''}
function quotedCandidates(m){
 const msg=m?.message||{},ci=msg.extendedTextMessage?.contextInfo||msg.imageMessage?.contextInfo||msg.videoMessage?.contextInfo||msg.documentMessage?.contextInfo||{}
 return [...new Set([ci.participantAlt,ci.participant].map(jidId).filter(Boolean))]
}
async function resolveRpgTarget(m,self){
 const candidates=quotedCandidates(m)
 if(!candidates.length)return self
 // Prefer whichever quoted identity is already the real RPG row.
 for(const x of candidates){if((await db().query('SELECT 1 FROM rimuru_rpg_players WHERE user_id=$1',[x])).rowCount)return x}
 return candidates[0]
}
function install(){
 if(installed)return;installed=true
 const original=store.train
 if(typeof original==='function')store.train=async(id,_displayedCost)=>{
   // One source of truth: training always starts at 20, with +25 each 5 levels.
   const p=await store.ensurePlayer(id)
   const realCost=TRAIN_BASE+Math.floor(Number(p.level||1)/5)*25
   return original(id,realCost)
 }
 for(const key of ['addGold','addGems','addXp','reward']){
  const fn=store[key]
  if(typeof fn==='function')store[key]=async function(...args){if(typeof args[1]==='number'&&args[1]>0)args[1]=Math.round(args[1]*REWARD_MULT);return fn.apply(this,args)}
 }
}
async function admin(sock,m,c){
 if(!['/addrpgcoin','/addrpggold','/setrpgcoin','/setrpggold'].includes(c.command))return false
 const self=canonicalUserId(m.key),jid=m.key.remoteJid
 if(!(isOwner(self)||await isModerator(self))){await sock.sendMessage(jid,{text:'🛡️ Owner/moderator only.'},{quoted:m});return true}
 const target=await resolveRpgTarget(m,self)
 const amount=Number(String(c.args[0]||'').replace(/,/g,''))
 if(!Number.isFinite(amount)||amount<0){await sock.sendMessage(jid,{text:`Reply to a user with *${c.command} <amount>*.`},{quoted:m});return true}
 await store.ensurePlayer(target)
 const set=c.command.startsWith('/set'),n=Math.floor(amount)
 const q=await db().query(set?'UPDATE rimuru_rpg_players SET gold=$2,updated_at=NOW() WHERE user_id=$1 RETURNING gold':'UPDATE rimuru_rpg_players SET gold=gold+$2,updated_at=NOW() WHERE user_id=$1 RETURNING gold',[target,n])
 const verify=await store.getPlayer(target)
 await sock.sendMessage(jid,{text:`🪙 *RPG GOLD ${set?'SET':'ADDED'}*\n\nTarget: *${target}*\nAmount: *${n}*\nRPG Home balance: *${verify?.gold??q.rows[0]?.gold??0} Gold*\n\n✅ This is the same rimuru_rpg_players.gold used by Shop and Training.`},{quoted:m});return true
}
module.exports={install,admin,REWARD_MULT,TRAIN_BASE}
