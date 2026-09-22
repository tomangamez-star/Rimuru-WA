'use strict'

const {norm}=require('./access')

function jidsFromKey(key={}){
 return [...new Set([key.participantAlt,key.remoteJidAlt,key.participant,key.remoteJid].filter(Boolean).map(String))]
}

function numberFromJid(jid){return norm(String(jid||'').split('@')[0])}
function isPhoneJid(jid){return /@(s\.whatsapp\.net|hosted)$/i.test(String(jid||''))}
function isLidJid(jid){return /@(lid|hosted\.lid)$/i.test(String(jid||''))}

async function resolveMessageUserId(sock,message={}){
 const key=message.key||{},jids=jidsFromKey(key),phone=jids.find(isPhoneJid)
 if(phone)return numberFromJid(phone)
 const mapping=sock?.signalRepository?.lidMapping
 if(mapping?.getPNForLID)for(const lid of jids.filter(isLidJid)){
  try{
   const pn=await mapping.getPNForLID(lid)
   if(!pn)continue
   if(String(key.remoteJid||'').endsWith('@g.us'))key.participantAlt=key.participantAlt||pn
   else key.remoteJidAlt=key.remoteJidAlt||pn
   return numberFromJid(pn)
  }catch{}
 }
 return numberFromJid(jids[0])
}

module.exports={resolveMessageUserId,jidsFromKey,numberFromJid,isPhoneJid,isLidJid}
