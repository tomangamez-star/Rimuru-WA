'use strict'

function createTelegramControl ({ connection, logger }) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const ownerId = String(process.env.TELEGRAM_OWNER_ID || '')
  let stopped = false
  let offset = 0

  if (!token || !ownerId) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_ID are required')
  const api = `https://api.telegram.org/bot${token}`

  async function call (method, body) {
    const response = await fetch(`${api}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json()
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || 'unknown error'}`)
    return data.result
  }

  async function reply (chatId, text) {
    return call('sendMessage', { chat_id: chatId, text, protect_content: true })
  }

  async function handle (message) {
    if (!message?.text) return
    const chatId = String(message.chat?.id || '')
    const senderId = String(message.from?.id || '')
    if (senderId !== ownerId || chatId !== ownerId || message.chat?.type !== 'private') return

    const [commandRaw, argument] = message.text.trim().split(/\s+/, 2)
    const command = commandRaw.toLowerCase().split('@')[0]
    if (command === '/start' || command === '/help') {
      await reply(chatId, 'Rimuru WhatsApp test control\n\n/pair 234…\n/status\n/reconnect\n/ping')
      return
    }
    if (command === '/status') {
      const status = connection.status()
      await reply(chatId, `WhatsApp: ${status.state}\nSession: ${status.registered ? 'saved' : 'not paired'}\nStorage: ${status.storage}\nUptime: ${status.uptimeSec}s`)
      return
    }
    if (command === '/ping') {
      await reply(chatId, `Controller online • ${new Date().toISOString()}`)
      return
    }
    if (command === '/reconnect') {
      await reply(chatId, 'Reconnecting WhatsApp…')
      await connection.reconnect()
      return
    }
    if (command === '/pair') {
      if (!argument) {
        await reply(chatId, 'Usage: /pair 2348076776671')
        return
      }
      await reply(chatId, 'Preparing a fresh WhatsApp pairing code…')
      try {
        const code = await connection.requestPairingCode(argument)
        const readable = code.match(/.{1,4}/g)?.join('-') || code
        await reply(chatId, `PAIRING CODE: ${readable}\n\nEnter it immediately in WhatsApp → Linked devices → Link with phone number. Do not share this message.`)
      } catch (error) {
        logger.warn({ err: error }, 'pair command failed')
        await reply(chatId, `Pairing failed: ${error.message}`)
      }
    }
  }

  async function poll () {
    while (!stopped) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message'] })
        for (const update of updates) {
          offset = update.update_id + 1
          await handle(update.message).catch((error) => logger.warn({ err: error }, 'Telegram command failed'))
        }
      } catch (error) {
        logger.warn({ err: error }, 'Telegram polling error')
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }
    }
  }

  return {
    start: async () => {
      await call('deleteWebhook', { drop_pending_updates: true })
      await call('setMyCommands', { commands: [
        { command: 'pair', description: 'Pair a WhatsApp number' },
        { command: 'status', description: 'Show WhatsApp connection state' },
        { command: 'reconnect', description: 'Reconnect WhatsApp' },
        { command: 'ping', description: 'Test Telegram controller' }
      ] })
      void poll()
    },
    stop: () => { stopped = true }
  }
}

module.exports = { createTelegramControl }
