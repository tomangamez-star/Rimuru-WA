'use strict'

// Experimental relay metadata matching atex-ovi/atexovi-baileys (MIT).
// Works with the existing upstream Baileys dependency; no session changes.
function buildEnterMessage () {
  return {
    interactiveMessage: {
      body: { text: '🌊 JTF × RYUDEN\n\nWelcome! Tap Enter below to test the button.' },
      footer: { text: 'Rimuru • button compatibility test' },
      nativeFlowMessage: {
        buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Enter', id: 'ryuden_enter' }) }]
      }
    }
  }
}

function relayOptions (messageId) {
  return {
    messageId,
    additionalNodes: [{
      tag: 'biz', attrs: {}, content: [{
        tag: 'interactive', attrs: { type: 'native_flow', v: '1' },
        content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
      }]
    }]
  }
}

function createTracker (sock, logger, { timeoutMs = 30000, retentionMs = 300000 } = {}) {
  const pending = new Map()
  function finish (id) {
    const item = pending.get(id)
    if (!item) return
    clearTimeout(item.warning)
    clearTimeout(item.expiry)
    pending.delete(id)
  }
  function track (id, jid) {
    const item = { jid, messageId: id, startedAt: Date.now(), accepted: false }
    item.warning = setTimeout(() => {
      logger.warn({ jid, messageId: id, serverAccepted: item.accepted }, 'button test: delivery unconfirmed (not proof of rejection)')
    }, timeoutMs)
    item.expiry = setTimeout(() => finish(id), retentionMs)
    item.warning.unref?.()
    item.expiry.unref?.()
    pending.set(id, item)
    logger.info({ jid, messageId: id }, 'button test: submitting')
  }
  function onAck (node) {
    const attrs = node?.attrs || {}
    const item = pending.get(attrs.id)
    if (!item) return
    const fields = { jid: item.jid, messageId: attrs.id, elapsedMs: Date.now() - item.startedAt }
    if (attrs.error) {
      logger.warn({ ...fields, code: attrs.error }, 'button test: rejected')
      finish(attrs.id)
    } else {
      item.accepted = true
      logger.info(fields, 'button test: server acknowledged (not device delivery)')
    }
  }
  function onUpdates (updates) {
    for (const { key, update } of updates) {
      const item = pending.get(key?.id)
      if (!item) continue
      const fields = { jid: item.jid, messageId: key.id, elapsedMs: Date.now() - item.startedAt }
      if (update.status === 0) {
        logger.warn({ ...fields, code: update.messageStubParameters?.[0] }, 'button test: rejected')
        finish(key.id)
      } else if (update.status >= 3) {
        logger.info({ ...fields, status: update.status }, 'button test: device delivery receipt (rendering still needs visual confirmation)')
        finish(key.id)
      }
    }
  }
  sock.ws.on('CB:ack,class:message', onAck)
  sock.ev.on('messages.update', onUpdates)
  return {
    track,
    failed (id, error) {
      logger.error({ messageId: id, err: error }, 'button test: relay failed')
      finish(id)
    },
    dispose () {
      sock.ws.off('CB:ack,class:message', onAck)
      sock.ev.off('messages.update', onUpdates)
      for (const id of pending.keys()) finish(id)
    }
  }
}

module.exports = { buildEnterMessage, relayOptions, createTracker }
