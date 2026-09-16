'use strict'

const BUTTON_LABELS = new Set([
  '🎰 casino','💰 balance','🏆 leaderboard','🎮 games','🛠️ utilities','❓ help','⬅️ menu',
  '🎰 slots','🪙 coin flip','🎲 dice','🎡 roulette'
])

function visibleText (content = {}) {
  return String(content.conversation || content.extendedTextMessage?.text || '').trim()
}
function isKnownButtonText (content = {}) {
  return BUTTON_LABELS.has(visibleText(content).toLocaleLowerCase())
}

class ReplyRateLimiter {
  constructor ({ maxReplies = 3, windowMs = 5000, minMuteMs = 5000, maxMuteMs = 10000 } = {}) {
    this.maxReplies=maxReplies; this.windowMs=windowMs; this.minMuteMs=minMuteMs; this.maxMuteMs=maxMuteMs; this.users=new Map()
  }
  key (message) {
    const k=message?.key||{}
    return String(k.participantAlt||k.participant||k.remoteJidAlt||k.remoteJid||'unknown').split(':')[0].split('@')[0]
  }
  check (message) {
    const now=Date.now(), key=this.key(message)
    let s=this.users.get(key)||{times:[],mutedUntil:0,warned:false}
    if(s.mutedUntil>now)return{allowed:false,warn:false,remainingMs:s.mutedUntil-now}
    if(s.mutedUntil&&s.mutedUntil<=now)s={times:[],mutedUntil:0,warned:false}
    s.times=s.times.filter(t=>now-t<=this.windowMs)
    if(s.times.length>=this.maxReplies){
      const duration=this.minMuteMs+Math.floor(Math.random()*(this.maxMuteMs-this.minMuteMs+1))
      s.mutedUntil=now+duration
      const warn=!s.warned;s.warned=true;this.users.set(key,s)
      return{allowed:false,warn,durationMs:duration,remainingMs:duration}
    }
    s.times.push(now);this.users.set(key,s)
    if(this.users.size>5000)for(const [k,v] of this.users)if(now-Math.max(...v.times,0)>60000&&v.mutedUntil<now)this.users.delete(k)
    return{allowed:true}
  }
}
module.exports={isKnownButtonText,visibleText,ReplyRateLimiter}
