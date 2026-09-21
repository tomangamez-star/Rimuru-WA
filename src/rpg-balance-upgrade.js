'use strict'
const store=require('./rpg-store'),{database}=require('./auth-store'),{isOwner,norm}=require('./access'),{isModerator,canonicalUserId}=require('./economy-router')
const TRAIN_BASE=20,REWARD_MULT=1.20
let installed=false
function db(){const d=database();if(!d)throw Error('DATABASE_URL is required');return d}
function jidId(v){return v?norm(String(v).split(':')[0].split('@')[0]):''}
function contextInfo(m,content={}){const x=m?.message||{},raw=x.extendedTextMessage?.contextInfo||x.imageMessage?.contextInfo||x.videoMessage?.contextInfo||x.documentMessage?.contextInfo||{},normalized=content.extendedTextMessage?.contextInfo||content.imageMessage?.contextInfo||content.videoMessage?.contextInfo||content.documentMessage?.contextInfo||{};return{...raw,...normalized,mentionedJid:[...(raw.mentionedJid||[]),...(normalized.mentionedJid||[])]}}
function candidates(m,c,content){
 const ci=contextInfo(m,content),mentions=[...(ci.mentionedJid||[]),...(c?.mentionedJid||[])]
 return [...new Set([ci.participantAlt,ci.participant,...mentions].map(jidId).filter(x=>/^\d{8,20}$/.test(x)))]
}
async function registeredId(xs){
 for(const x of xs){
  if((await db().query('SELECT 1 FROM rimuru_wa_users WHERE user_id=$1',[x])).rowCount)return x
 }
 return null
}
function amountFrom(args=[],target=''){for(const a of args){const raw=String(a).trim();if(raw.startsWith('@')||jidId(raw)===target)continue;const n=Number(raw.replace(/,/g,''));if(Number.isFinite(n)&&n>=0)return Math.floor(n)}return null}
async function targetFor(m,c,self,content){
 const xs=candidates(m,c,content),hit=await registeredId(xs)
 if(hit)return hit
 // Explicit number is allowed only if it is already a registered Rimuru user.
 for(const a of c.args||[]){const x=norm(a);if(/^\d{8,15}$/.test(x)&&await registeredId([x]))return x}
 return xs.length?null:self
}
function install(){
 if(installed)return;installed=true
 const original=store.train
 if(typeof original==='function')store.train=async(id)=>{const p=await store.ensurePlayer(id),cost=TRAIN_BASE+Math.floor(Number(p.level||1)/5)*25;return original(id,cost)}
}
async function admin(sock,m,c,content={}){
 if(!['/addrpgcoin','/addrpggold','/setrpgcoin','/setrpggold'].includes(c.command))return false
 const self=canonicalUserId(m.key),jid=m.key.remoteJid
 if(!(isOwner(self)||await isModerator(self))){await sock.sendMessage(jid,{text:'🛡️ Owner/moderator only.'},{quoted:m});return true}
 const target=await targetFor(m,c,self,content)
 if(!target){await sock.sendMessage(jid,{text:'❌ I could not map that reply/mention to a registered Rimuru user.\n\nAsk them to use */start* first, then try again.'},{quoted:m});return true}
 const amount=amountFrom(c.args,target)
 if(amount===null){await sock.sendMessage(jid,{text:`Use *${c.command} <amount>* while replying to the user, or mention the user and include the amount.`},{quoted:m});return true}
 // Never create an RPG row for an unknown LID. Parent registration is verified first.
 if(!(await registeredId([target]))){await sock.sendMessage(jid,{text:'❌ That user is not registered. They need */start* first.'},{quoted:m});return true}
 await store.ensurePlayer(target)
 const set=c.command.startsWith('/set')
 await db().query(set?'UPDATE rimuru_rpg_players SET gold=$2,updated_at=NOW() WHERE user_id=$1':'UPDATE rimuru_rpg_players SET gold=gold+$2,updated_at=NOW() WHERE user_id=$1',[target,amount])
 const p=await store.getPlayer(target)
 await sock.sendMessage(jid,{text:`🪙 *RPG GOLD ${set?'SET':'ADDED'}*\n\nTarget: *${target}*\n${set?'Balance':'Added'}: *${set?p.gold:amount} RPG Gold*${set?'':`\nNew balance: *${p.gold} RPG Gold*`}`},{quoted:m});return true
}
module.exports={install,admin,REWARD_MULT,TRAIN_BASE,_test:{amountFrom,candidates,jidId}}
