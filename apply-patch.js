'use strict'
const fs=require('fs')
const p='src/server.js'
let s=fs.readFileSync(p,'utf8')
if(!s.includes("require('./message-guard')")){
 s=s.replace("const { createUi } = require('./ui')","const { createUi } = require('./ui')\nconst { isKnownButtonText, ReplyRateLimiter } = require('./message-guard')")
 s=s.replace("this.reconnectAttempt=0; this.pairingReady=false; this.pairingInFlight=false; this.stopping=false; this.seen=new Map(); this.minesGames=new Map()",
 "this.reconnectAttempt=0; this.pairingReady=false; this.pairingInFlight=false; this.stopping=false; this.seen=new Map(); this.minesGames=new Map(); this.replyLimiter=new ReplyRateLimiter()")
 const old="const jid=message?.key?.remoteJid,id=message?.key?.id;if(!jid||!id||message.key.fromMe||jid==='status@broadcast'||this.seen.has(id))return\n    this.seen.set(id,Date.now());if(this.seen.size>2000)this.seen.clear()\n    const content=this.baileys.normalizeMessageContent(message.message)||{}"
 const neu="const jid=message?.key?.remoteJid,id=message?.key?.id;if(!jid||!id||jid==='status@broadcast'||this.seen.has(id))return\n    const content=this.baileys.normalizeMessageContent(message.message)||{}\n    if(message.key.fromMe&&!isKnownButtonText(content))return\n    this.seen.set(id,Date.now());if(this.seen.size>2000)this.seen.clear()\n    const rate=this.replyLimiter.check(message)\n    if(!rate.allowed){if(rate.warn)await sock.sendMessage(jid,{text:`⚠️ *Slow down.*\\n\\n> You sent too many messages too quickly. Rimuru won't answer you for about ${Math.ceil(rate.durationMs/1000)} seconds.`},{quoted:message}).catch(()=>{});return}"
 if(!s.includes(old))throw new Error('Expected handleMessage block not found; server.js was not modified.')
 s=s.replace(old,neu)
 fs.writeFileSync(p,s)
 console.log('Applied fromMe button + reply rate limiter patch to src/server.js')
}else console.log('Patch already applied.')
