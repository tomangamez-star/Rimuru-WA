'use strict'

const crypto = require('crypto')

function createInstanceLease ({ database, logger, key = process.env.WA_SESSION_ID || 'rimuru-wa-test', ttlMs = 45000, retryMs = 5000, heartbeatMs = 10000 }) {
  const holder = `${process.env.RENDER_INSTANCE_ID || process.env.HOSTNAME || 'local'}:${process.pid}:${crypto.randomUUID()}`
  let owned = false
  let stopped = false
  let timer = null
  let heartbeatBusy = false
  let heartbeatFailures = 0
  let onLost = null

  async function ensureSchema (db) {
    await db.query(`CREATE TABLE IF NOT EXISTS rimuru_instance_leases (
      lease_key TEXT PRIMARY KEY,
      holder_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
  }

  async function tryClaim (db) {
    const result = await db.query(`INSERT INTO rimuru_instance_leases(lease_key,holder_id,expires_at,updated_at)
      VALUES($1,$2,NOW()+($3 * INTERVAL '1 millisecond'),NOW())
      ON CONFLICT(lease_key) DO UPDATE SET
        holder_id=EXCLUDED.holder_id,
        expires_at=EXCLUDED.expires_at,
        updated_at=NOW()
      WHERE rimuru_instance_leases.expires_at < NOW()
         OR rimuru_instance_leases.holder_id=EXCLUDED.holder_id
      RETURNING holder_id`, [key, holder, ttlMs])
    return result.rows[0]?.holder_id === holder
  }

  async function loseOwnership (reason) {
    if (!owned) return
    owned = false
    if (timer) clearInterval(timer)
    timer = null
    logger.error({ reason, leaseKey: key }, 'Lily instance lease lost; stopping external connections')
    await onLost?.(reason)
  }

  async function heartbeat (db) {
    if (heartbeatBusy || stopped || !owned) return
    heartbeatBusy = true
    try {
      const result = await db.query(`UPDATE rimuru_instance_leases
        SET expires_at=NOW()+($3 * INTERVAL '1 millisecond'),updated_at=NOW()
        WHERE lease_key=$1 AND holder_id=$2 RETURNING holder_id`, [key, holder, ttlMs])
      if (!result.rowCount) await loseOwnership('lease-owned-by-another-instance')
      else heartbeatFailures = 0
    } catch (error) {
      heartbeatFailures++
      logger.warn({ err: error, heartbeatFailures }, 'Lily lease heartbeat failed')
      if (heartbeatFailures * heartbeatMs >= ttlMs) await loseOwnership('database-heartbeat-expired')
    } finally { heartbeatBusy = false }
  }

  async function acquire (lostHandler) {
    onLost = lostHandler
    const db = database()
    if (!db) {
      owned = true
      logger.warn('DATABASE_URL is missing; running without distributed instance protection')
      return true
    }
    await ensureSchema(db)
    let announced = false
    while (!stopped) {
      try {
        if (await tryClaim(db)) {
          owned = true
          heartbeatFailures = 0
          timer = setInterval(() => void heartbeat(db), heartbeatMs)
          timer.unref?.()
          logger.info({ leaseKey: key, holder }, 'Lily instance lease acquired')
          return true
        }
        if (!announced) {
          announced = true
          logger.warn({ leaseKey: key }, 'Another deployment owns Lily; this process is standing by')
        }
      } catch (error) {
        logger.warn({ err: error }, 'Could not claim Lily instance lease; retrying')
      }
      await new Promise(resolve => setTimeout(resolve, retryMs))
    }
    return false
  }

  async function release () {
    stopped = true
    if (timer) clearInterval(timer)
    timer = null
    if (!owned) return
    owned = false
    const db = database()
    if (db) await db.query('DELETE FROM rimuru_instance_leases WHERE lease_key=$1 AND holder_id=$2', [key, holder]).catch(error => logger.warn({ err: error }, 'Lily lease release failed'))
  }

  return { acquire, release, status: () => ({ owned, role: owned ? 'active' : 'standby' }) }
}

module.exports = { createInstanceLease }
