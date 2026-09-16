'use strict'

const START_BALANCE = Number(process.env.START_BALANCE || 500000)

function fmt (n) {
  return Number(n || 0).toLocaleString('en-US')
}

function parseAmount (raw, max) {
  if (raw == null) return null
  const value = String(raw).trim().toLowerCase()
  if (value === 'all' || value === 'max' || value === '') return max
  if (value === 'half') return Math.floor(max / 2)
  const amount = Number(value.replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null
  return Math.floor(amount)
}

function createEconomyStore ({ database, logger }) {
  let ready = false

  async function ensureSchema () {
    if (ready) return
    const db = database()
    if (!db) throw new Error('DATABASE_URL is required for the Rimuru economy')
    await db.query(`
      CREATE TABLE IF NOT EXISTS rimuru_wa_users (
        user_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        wallet BIGINT NOT NULL DEFAULT ${START_BALANCE},
        bank BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (wallet >= 0),
        CHECK (bank >= 0)
      )
    `)
    ready = true
  }

  function normalizeRow (row) {
    if (!row) return null
    return {
      userId: row.user_id,
      displayName: row.display_name || '',
      wallet: Number(row.wallet || 0),
      bank: Number(row.bank || 0)
    }
  }

  async function ensureUser (userId, displayName = '') {
    await ensureSchema()
    const db = database()
    const result = await db.query(`
      INSERT INTO rimuru_wa_users(user_id, display_name, wallet, bank, last_seen)
      VALUES($1,$2,$3,0,NOW())
      ON CONFLICT(user_id) DO UPDATE SET
        display_name = CASE WHEN EXCLUDED.display_name <> '' THEN EXCLUDED.display_name ELSE rimuru_wa_users.display_name END,
        last_seen = NOW(),
        updated_at = NOW()
      RETURNING *
    `, [userId, displayName, START_BALANCE])
    return normalizeRow(result.rows[0])
  }

  async function getBalance (userId, displayName = '') {
    return ensureUser(userId, displayName)
  }

  async function moveMoney (userId, rawAmount, direction, displayName = '') {
    await ensureSchema()
    const db = database()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      await client.query(`
        INSERT INTO rimuru_wa_users(user_id, display_name, wallet, bank)
        VALUES($1,$2,$3,0)
        ON CONFLICT(user_id) DO NOTHING
      `, [userId, displayName, START_BALANCE])
      const locked = await client.query('SELECT * FROM rimuru_wa_users WHERE user_id=$1 FOR UPDATE', [userId])
      const user = normalizeRow(locked.rows[0])
      const max = direction === 'deposit' ? user.wallet : user.bank
      const amount = parseAmount(rawAmount, max)
      if (amount == null) {
        await client.query('ROLLBACK')
        return { ok: false, message: `Usage: ${direction === 'deposit' ? '/dep' : '/wd'} [amount|half|all]` }
      }
      if (amount <= 0 || amount > max) {
        await client.query('ROLLBACK')
        return { ok: false, message: `❌ You only have ${fmt(max)} in your ${direction === 'deposit' ? 'wallet' : 'bank'}.` }
      }
      const sql = direction === 'deposit'
        ? `UPDATE rimuru_wa_users SET wallet=wallet-$2, bank=bank+$2, updated_at=NOW(), last_seen=NOW() WHERE user_id=$1 RETURNING *`
        : `UPDATE rimuru_wa_users SET bank=bank-$2, wallet=wallet+$2, updated_at=NOW(), last_seen=NOW() WHERE user_id=$1 RETURNING *`
      const updated = normalizeRow((await client.query(sql, [userId, amount])).rows[0])
      await client.query('COMMIT')
      return { ok: true, amount, user: updated }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async function transfer ({ fromId, toId, rawAmount, source, fromName = '', toName = '' }) {
    if (!toId) return { ok: false, message: 'Reply to someone to choose the recipient.' }
    if (fromId === toId) return { ok: false, message: '🤨 You cannot send coins to yourself.' }
    await ensureSchema()
    const db = database()
    const client = await db.connect()
    try {
      await client.query('BEGIN')
      for (const [id, name] of [[fromId, fromName], [toId, toName]]) {
        await client.query(`
          INSERT INTO rimuru_wa_users(user_id, display_name, wallet, bank)
          VALUES($1,$2,$3,0) ON CONFLICT(user_id) DO NOTHING
        `, [id, name, START_BALANCE])
      }
      const ids = [fromId, toId].sort()
      await client.query('SELECT user_id FROM rimuru_wa_users WHERE user_id=ANY($1::text[]) ORDER BY user_id FOR UPDATE', [ids])
      const from = normalizeRow((await client.query('SELECT * FROM rimuru_wa_users WHERE user_id=$1', [fromId])).rows[0])
      const max = source === 'bank' ? from.bank : from.wallet
      const amount = parseAmount(rawAmount, max)
      if (amount == null) {
        await client.query('ROLLBACK')
        return { ok: false, message: `Usage: ${source === 'bank' ? '/transfer' : '/donate'} [amount|half|all] as a reply.` }
      }
      if (amount <= 0 || amount > max) {
        await client.query('ROLLBACK')
        return { ok: false, message: `❌ You only have ${fmt(max)} in your ${source}.` }
      }
      const column = source === 'bank' ? 'bank' : 'wallet'
      await client.query(`UPDATE rimuru_wa_users SET ${column}=${column}-$2, updated_at=NOW() WHERE user_id=$1`, [fromId, amount])
      await client.query(`UPDATE rimuru_wa_users SET ${column}=${column}+$2, updated_at=NOW() WHERE user_id=$1`, [toId, amount])
      await client.query('COMMIT')
      return { ok: true, amount }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }

  async function stats () {
    await ensureSchema()
    const result = await database().query(`
      SELECT COUNT(*)::int AS players,
             COALESCE(SUM(wallet),0)::text AS wallet,
             COALESCE(SUM(bank),0)::text AS bank
      FROM rimuru_wa_users
    `)
    return {
      players: Number(result.rows[0].players),
      wallet: Number(result.rows[0].wallet),
      bank: Number(result.rows[0].bank)
    }
  }

  return {
    ensureSchema,
    ensureUser,
    getBalance,
    deposit: (id, amount, name) => moveMoney(id, amount, 'deposit', name),
    withdraw: (id, amount, name) => moveMoney(id, amount, 'withdraw', name),
    donate: (args) => transfer({ ...args, source: 'wallet' }),
    transfer: (args) => transfer({ ...args, source: 'bank' }),
    stats,
    fmt
  }
}

module.exports = { createEconomyStore, fmt, parseAmount }
