'use strict'

const http = require('http')
const fs = require('fs/promises')
const path = require('path')
const pino = require('pino')
const { createAuthState, clearAuthState, closeAuthStore, pingDatabase } = require('./auth-store')
const { createTelegramControl } = require('./telegram-control')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const port = Number(process.env.PORT || 3000)
const TEST_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'speed-test.jpg')
const MENU_IMAGE_PATH = path.join(__dirname, '..', 'assets', 'ryuden-menu.jpg')
const API_IMAGE_URL = process.env.TEST_IMAGE_URL || 'https://picsum.photos/900/1200.jpg'
const MENU_CAPTION = [
  '╭━━━〔 🌊 *WELCOME TO RYUDEN* 🌊 〕━━━╮',
  '',
  'Hey there! I’m *Rimuru* — guardian of the JTF Casino and your cheerful guide through Ryuden. 💙',
  '',
  'Here, luck meets strategy and friendships are forged. Whether you came to test your fortune, explore the realm, or relax with the crew, there’s a place for you. ✨',
  '',
  'Please play fairly, respect every member, and remember: even the greatest legends started with a single roll. 🎲',
  '',
  '╭───〔 🧪 *ACTIVE TEST COMMANDS* 〕───╮',
  '│ 🏓 */ping* — instant response test',
  '│ ⚡ */test* — alternate speed test',
  '│ 🗄️ */dbping* — Supabase query test',
  '│ 🖼️ */image* — bundled image upload',
  '│ 🌐 */api* — external image test',
  '│ 📜 */menu* — show this welcome menu',
  '╰────────────────────────────╯',
  '',
  '╭────〔 🎰 *JTF CASINO STATUS* 〕────╮',
  '│ Realm: *RYUDEN*',
  '│ Guardian: *RIMURU TEMPEST*',
  '│ Connection: *ONLINE* 🟢',
  '│ Mode: *SPEED TEST PHASE*',
  '╰────────────────────────────╯',
  '',
  'May fortune favour the brave—and may Ryuden always feel like home. 🏰💫',
  '',
  '╰━━━━━━━〔 *JTF • RYUDEN* 〕━━━━━━━╯'
].join('\n')

class WhatsAppConnection {
  constructor () {
    this.sock = null
    this.baileys = null
    this.state = 'starting'
    this.registered = false
    this.storage = 'unknown'
    this.connectedAt = null
    this.generation = 0
    this.reconnectAttempt = 0
    this.pairingReady = false
    this.pairingInFlight = false
    this.stopping = false
    this.seen = new Map()
  }

  status () {
    return {
      state: this.state,
      registered: this.registered,
      storage: this.storage,
      uptimeSec: this.connectedAt ? Math.floor((Date.now() - this.connectedAt) / 1000) : 0
    }
  }

  async start () {
    if (!this.baileys) this.baileys = await import('@whiskeysockets/baileys')
    await this.connect()
  }

  async connect () {
    if (this.stopping) return
    const b = this.baileys
    const { state, saveCreds, storage } = await createAuthState(b)
    this.registered = Boolean(state.creds.registered)
    this.storage = storage
    this.state = this.registered ? 'connecting' : 'waiting-for-pair'
    this.pairingReady = false
    const currentGeneration = ++this.generation
    const { version } = await b.fetchLatestBaileysVersion()

    const sock = b.default({
      version,
      auth: { creds: state.creds, keys: b.makeCacheableSignalKeyStore(state.keys, logger) },
      browser: b.Browsers.ubuntu('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      defaultQueryTimeoutMs: 60000,
      logger: logger.child({ module: 'baileys' })
    })
    this.sock = sock
    sock.ev.on('creds.update', async () => {
      await saveCreds()
      this.registered = Boolean(state.creds.registered)
    })
    sock.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return
      for (const message of messages) {
        void this.handleMessage(sock, message).catch(async (error) => {
          logger.error({ err: error, jid: message?.key?.remoteJid }, 'WhatsApp test command failed')
          const jid = message?.key?.remoteJid
          if (jid) await sock.sendMessage(jid, { text: `Test failed: ${error.message}` }, { quoted: message }).catch(() => {})
        })
      }
    })
    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (this.generation !== currentGeneration || this.sock !== sock) return
      if (qr) this.pairingReady = true
      if (connection === 'open') {
        this.state = 'connected'
        this.connectedAt = Date.now()
        this.reconnectAttempt = 0
        this.pairingReady = true
        this.pairingInFlight = false
        logger.info('WhatsApp connected')
      }
      if (connection === 'close') void this.onClose(sock, currentGeneration, lastDisconnect)
    })
    logger.info({ storage, registered: this.registered }, 'WhatsApp socket started')
  }

  async onClose (sock, currentGeneration, lastDisconnect) {
    if (this.generation !== currentGeneration || this.sock !== sock) return
    const code = lastDisconnect?.error?.output?.statusCode
    this.sock = null
    this.pairingReady = false
    this.pairingInFlight = false
    this.state = code === 401 ? 'logged-out' : 'disconnected'
    logger.warn({ code }, 'WhatsApp disconnected')
    if (this.stopping || code === 401 || code === 429) return
    this.reconnectAttempt += 1
    const delay = Math.min(30000, 2000 * (2 ** Math.min(this.reconnectAttempt, 4)))
    setTimeout(() => {
      if (!this.stopping && !this.sock && this.generation === currentGeneration) {
        void this.connect().catch((error) => logger.error({ err: error }, 'WhatsApp reconnect failed'))
      }
    }, delay)
  }

  async waitForPairingReady (generation, timeoutMs = 20000) {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      if (generation !== this.generation) throw new Error('WhatsApp socket restarted; run /pair again')
      if (this.sock && this.pairingReady) return
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
    throw new Error('WhatsApp did not become pairing-ready; run /pair once more')
  }

  async requestPairingCode (rawPhone) {
    if (this.pairingInFlight) throw new Error('A pairing request is already running')
    const phone = String(rawPhone).replace(/\D/g, '').replace(/^0+/, '')
    if (!/^\d{8,15}$/.test(phone)) throw new Error('Use international format, for example 2348076776671')
    this.pairingInFlight = true
    try {
      await this.resetSocket(true)
      const generation = this.generation
      await this.waitForPairingReady(generation)
      this.state = 'pairing'
      return await this.sock.requestPairingCode(phone)
    } finally {
      this.pairingInFlight = false
    }
  }

  async resetSocket (clearSession) {
    this.generation += 1
    const old = this.sock
    this.sock = null
    try { old?.end(undefined) } catch {}
    if (clearSession) await clearAuthState()
    this.reconnectAttempt = 0
    await this.connect()
  }

  async reconnect () {
    await this.resetSocket(false)
  }

  async handleMessage (sock, message) {
    const jid = message?.key?.remoteJid
    const id = message?.key?.id
    if (!jid || !id || message.key.fromMe || jid === 'status@broadcast' || this.seen.has(id)) return
    this.seen.set(id, Date.now())
    if (this.seen.size > 2000) this.seen.clear()
    const content = message.message || {}
    const text = String(content.conversation || content.extendedTextMessage?.text || '').trim().toLowerCase()
    if (!['/ping', '/test', '/dbping', '/image', '/api', '/menu'].includes(text)) return

    const receivedAt = Date.now()
    const timestamp = Number(message.messageTimestamp?.toString?.() || message.messageTimestamp)
    const deliveryMs = Number.isFinite(timestamp) ? Math.max(0, receivedAt - timestamp * 1000) : null
    if (text === '/ping' || text === '/test') {
      const reply = [
        'Pong 🏓',
        `Processing: ${Date.now() - receivedAt} ms`,
        deliveryMs == null ? 'Delivery: unavailable' : `Delivery: ~${deliveryMs} ms`,
        `UTC: ${new Date(receivedAt).toISOString()}`
      ].join('\n')
      await sock.sendMessage(jid, { text: reply }, { quoted: message })
      logger.info({ command: text, jid, deliveryMs, handlerMs: Date.now() - receivedAt }, 'WhatsApp ping replied')
      return
    }

    if (text === '/dbping') {
      const queryMs = await pingDatabase()
      const beforeSend = Date.now()
      await sock.sendMessage(jid, { text: [
        'Database test ✅',
        `Supabase query: ${queryMs} ms`,
        `Before upload: ${beforeSend - receivedAt} ms`,
        deliveryMs == null ? 'Delivery: unavailable' : `Delivery: ~${deliveryMs} ms`
      ].join('\n') }, { quoted: message })
      logger.info({ command: text, jid, queryMs, sendMs: Date.now() - beforeSend, totalMs: Date.now() - receivedAt }, 'database test replied')
      return
    }

    if (text === '/image') {
      const readStarted = Date.now()
      const image = await fs.readFile(TEST_IMAGE_PATH)
      const readMs = Date.now() - readStarted
      const uploadStarted = Date.now()
      await sock.sendMessage(jid, {
        image,
        caption: `Bundled image test\nFile: ${(image.length / 1024).toFixed(1)} KB\nDisk read: ${readMs} ms`
      }, { quoted: message })
      const uploadMs = Date.now() - uploadStarted
      await sock.sendMessage(jid, { text: [
        'Image timing ✅',
        `Disk read: ${readMs} ms`,
        `WhatsApp upload: ${uploadMs} ms`,
        `Total: ${Date.now() - receivedAt} ms`
      ].join('\n') })
      logger.info({ command: text, jid, bytes: image.length, readMs, uploadMs, totalMs: Date.now() - receivedAt }, 'bundled image test replied')
      return
    }

    if (text === '/api') {
      const fetchStarted = Date.now()
      const response = await fetch(API_IMAGE_URL, { signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`Image API returned HTTP ${response.status}`)
      const image = Buffer.from(await response.arrayBuffer())
      if (image.length > 8 * 1024 * 1024) throw new Error('Image API returned more than 8 MB')
      const fetchMs = Date.now() - fetchStarted
      const uploadStarted = Date.now()
      await sock.sendMessage(jid, {
        image,
        caption: `External API image test\nDownload: ${fetchMs} ms\nSize: ${(image.length / 1024).toFixed(1)} KB`
      }, { quoted: message })
      const uploadMs = Date.now() - uploadStarted
      await sock.sendMessage(jid, { text: [
        'API timing ✅',
        `Download: ${fetchMs} ms`,
        `WhatsApp upload: ${uploadMs} ms`,
        `Total: ${Date.now() - receivedAt} ms`
      ].join('\n') })
      logger.info({ command: text, jid, bytes: image.length, fetchMs, uploadMs, totalMs: Date.now() - receivedAt }, 'external API test replied')
      return
    }

    if (text === '/menu') {
      const readStarted = Date.now()
      const image = await fs.readFile(MENU_IMAGE_PATH)
      const readMs = Date.now() - readStarted
      const uploadStarted = Date.now()
      await sock.sendMessage(jid, { image, caption: MENU_CAPTION }, { quoted: message })
      logger.info({
        command: text,
        jid,
        bytes: image.length,
        captionChars: MENU_CAPTION.length,
        readMs,
        uploadMs: Date.now() - uploadStarted,
        totalMs: Date.now() - receivedAt
      }, 'menu replied')
    }
  }

  async stop () {
    this.stopping = true
    this.generation += 1
    try { this.sock?.end(undefined) } catch {}
    this.sock = null
  }
}

const connection = new WhatsAppConnection()
const telegram = createTelegramControl({ connection, logger })
const healthServer = http.createServer((request, response) => {
  if (request.url === '/health' || request.url === '/') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, whatsapp: connection.status() }))
    return
  }
  response.writeHead(404).end()
})

async function main () {
  healthServer.listen(port, '0.0.0.0', () => logger.info({ port }, 'health server listening'))
  await connection.start()
  await telegram.start()
  logger.info('Telegram controller started')
}

async function shutdown (signal) {
  logger.info({ signal }, 'shutting down')
  telegram.stop()
  await connection.stop()
  healthServer.close()
  await closeAuthStore()
  process.exit(0)
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('unhandledRejection', (error) => logger.error({ err: error }, 'unhandled rejection'))

main().catch((error) => {
  logger.fatal({ err: error }, 'startup failed')
  process.exit(1)
})
