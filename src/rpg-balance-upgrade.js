'use strict'
const store=require('./rpg-store'),{database}=require('./auth-store'),{isOwner}=require('./access'),{isModerator,quotedUserId,canonicalUserId}=require('./economy-router')
const TRAIN_BASE=20,REWARD_MULT=1.20
let installed=false
function db(){const d=database();if(!d)throw Error('DATABASE_URL is required');return d}
function install(){
 if(installed)return;installed=true
 const train=store.train
 if(typeof train==='function')store.train=async(id,cost)=>train(id,TRAIN_BASE+Math.max(0,Number(cost||0)-75))
 // Increase positive reward methods when present. Battle rewards in rpg-upgrade are handled separately.
 for(const key of ['addGold','addGems','addXp','reward']){
   const fn=store[key]
   if(typeof fn==='function')store[key]=async function(...args){if(typeof args[1]==='number'&&args[1]>0)args[1]=Math.round(args[1]*REWARD_MULT);return fn.apply(this,args)}
 }
}
async function admin(sock,m,c){
 if(!['/addrpgcoin','/addrpggold','/setrpgcoin','/setrpggold'].includes(c.command))return false
 const id=canonicalUserId(m.key),jid=m.key.remoteJid
 if(!(isOwner(id)||await isModerator(id))){await sock.sendMessage(jid,{text:'🛡️ Owner/moderator only.'},{quoted:m});return true}
 const target=quotedUserId({extendedTextMessage:m.message?.extendedTextMessage})||id
 const amount=Number(String(c.args[0]||'').replace(/,/g,''))
 if(!Number.isFinite(amount)||amount<0){await sock.sendMessage(jid,{text:`Reply to a user with *${c.command} <amount>*.`},{quoted:m});return true}
 await store.ensurePlayer(target)
 const set=c.command.startsWith('/set')
 const q=await db().query(set?'UPDATE rimuru_rpg_players SET gold=$2,updated_at=NOW() WHERE user_id=$1 RETURNING gold':'UPDATE rimuru_rpg_players SET gold=gold+$2,updated_at=NOW() WHERE user_id=$1 RETURNING gold',[target,Math.floor(amount)])
 await sock.sendMessage(jid,{text:`🪙 *RPG GOLD ${set?'SET':'ADDED'}*\n\nTarget: *${target}*\nAmount: *${Math.floor(amount)}*\nBalance: *${q.rows[0]?.gold||0} RPG Gold*`},{quoted:m});return true
}
module.exports={install,admin,REWARD_MULT,TRAIN_BASE}
