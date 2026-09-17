'use strict'

const BUTTON_LABELS = new Set([
  '🎰 casino','💰 balance','🏆 leaderboard','🎮 games','🛠️ utilities','❓ help','⬅️ menu',
  '🎰 slots','🪙 coin flip','🎲 dice','🎡 roulette'
])

const BUTTON_IDS = new Set([
  'menu_main','menu_casino','menu_balance','menu_leaderboard','menu_games','menu_utilities','menu_help',
  'casino_slots_help','casino_cf_help','casino_dice_help','casino_roulette_help',
  'ryuden_enter','mines_a1','mines_b2','mines_cashout'
])

const REPLY_COMMANDS = new Set([
  '/start','/menu','/help','/p','/profile','/balance','/bal','/bank','/leaderboard','/lb',
  '/casino','/games','/utilities','/dep','/deposit','/wd','/withdraw','/donate','/transfer',
  '/slots','/cf','/coinflip','/dice','/roulette','/ping','/test','/dbping','/image','/api','/mines'
])

function visibleText(content={}) {
  return String(
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.templateButtonReplyMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    ''
  ).trim()
}

function nativeFlowSelection(content={}) {
  const raw=content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
  if(!raw)return {id:'',text:''}
  try {
    const value=JSON.parse(raw)
    return {
      id:String(value.id||value.button_id||value.selected_id||''),
      text:String(value.display_text||value.title||value.text||'')
    }
  } catch { return {id:'',text:''} }
}

function isKnownButtonInteraction(content={}) {
  if(resolveButtonId(content))return true
  const text=visibleText(content).toLocaleLowerCase()
  if(BUTTON_LABELS.has(text))return true
  const listId=String(content.listResponseMessage?.singleSelectReply?.selectedRowId||'')
  if(BUTTON_IDS.has(listId))return true
  const selected=nativeFlowSelection(content)
  return BUTTON_IDS.has(selected.id)||BUTTON_LABELS.has(selected.text.toLocaleLowerCase())
}

const LABEL_IDS = new Map([
  ['🎰 casino','menu_casino'],['💰 balance','menu_balance'],['🏆 leaderboard','menu_leaderboard'],
  ['🎮 games','menu_games'],['🛠️ utilities','menu_utilities'],['❓ help','menu_help'],['⬅️ menu','menu_main'],
  ['🎰 slots','casino_slots_help'],['🪙 coin flip','casino_cf_help'],['🎲 dice','casino_dice_help'],['🎡 roulette','casino_roulette_help']
].map(([label,id])=>[cleanLabel(label),id]))
function cleanLabel(text){return String(text||'').replace(/[\u200b-\u200f\u2060\ufeff\ufe0f]/g,'').trim().replace(/\s+/g,' ').toLowerCase()}
function resolveButtonId(content={}) {
  const native=nativeFlowSelection(content)
  const ids=[native.id,content.buttonsResponseMessage?.selectedButtonId,
    content.templateButtonReplyMessage?.selectedId,content.listResponseMessage?.singleSelectReply?.selectedRowId]
  for(const id of ids)if(typeof id==='string'&&BUTTON_IDS.has(id))return id
  const labels=[visibleText(content),native.text,content.interactiveResponseMessage?.body?.text]
  for(const label of labels){const id=LABEL_IDS.get(cleanLabel(label));if(id)return id}
  return null
}

function isReplyTrigger(content={}) {
  if(isKnownButtonInteraction(content))return true
  const command=visibleText(content).toLocaleLowerCase().split(/\s+/)[0].split('@')[0]
  return REPLY_COMMANDS.has(command)
}

function shouldHandleUpsert(content={}, {fromMe=false,type='notify'}={}) {
  const knownButtonTap=isKnownButtonInteraction(content)
  if(fromMe&&!knownButtonTap)return false
  if(type==='append'&&!knownButtonTap)return false
  return type==='notify'||type==='append'
}

class ReplyRateLimiter {
  constructor({maxReplies=3,windowMs=5000,minMuteMs=5000,maxMuteMs=10000}={}) {
    this.maxReplies=maxReplies; this.windowMs=windowMs; this.minMuteMs=minMuteMs; this.maxMuteMs=maxMuteMs; this.users=new Map()
  }
  key(message) {
    const k=message?.key||{}
    return String(k.participantAlt||k.participant||k.remoteJidAlt||k.remoteJid||'unknown').split(':')[0].split('@')[0]
  }
  check(message) {
    const now=Date.now(),key=this.key(message)
    let s=this.users.get(key)||{times:[],mutedUntil:0}
    if(s.mutedUntil>now)return {allowed:false,warn:false,remainingMs:s.mutedUntil-now}
    if(s.mutedUntil)s={times:[],mutedUntil:0}
    s.times=s.times.filter(t=>now-t<=this.windowMs)
    if(s.times.length>=this.maxReplies){
      const duration=this.minMuteMs+Math.floor(Math.random()*(this.maxMuteMs-this.minMuteMs+1))
      s.mutedUntil=now+duration;this.users.set(key,s)
      return {allowed:false,warn:true,durationMs:duration}
    }
    s.times.push(now);this.users.set(key,s);return {allowed:true}
  }
}
module.exports={resolveButtonId,isKnownButtonInteraction,isReplyTrigger,shouldHandleUpsert,nativeFlowSelection,visibleText,ReplyRateLimiter}
