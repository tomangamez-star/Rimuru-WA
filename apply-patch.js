'use strict'
const fs=require('fs')
const p='src/server.js'
let s=fs.readFileSync(p,'utf8')

if(!s.includes("require('./message-guard')"))
  s=s.replace("const { createUi } = require('./ui')",
    "const { createUi } = require('./ui')\nconst { isKnownButtonText, visibleText, ReplyRateLimiter } = require('./message-guard')")

if(!s.includes('this.replyLimiter=new ReplyRateLimiter()'))
  s=s.replace("this.stopping=false; this.seen=new Map(); this.minesGames=new Map()",
    "this.stopping=false; this.seen=new Map(); this.minesGames=new Map(); this.replyLimiter=new ReplyRateLimiter()")

const old=`const jid=message?.key?.remoteJid,id=message?.key?.id;if(!jid||!id||message.key.fromMe||jid==='status@broadcast'||this.seen.has(id))return
    this.seen.set(id,Date.now());if(this.seen.size>2000)this.seen.clear()
    const content=this.baileys.normalizeMessageContent(message.message)||{}`
const neu=`const jid=message?.key?.remoteJid,id=message?.key?.id;if(!jid||!id||jid==='status@broadcast'||this.seen.has(id))return
    const content=this.baileys.normalizeMessageContent(message.message)||{}
    const buttonText=isKnownButtonText(content)
    if(message.key.fromMe&&!buttonText)return
    if(message.key.fromMe&&buttonText)logger.info({jid,text:visibleText(content),fromMe:true,messageId:id},'menu button text accepted')
    this.seen.set(id,Date.now());if(this.seen.size>2000)this.seen.clear()
    const rate=this.replyLimiter.check(message)
    if(!rate.allowed){if(rate.warn)await sock.sendMessage(jid,{text:\`⚠️ *Slow down.*\\n\\n> You sent too many messages too quickly. Rimuru won't answer you for about \${Math.ceil(rate.durationMs/1000)} seconds.\`},{quoted:message}).catch(()=>{});return}`

if(s.includes(old)) s=s.replace(old,neu)
else if(!s.includes("'menu button text accepted'")) throw new Error('Could not find expected handleMessage block. Stop and send current server.js.')

fs.writeFileSync(p,s)
console.log('PATCH APPLIED.')
console.log('Now commit BOTH src/server.js and src/message-guard.js.')
