'use strict'

const http = require('http')
const fs = require('fs/promises')
const path = require('path')
const pino = require('pino')
const { createAuthState, clearAuthState, closeAuthStore, pingDatabase, database } = require('./auth-store')
const { createTelegramControl } = require('./telegram-control')
const { buildEnterMessage, relayOptions, createTracker } = require('./button-test')
const { createEconomyStore } = require('./economy-store')
const { createEconomyRouter } = require('./economy-router')
const { createCasino } = require('./casino')
const { createUi } = require('./ui')
const { isKnownButtonInteraction, isReplyTrigger, ReplyRateLimiter } = require('./message-guard')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const port = Number(process.env.PORT || 3000)
const TEST_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'speed-test.jpg')
const MENU_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'ryuden-menu.jpg')
const API_IMAGE_URL = process.env.TEST_IMAGE_URL || 'https://picsum.photos/900/1200.jpg'
const economy = createEconomyStore({ database, logger })
const routeEconomy = createEconomyRouter({ economy, logger })
const casino = createCasino({ economy })
let ui = null
const MENU_CAPTION = [
  '╭━━━〔 🌊 *WELCOME TO RYUDEN* 🌊 〕━━━╮','','Hey there! I’m *Rimuru* — guardian of the JTF Casino and your cheerful guide through Ryuden. 💙','',
  'Here, luck meets strategy and friendships are forged. Whether you came to test your fortune, explore the realm, or relax with the crew, there’s a place for you. ✨','',
  'Please play fairly, respect every member, and remember: even the greatest legends started with a single roll. 🎲','',
  '╭───〔 🧪 *ACTIVE TEST COMMANDS* 〕───╮','│ 🏓 */ping* — instant response test','│ ⚡ */test* — alternate speed test','│ 🗄️ */dbping* — Supabase query test',
  '│ 🖼️ */image* — bundled image upload','│ 🌐 */api* — external image test','│ 📜 */menu* — show this welcome menu','╰────────────────────────────╯','',
  '╭────〔 🎰 *JTF CASINO STATUS* 〕────╮','│ Realm: *RYUDEN*','│ Guardian: *RIMURU TEMPEST*','│ Connection: *ONLINE* 🟢','│ Mode: *PHASE 1 ECONOMY*','╰────────────────────────────╯','',
  'May fortune favour the brave—and may Ryuden always feel like home. 🏰💫','','╰━━━━━━━〔 *JTF • RYUDEN* 〕━━━━━━━╯'
].join('\n')

class WhatsAppConnection {
  constructor () {
    this.sock=null; this.baileys=null; this.state='starting'; this.registered=false; this.storage='unknown'; this.connectedAt=null; this.generation=0
    this.reconnectAttempt=0; this.pairingReady=false; this.pairingInFlight=false; this.stopping=false; this.seen=new Map(); this.minesGames=new Map(); this.replyLimiter=new ReplyRateLimiter()
  }
  status () { return { state:this.state, registered:this.registered, storage:this.storage, uptimeSec:this.connectedAt?Math.floor((Date.now()-this.connectedAt)/1000):0 } }
  async start () { if(!this.baileys)this.baileys=await import('@whiskeysockets/baileys'); await this.connect() }
  async connect () {
    if(this.stopping)return
    const b=this.baileys; const {state,saveCreds,storage}=await createAuthState(b); this.registered=Boolean(state.creds.registered); this.storage=storage
    this.state=this.registered?'connecting':'waiting-for-pair'; this.pairingReady=false; const currentGeneration=++this.generation; const {version}=await b.fetchLatestBaileysVersion()
    const sock=b.default({version,auth:{creds:state.creds,keys:b.makeCacheableSignalKeyStore(state.keys,logger)},browser:b.Browsers.ubuntu('Chrome'),printQRInTerminal:false,markOnlineOnConnect:false,syncFullHistory:false,generateHighQualityLinkPreview:false,defaultQueryTimeoutMs:60000,logger:logger.child({module:'baileys'})})
    this.sock=sock; this.buttonTracker?.dispose(); this.buttonTracker=createTracker(sock,logger)
    sock.ev.on('creds.update',async()=>{await saveCreds();this.registered=Boolean(state.creds.registered)})
    sock.ev.on('messages.upsert',({messages,type})=>{if(type!=='notify'&&type!=='append')return;for(const message of messages)void this.handleMessage(sock,message,type).catch(async error=>{logger.error({err:error,jid:message?.key?.remoteJid},'WhatsApp command failed');const jid=message?.key?.remoteJid;if(jid)await sock.sendMessage(jid,{text:`Command failed: ${error.message}`},{quoted:message}).catch(()=>{})})})
    sock.ev.on('connection.update',({connection,lastDisconnect,qr})=>{if(this.generation!==currentGeneration||this.sock!==sock)return;if(qr)this.pairingReady=true;if(connection==='open'){this.state='connected';this.connectedAt=Date.now();this.reconnectAttempt=0;this.pairingReady=true;this.pairingInFlight=false;logger.info('WhatsApp connected')}if(connection==='close')void this.onClose(sock,currentGeneration,lastDisconnect)})
    logger.info({storage,registered:this.registered},'WhatsApp socket started')
  }
  async onClose(sock,g,lastDisconnect){if(this.generation!==g||this.sock!==sock)return;this.buttonTracker?.dispose();const code=lastDisconnect?.error?.output?.statusCode;this.sock=null;this.pairingReady=false;this.pairingInFlight=false;this.state=code===401?'logged-out':'disconnected';logger.warn({code},'WhatsApp disconnected');if(this.stopping||code===401||code===429)return;this.reconnectAttempt+=1;const delay=Math.min(30000,2000*(2**Math.min(this.reconnectAttempt,4)));setTimeout(()=>{if(!this.stopping&&!this.sock&&this.generation===g)void this.connect().catch(error=>logger.error({err:error},'WhatsApp reconnect failed'))},delay)}
  async waitForPairingReady(g,timeoutMs=20000){const start=Date.now();while(Date.now()-start<timeoutMs){if(g!==this.generation)throw new Error('WhatsApp socket restarted; run /pair again');if(this.sock&&this.pairingReady)return;await new Promise(r=>setTimeout(r,150))}throw new Error('WhatsApp did not become pairing-ready; run /pair once more')}
  async requestPairingCode(rawPhone){if(this.pairingInFlight)throw new Error('A pairing request is already running');const phone=String(rawPhone).replace(/\D/g,'').replace(/^0+/,'');if(!/^\d{8,15}$/.test(phone))throw new Error('Use international format, for example 2348076776671');this.pairingInFlight=true;try{await this.resetSocket(true);const g=this.generation;await this.waitForPairingReady(g);this.state='pairing';return await this.sock.requestPairingCode(phone)}finally{this.pairingInFlight=false}}
  async resetSocket(clearSession){this.buttonTracker?.dispose();this.generation+=1;const old=this.sock;this.sock=null;try{old?.end(undefined)}catch{}if(clearSession)await clearAuthState();this.reconnectAttempt=0;await this.connect()}
  async reconnect(){await this.resetSocket(false)}
  async handleMessage(sock,message,upsertType='notify'){
    const jid=message?.key?.remoteJid,id=message?.key?.id
    if(!jid||!id||jid==='status@broadcast'||this.seen.has(id))return
    const content=this.baileys.normalizeMessageContent(message.message)||{}
    const ownButtonTap=Boolean(message.key.fromMe&&isKnownButtonInteraction(content))
    if(message.key.fromMe&&!ownButtonTap)return
    if(upsertType==='append'&&!ownButtonTap)return
    this.seen.set(id,Date.now());if(this.seen.size>2000)this.seen.clear()
    if(ownButtonTap)logger.info({jid,messageId:id,upsertType},'menu button tap accepted')
    if(isReplyTrigger(content)){
      const limit=this.replyLimiter.check(message)
      if(!limit.allowed){
        if(limit.warn){
          const seconds=Math.ceil(limit.durationMs/1000)
          logger.warn({jid,messageId:id,seconds},'reply spam limiter activated')
          await sock.sendMessage(jid,{text:`⚠️ *Slow down.*\n\nYou sent too many commands too quickly. Rimuru will stay silent for about *${seconds} seconds*.`},{quoted:message})
        }
        return
      }
    }
    if(!ui)ui=createUi({economy,casino,logger,sendButtons:(s,j,b,f,d)=>this.sendNativeButtons(s,j,b,f,d)})
    if(await ui.route(sock,message,content))return
    if(await routeEconomy(sock,message,content))return
    const playerId=message.key.participant||jid,gameKey=`${jid}:${playerId}`
    const selectedRowId=content.listResponseMessage?.singleSelectReply?.selectedRowId
    if(selectedRowId==='ryuden_enter'){await sock.sendMessage(jid,{text:'🌊 Welcome to *RYUDEN*!\n\nList selection received successfully ✅\nYou have entered the JTF × Ryuden realm.'},{quoted:message});return}
    const interactiveJson=content.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
    if(interactiveJson){let response;try{response=JSON.parse(interactiveJson)}catch{response={}}const selectedId=response.id||response.button_id||response.selected_id;if(selectedId?.startsWith('menu_')||selectedId?.startsWith('casino_')){if(!ui)ui=createUi({economy,casino,logger,sendButtons:(s,j,b,f,d)=>this.sendNativeButtons(s,j,b,f,d)});await ui.section(sock,message,selectedId);return}if(selectedId==='ryuden_enter'){logger.info({jid,messageId:id},'button test: Enter callback received');await sock.sendMessage(jid,{text:'🌊 Welcome to RYUDEN!\n\nEnter button received ✅\nJTF × Ryuden'},{quoted:message});return}if(selectedId?.startsWith('mines_')){await this.handleMinesButton(sock,message,gameKey,selectedId);return}}
    const text=String(content.conversation||content.extendedTextMessage?.text||'').trim().toLowerCase()
    if(!['/ping','/test','/dbping','/image','/api','/menu','/mines','/start'].includes(text))return
    const receivedAt=Date.now(),timestamp=Number(message.messageTimestamp?.toString?.()||message.messageTimestamp),deliveryMs=Number.isFinite(timestamp)?Math.max(0,receivedAt-timestamp*1000):null
    if(text==='/ping'||text==='/test'){await sock.sendMessage(jid,{text:['Pong 🏓',`Processing: ${Date.now()-receivedAt} ms`,deliveryMs==null?'Delivery: unavailable':`Delivery: ~${deliveryMs} ms`,`UTC: ${new Date(receivedAt).toISOString()}`].join('\n')},{quoted:message});return}
    if(text==='/dbping'){const queryMs=await pingDatabase();await sock.sendMessage(jid,{text:`Database test ✅\nSupabase query: ${queryMs} ms`},{quoted:message});return}
    if(text==='/image'){const image=await fs.readFile(TEST_IMAGE_PATH);await sock.sendMessage(jid,{image,caption:`Bundled image test\nFile: ${(image.length/1024).toFixed(1)} KB`},{quoted:message});return}
    if(text==='/api'){const response=await fetch(API_IMAGE_URL,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`Image API returned HTTP ${response.status}`);const image=Buffer.from(await response.arrayBuffer());await sock.sendMessage(jid,{image,caption:'External API image test'},{quoted:message});return}
    if(text==='/menu'){const image=await fs.readFile(MENU_IMAGE_PATH);await sock.sendMessage(jid,{image,caption:MENU_CAPTION},{quoted:message});return}
    if(text==='/mines'){this.minesGames.set(gameKey,{mine:Math.random()<0.5?'mines_a1':'mines_b2',opened:new Set(),startedAt:Date.now()});await this.sendMinesButtons(sock,jid);return}
    if(text==='/start')await this.sendStartButton(sock,jid)
  }
  async sendNativeButtons(sock,jid,body,footer,defs){
    const {proto,generateWAMessageFromContent}=this.baileys
    const buttons=defs.map(([label,id])=>({name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:label,id})}))
    const generated=generateWAMessageFromContent(jid,{viewOnceMessage:{message:{messageContextInfo:{deviceListMetadata:{},deviceListMetadataVersion:2},interactiveMessage:proto.Message.InteractiveMessage.create({body:proto.Message.InteractiveMessage.Body.create({text:body}),footer:proto.Message.InteractiveMessage.Footer.create({text:footer}),nativeFlowMessage:proto.Message.InteractiveMessage.NativeFlowMessage.create({buttons})})}}},{})
    await sock.relayMessage(jid,generated.message,relayOptions(generated.key.id))
  }
  async sendStartButton(sock,jid){const {generateWAMessageFromContent}=this.baileys;const generated=generateWAMessageFromContent(jid,buildEnterMessage(),{userJid:sock.user.id});const tracker=this.buttonTracker;tracker.track(generated.key.id,jid);try{await sock.relayMessage(jid,generated.message,relayOptions(generated.key.id))}catch(error){tracker.failed(generated.key.id,error);throw error}}
  async sendMinesButtons(sock,jid){const {proto,generateWAMessageFromContent}=this.baileys;const buttons=[{name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:'💎 Open A1',id:'mines_a1'})},{name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:'💎 Open B2',id:'mines_b2'})},{name:'quick_reply',buttonParamsJson:JSON.stringify({display_text:'💰 Cash Out',id:'mines_cashout'})}];const generated=generateWAMessageFromContent(jid,{viewOnceMessage:{message:{messageContextInfo:{deviceListMetadata:{},deviceListMetadataVersion:2},interactiveMessage:proto.Message.InteractiveMessage.create({body:proto.Message.InteractiveMessage.Body.create({text:'╭━━〔 💣 MINES BUTTON TEST 〕━━╮\n│ Tap a button below.\n╰━━━━━━━━━━━━━━━━━━╯'}),footer:proto.Message.InteractiveMessage.Footer.create({text:'JTF × RYUDEN • interactive test'}),nativeFlowMessage:proto.Message.InteractiveMessage.NativeFlowMessage.create({buttons})})}}},{});await sock.relayMessage(jid,generated.message,{messageId:generated.key.id})}
  async handleMinesButton(sock,message,gameKey,selectedId){const jid=message.key.remoteJid,game=this.minesGames.get(gameKey);if(!game){await sock.sendMessage(jid,{text:'That Mines session expired. Send /mines again.'},{quoted:message});return}if(selectedId==='mines_cashout'){this.minesGames.delete(gameKey);await sock.sendMessage(jid,{text:'💰 Cashed out successfully!\nButton callback received ✅'},{quoted:message});return}if(game.opened.has(selectedId)){await sock.sendMessage(jid,{text:'That tile was already opened—and the button callback still worked ✅'},{quoted:message});return}game.opened.add(selectedId);if(selectedId===game.mine){this.minesGames.delete(gameKey);await sock.sendMessage(jid,{text:'💥 BOOM! You found the mine.\nButton callback received ✅'},{quoted:message});return}await sock.sendMessage(jid,{text:'💎 SAFE TILE! Multiplier: 1.50×\nButton callback received ✅'},{quoted:message})}
  async stop(){this.buttonTracker?.dispose();this.stopping=true;this.generation+=1;try{this.sock?.end(undefined)}catch{}this.sock=null}
}
const connection=new WhatsAppConnection(),telegram=createTelegramControl({connection,logger})
const healthServer=http.createServer((request,response)=>{if(request.url==='/health'||request.url==='/'){response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({ok:true,whatsapp:connection.status()}));return}response.writeHead(404).end()})
async function main(){healthServer.listen(port,'0.0.0.0',()=>logger.info({port},'health server listening'));await economy.ensureSchema();logger.info('Phase 1 economy schema ready');await connection.start();await telegram.start();logger.info('Telegram controller started')}
async function shutdown(signal){logger.info({signal},'shutting down');telegram.stop();await connection.stop();healthServer.close();await closeAuthStore();process.exit(0)}
process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'));process.on('unhandledRejection',error=>logger.error({err:error},'unhandled rejection'))
main().catch(error=>{logger.fatal({err:error},'startup failed');process.exit(1)})
