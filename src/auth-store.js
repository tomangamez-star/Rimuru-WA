'use strict'

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

const sessionId = process.env.WA_SESSION_ID || 'rimuru-wa-test'
const localDir = path.join(__dirname, '..', 'session')
let pool = null
let schemaReady = false

function database () {
  if (!process.env.DATABASE_URL) return null
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    })
  }
  return pool
}

async function ensureSchema () {
  const db = database()
  if (!db || schemaReady) return
  await db.query(`
    CREATE TABLE IF NOT EXISTS rimuru_wa_auth (
      session_id TEXT NOT NULL,
      item_key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, item_key)
    )
  `)
  schemaReady = true
}

async function postgresAuthState (baileys) {
  await ensureSchema()
  const db = database()
  const { BufferJSON, initAuthCreds, proto } = baileys

  const decode = (value) => JSON.parse(value, BufferJSON.reviver)
  const encode = (value) => JSON.stringify(value, BufferJSON.replacer)
  const read = async (key) => {
    const result = await db.query('SELECT value FROM rimuru_wa_auth WHERE session_id=$1 AND item_key=$2', [sessionId, key])
    return result.rows[0] ? decode(result.rows[0].value) : null
  }
  const write = async (key, value) => {
    await db.query(`
      INSERT INTO rimuru_wa_auth(session_id,item_key,value,updated_at)
      VALUES($1,$2,$3,NOW())
      ON CONFLICT(session_id,item_key)
      DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
    `, [sessionId, key, encode(value)])
  }

  const creds = (await read('creds')) || initAuthCreds()
  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          if (!ids.length) return {}
          const keys = ids.map((id) => `key:${type}:${id}`)
          const result = await db.query('SELECT item_key,value FROM rimuru_wa_auth WHERE session_id=$1 AND item_key=ANY($2::text[])', [sessionId, keys])
          const rows = new Map(result.rows.map((row) => [row.item_key, row.value]))
          const output = {}
          for (const id of ids) {
            const raw = rows.get(`key:${type}:${id}`)
            if (!raw) continue
            let value = decode(raw)
            if (type === 'app-state-sync-key' && value && proto?.Message?.AppStateSyncKeyData) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value)
            }
            output[id] = value
          }
          return output
        },
        set: async (data) => {
          const client = await db.connect()
          try {
            await client.query('BEGIN')
            for (const [type, entries] of Object.entries(data || {})) {
              for (const [id, value] of Object.entries(entries || {})) {
                const key = `key:${type}:${id}`
                if (value == null) {
                  await client.query('DELETE FROM rimuru_wa_auth WHERE session_id=$1 AND item_key=$2', [sessionId, key])
                } else {
                  await client.query(`
                    INSERT INTO rimuru_wa_auth(session_id,item_key,value,updated_at)
                    VALUES($1,$2,$3,NOW())
                    ON CONFLICT(session_id,item_key)
                    DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
                  `, [sessionId, key, encode(value)])
                }
              }
            }
            await client.query('COMMIT')
          } catch (error) {
            await client.query('ROLLBACK')
            throw error
          } finally {
            client.release()
          }
        }
      }
    },
    saveCreds: () => write('creds', creds),
    storage: 'supabase'
  }
}

async function createAuthState (baileys) {
  if (database()) return postgresAuthState(baileys)
  fs.mkdirSync(localDir, { recursive: true })
  const state = await baileys.useMultiFileAuthState(localDir)
  return { ...state, storage: 'local' }
}

async function clearAuthState () {
  fs.rmSync(localDir, { recursive: true, force: true })
  fs.mkdirSync(localDir, { recursive: true })
  const db = database()
  if (db) {
    await ensureSchema()
    await db.query('DELETE FROM rimuru_wa_auth WHERE session_id=$1', [sessionId])
  }
}

async function closeAuthStore () {
  if (pool) await pool.end()
}

async function pingDatabase () {
  const db = database()
  if (!db) throw new Error('DATABASE_URL is not configured')
  const startedAt = Date.now()
  await db.query('SELECT 1 AS ok')
  return Date.now() - startedAt
}

module.exports = { createAuthState, clearAuthState, closeAuthStore, pingDatabase }
