'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const power = require('../src/card-power')
const duel = require('../src/duels')._test
const sticker = require('../src/cursed-sticker')._test

test('tier is a multiplier while canonical character power remains dominant', () => {
  const strong = power.effectiveStats({ card_key: 'a', card_name: 'Strong', tier: 5 }, { base_power: 900, attack: 95, defense: 90, speed: 90, technique: 95, role: 'Fighter', energy_type: 'Ki', passive: 'P', signature: 'S', source: 'test' })
  const weak = power.effectiveStats({ card_key: 'b', card_name: 'Weak', tier: 6 }, { base_power: 350, attack: 55, defense: 55, speed: 55, technique: 55, role: 'Fighter', energy_type: 'Ki', passive: 'P', signature: 'S', source: 'test' })
  assert.ok(strong.power > weak.power)
  assert.equal(power.TIER_MULTIPLIERS[6], 1.17)
})

test('card and hybrid units preserve independent combat state', () => {
  const card = duel.cardUnit({ cardKey: '77', name: 'Hero', tier: 6, hp: 300, attack: 90, defense: 80, speed: 70, technique: 88, signature: 'Final Art', power: 900 })
  const echo = duel.aiEcho(card, 0)
  assert.notEqual(card.key, echo.key)
  assert.equal(card.hp, 300)
  assert.match(echo.name, /Lily's/)
  assert.equal(duel.modeName('hybrid'), 'Hybrid Battle')
})

test('variant six removes EXIF while preserving a valid WebP container', () => {
  const payload = Buffer.from('metadata')
  const chunk = Buffer.alloc(8 + payload.length + (payload.length % 2))
  chunk.write('EXIF', 0, 'ascii'); chunk.writeUInt32LE(payload.length, 4); payload.copy(chunk, 8)
  const webp = Buffer.concat([Buffer.from('RIFF\0\0\0\0WEBP', 'binary'), chunk])
  webp.writeUInt32LE(webp.length - 8, 4)
  const clean = sticker.stripExif(webp)
  assert.equal(clean.toString('ascii', 0, 4), 'RIFF')
  assert.equal(clean.toString('ascii', 8, 12), 'WEBP')
  assert.equal(clean.includes(Buffer.from('EXIF')), false)
  assert.equal(clean.readUInt32LE(4), clean.length - 8)
})
