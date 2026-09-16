'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { buildEnterMessage, relayOptions, createTracker } = require('../src/button-test')

function setup (options) {
  const sock = { ws: new EventEmitter(), ev: new EventEmitter() }
  const logs = []
  const logger = Object.fromEntries(['info', 'warn', 'error'].map(level => [level, (fields, message) => logs.push({ level, fields, message })]))
  return { sock, logs, tracker: createTracker(sock, logger, options) }
}
test('one Enter quick reply and native-flow relay metadata', () => {
  const buttons = buildEnterMessage().interactiveMessage.nativeFlowMessage.buttons
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0].name, 'quick_reply')
  assert.deepEqual(JSON.parse(buttons[0].buttonParamsJson), { display_text: 'Enter', id: 'ryuden_enter' })
  assert.equal(relayOptions('id').additionalNodes[0].content[0].content[0].attrs.name, 'mixed')
})
test('405 arriving before relay completes is tracked, including LID destinations', () => {
  const { sock, logs, tracker } = setup()
  tracker.track('id', '123@lid')
  sock.ws.emit('CB:ack,class:message', { attrs: { id: 'id', error: '405' } })
  sock.ev.emit('messages.update', [{ key: { id: 'id' }, update: { status: 0, messageStubParameters: ['405'] } }])
  assert.equal(logs.filter(x => x.message === 'button test: rejected').length, 1)
  assert.equal(logs.at(-1).fields.code, '405')
  tracker.dispose()
})
test('server acknowledgement and delivery are distinct', () => {
  const { sock, logs, tracker } = setup()
  tracker.track('id', '123@g.us')
  sock.ws.emit('CB:ack,class:message', { attrs: { id: 'id' } })
  assert.match(logs.at(-1).message, /not device delivery/)
  sock.ev.emit('messages.update', [{ key: { id: 'id' }, update: { status: 3 } }])
  assert.match(logs.at(-1).message, /device delivery receipt/)
  tracker.dispose()
  assert.equal(sock.ws.listenerCount('CB:ack,class:message'), 0)
})
test('status ERROR works without raw acknowledgement event', () => {
  const { sock, logs, tracker } = setup()
  tracker.track('id', '123@lid')
  sock.ev.emit('messages.update', [{ key: { id: 'id' }, update: { status: 0, messageStubParameters: ['405'] } }])
  assert.equal(logs.at(-1).fields.code, '405')
  tracker.dispose()
})
test('timeout remains unconfirmed, and a later receipt still works', async () => {
  const { sock, logs, tracker } = setup({ timeoutMs: 5, retentionMs: 1000 })
  tracker.track('id', '123@lid')
  await new Promise(resolve => setTimeout(resolve, 15))
  assert.match(logs.at(-1).message, /unconfirmed/)
  sock.ev.emit('messages.update', [{ key: { id: 'id' }, update: { status: 4 } }])
  assert.match(logs.at(-1).message, /device delivery/)
  tracker.dispose()
})
test('unrelated messages ignored and relay failure cleans tracking', () => {
  const { sock, logs, tracker } = setup()
  tracker.track('id', '123@lid')
  sock.ws.emit('CB:ack,class:message', { attrs: { id: 'other', error: '405' } })
  assert.equal(logs.length, 1)
  tracker.failed('id', new Error('network'))
  assert.match(logs.at(-1).message, /relay failed/)
  tracker.dispose()
})
