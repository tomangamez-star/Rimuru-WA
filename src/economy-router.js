'use strict'

function canonicalUserId (key = {}) {
  const candidates = [key.participantAlt, key.remoteJidAlt, key.participant, key.remoteJid].filter(Boolean)
  const jid = candidates.find((value) => String(value).endsWith('@s.whatsapp.net')) || candidates[0] || ''
  return String(jid).split(':')[0].split('@')[0]
}

function quotedUserId (content = {}) {
  const context = content.extendedTextMessage?.contextInfo ||
    content.imageMessage?.contextInfo ||
    content.videoMessage?.contextInfo ||
    content.documentMessage?.contextInfo || {}
  const jid = context.participantAlt || context.participant
  return jid ? String(jid).split(':')[0].split('@')[0] : null
}

function displayName (message) {
  return String(message?.pushName || '').trim()
}

// WhatsApp may deliver native quick-reply taps as their visible label.
// Normalize those labels into the SAME slash-command path used by typed commands.
const BUTTON_COMMANDS = new Map([
  ['🎰 casino', '/casino'],
  ['💰 balance', '/balance'],
  ['🏆 leaderboard', '/leaderboard'],
  ['🎮 games', '/games'],
  ['🛠️ utilities', '/utilities'],
  ['❓ help', '/help'],
  ['⬅️ menu', '/menu'],

  // Casino submenu: these buttons are usage/help shortcuts.
  ['🎰 slots', '/slotshelp'],
  ['🪙 coin flip', '/cfhelp'],
  ['🎲 dice', '/dicehelp'],
  ['🎡 roulette', '/roulettehelp']
])

function commandParts (content = {}) {
  let raw = String(content.conversation || content.extendedTextMessage?.text || '').trim()
  if (!raw) return null

  const mapped = BUTTON_COMMANDS.get(raw.toLocaleLowerCase())
  if (mapped) raw = mapped

  if (!raw.startsWith('/')) return null
  const parts = raw.split(/\s+/)
  return { command: parts.shift().toLowerCase().split('@')[0], args: parts, raw }
}

function createEconomyRouter ({ economy, logger }) {
  async function reply (sock, jid, message, text) {
    await sock.sendMessage(jid, { text }, { quoted: message })
  }

  return async function routeEconomy (sock, message, content) {
    const parsed = commandParts(content)
    if (!parsed) return false
    const supported = new Set(['/balance', '/bal', '/bank', '/dep', '/deposit', '/wd', '/withdraw', '/donate', '/transfer'])
    if (!supported.has(parsed.command)) return false

    const jid = message.key.remoteJid
    const userId = canonicalUserId(message.key)
    const name = displayName(message)
    if (!userId) return false

    if (parsed.command === '/balance' || parsed.command === '/bal') {
      const u = await economy.getBalance(userId, name)
      await reply(sock, jid, message, [
        `💰 *${u.displayName || 'YOUR'} BALANCE*`, '',
        `👛 Wallet (rob-able): *${economy.fmt(u.wallet)}*`,
        `🏦 Bank (safe): *${economy.fmt(u.bank)}*`,
        `💎 Net worth: *${economy.fmt(u.wallet + u.bank)}*`
      ].join('\n'))
      return true
    }

    if (parsed.command === '/bank') {
      const u = await economy.getBalance(userId, name)
      await reply(sock, jid, message, ['🏦 *BANK*','',`💼 Saved: *${economy.fmt(u.bank)}*`,`👛 Wallet: *${economy.fmt(u.wallet)}*`,'','Use */dep [amount|all]* to deposit or */wd [amount|all]* to withdraw.'].join('\n'))
      return true
    }

    if (parsed.command === '/dep' || parsed.command === '/deposit') {
      const result = await economy.deposit(userId, parsed.args[0] || 'all', name)
      if (!result.ok) await reply(sock, jid, message, result.message)
      else await reply(sock, jid, message, `🏦 *Deposited ${economy.fmt(result.amount)}*\n\n👛 Wallet: ${economy.fmt(result.user.wallet)}\n🏦 Bank: ${economy.fmt(result.user.bank)}`)
      return true
    }

    if (parsed.command === '/wd' || parsed.command === '/withdraw') {
      const result = await economy.withdraw(userId, parsed.args[0] || 'all', name)
      if (!result.ok) await reply(sock, jid, message, result.message)
      else await reply(sock, jid, message, `💸 *Withdrew ${economy.fmt(result.amount)}*\n\n👛 Wallet: ${economy.fmt(result.user.wallet)}\n🏦 Bank: ${economy.fmt(result.user.bank)}`)
      return true
    }

    const toId = quotedUserId(content)
    if (!toId) {
      await reply(sock, jid, message, `🎯 Reply to someone's message with *${parsed.command} [amount]*.`)
      return true
    }
    const args = { fromId:userId, toId, rawAmount:parsed.args[0], fromName:name, toName:'' }
    const result = parsed.command === '/donate' ? await economy.donate(args) : await economy.transfer(args)
    if (!result.ok) await reply(sock, jid, message, result.message)
    else {
      const source = parsed.command === '/donate' ? 'wallet' : 'bank'
      const verb = parsed.command === '/donate' ? 'Donated' : 'Transferred'
      await reply(sock, jid, message, `${parsed.command === '/donate' ? '💝' : '🏦'} *${verb} ${economy.fmt(result.amount)}*\n\nFrom your ${source} → replied user ✅`)
    }
    logger.info({ command:parsed.command, fromId:userId, toId, amount:result.amount }, 'economy transfer')
    return true
  }
}

module.exports = { createEconomyRouter, canonicalUserId, quotedUserId, commandParts, displayName, BUTTON_COMMANDS }
