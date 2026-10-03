'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { createInstanceLease } = require('../src/instance-lease')

function fakeDatabase () {
  let owner = null
  return {
    query: async (sql, params = []) => {
      const text = String(sql).trim().toUpperCase()
      if (text.startsWith('CREATE TABLE')) return { rows: [], rowCount: 0 }
      if (text.startsWith('INSERT INTO RIMURU_INSTANCE_LEASES')) {
        if (!text.includes('WHERE RIMURU_INSTANCE_LEASES.EXPIRES_AT')) owner = params[1]
        else if (!owner || owner === params[1]) owner = params[1]
        return { rows: owner === params[1] ? [{ holder_id: owner }] : [], rowCount: owner === params[1] ? 1 : 0 }
      }
      if (text.startsWith('UPDATE RIMURU_INSTANCE_LEASES')) return { rows: owner === params[1] ? [{ holder_id: owner }] : [], rowCount: owner === params[1] ? 1 : 0 }
      if (text.startsWith('DELETE FROM RIMURU_INSTANCE_LEASES')) {
        const deleted = owner === params[1]
        if (deleted) owner = null
        return { rows: [], rowCount: deleted ? 1 : 0 }
      }
      throw new Error(`Unexpected SQL: ${text.slice(0, 30)}`)
    }
  }
}

test('only one process owns a Lily session lease at a time', async () => {
  const db = fakeDatabase()
  const logger = { info () {}, warn () {}, error () {} }
  const first = createInstanceLease({ database: () => db, logger, key: 'test', retryMs: 5, heartbeatMs: 1000 })
  const second = createInstanceLease({ database: () => db, logger, key: 'test', retryMs: 5, heartbeatMs: 1000 })
  assert.equal(await first.acquire(), true)
  assert.equal(first.status().role, 'active')
  const waiting = second.acquire()
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(second.status().role, 'standby')
  await first.release()
  assert.equal(await waiting, true)
  assert.equal(second.status().role, 'active')
  await second.release()
})

test('owner takeover transfers a stuck lease and makes the former owner stand down', async () => {
  const db = fakeDatabase()
  const logger = { info () {}, warn () {}, error () {} }
  const first = createInstanceLease({ database: () => db, logger, key: 'test', retryMs: 5, heartbeatMs: 5, ttlMs: 100 })
  const second = createInstanceLease({ database: () => db, logger, key: 'test', retryMs: 5, heartbeatMs: 5, ttlMs: 100, takeoverGraceMs: 15 })
  assert.equal(await first.acquire(), true)
  const waiting = second.acquire()
  await new Promise(resolve => setTimeout(resolve, 10))
  await second.forceTakeover()
  assert.equal(await waiting, true)
  await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(first.status().role, 'standby')
  assert.equal(second.status().role, 'active')
  await first.release()
  await second.release()
})
