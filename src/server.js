'use strict'

const http = require('http')
const pino = require('pino')
const { createAuthState, clearAuthState, closeAuthStore } = require('./auth-store')
const { createTelegramControl } = require('./telegram-control')

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const port = Number(process.env.PORT || 3000)

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
      for (const message of messages) void this.handleMessage(sock, message)
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
    if (text !== '/ping' && text !== '/test') return

    const receivedAt = Date.now()
    const timestamp = Number(message.messageTimestamp?.toString?.() || message.messageTimestamp)
    const deliveryMs = Number.isFinite(timestamp) ? Math.max(0, receivedAt - timestamp * 1000) : null
    const reply = [
      'Pong 🏓',
      `Processing: ${Date.now() - receivedAt} ms`,
      deliveryMs == null ? 'Delivery: unavailable' : `Delivery: ~${deliveryMs} ms`,
      `UTC: ${new Date(receivedAt).toISOString()}`
    ].join('\n')
    await sock.sendMessage(jid, { text: reply }, { quoted: message })
    logger.info({ command: text, jid, deliveryMs, handlerMs: Date.now() - receivedAt }, 'WhatsApp ping replied')
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
