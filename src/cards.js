'use strict'

const { database } = require('./auth-store')
const { canonicalUserId, displayName, isModerator } = require('./economy-router')
const { isOwner } = require('./access')
const media = require('./card-media')

function db () { const d = database(); if (!d) throw new Error('DATABASE_URL is required for Cards'); return d }
function cardKeyFromRow (r) {
  const m = String(r?.source_url || '').match(/\/cards\/info\/([^/?#]+)/i)
  return m ? m[1] : String(r?.telegram_message_id || '')
}
function normCard (r) { return r ? { ...r, card_key: cardKeyFromRow(r) } : null }
function tierStars (tier) { const n = Math.max(1, Math.min(6, Number(tier) || 1)); return '⭐'.repeat(n) }
function cardTitle (c) { return `#${c.card_key} • ${c.name || 'Unknown Character'}` }
function spawnCaption (c) {
  return `🃏 *CARD SPAWNED*\n\n*${c.name || 'Unknown Character'}*\n🎬 ${c.series || 'Unknown Series'}\n${tierStars(c.tier)} *T${c.tier || 1}*\n🆔 Card: *#${c.card_key}*\n\nUse *!claim card ${c.card_key}* to claim.`
}

let ready = false
async function ensureSchema () {
  if (ready) return
  await db().query(`
    CREATE TABLE IF NOT EXISTS rimuru_wa_card_claims(
      card_key TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES rimuru_wa_users(user_id) ON DELETE CASCADE,
      card_name TEXT NOT NULL DEFAULT '', series TEXT NOT NULL DEFAULT '', tier INT NOT NULL DEFAULT 1,
      source_url TEXT NOT NULL DEFAULT '', telegram_file_id TEXT NOT NULL DEFAULT '', telegram_media_type TEXT NOT NULL DEFAULT 'photo',
      claimed_group_jid TEXT NOT NULL DEFAULT '', claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS rimuru_wa_card_claims_user_idx ON rimuru_wa_card_claims(user_id, claimed_at DESC);
    CREATE TABLE IF NOT EXISTS rimuru_wa_card_spawns(
      group_jid TEXT PRIMARY KEY, card_key TEXT NOT NULL, card_name TEXT NOT NULL DEFAULT '', series TEXT NOT NULL DEFAULT '', tier INT NOT NULL DEFAULT 1,
      source_url TEXT NOT NULL DEFAULT '', telegram_file_id TEXT NOT NULL DEFAULT '', telegram_media_type TEXT NOT NULL DEFAULT 'photo',
      spawned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '10 minutes', claimed_by TEXT
    );
  `)
  ready = true
}
async function registered (id) { return !!(await db().query('SELECT 1 FROM rimuru_wa_users WHERE user_id=$1', [id])).rowCount }
async function archiveByKey (key) {
  const archiveId=String(process.env.TELEGRAM_CARD_ARCHIVE_CHAT_ID||'').trim()
  const params=[String(key)], archiveSql=archiveId?' AND archive_chat_id::text=$2':''
  if(archiveId)params.push(archiveId)
  const q = await db().query(`SELECT source_url,name,normalized_name,series,tier,media_url,media_type,telegram_file_id,telegram_media_type,telegram_message_id,archive_chat_id
    FROM shoob_cards WHERE (substring(source_url from '/cards/info/([^/?#]+)')=$1 OR telegram_message_id::text=$1)${archiveSql} LIMIT 1`, params)
  return normCard(q.rows[0])
}
async function randomArchiveCard () {
  const archiveId=String(process.env.TELEGRAM_CARD_ARCHIVE_CHAT_ID||'').trim()
  const q = await db().query(`SELECT s.source_url,s.name,s.normalized_name,s.series,s.tier,s.media_url,s.media_type,s.telegram_file_id,s.telegram_media_type,s.telegram_message_id,s.archive_chat_id
    FROM shoob_cards s LEFT JOIN rimuru_wa_card_claims c ON c.card_key=COALESCE(substring(s.source_url from '/cards/info/([^/?#]+)'),s.telegram_message_id::text)
    WHERE c.card_key IS NULL AND COALESCE(s.telegram_file_id,'')<>'' ${archiveId?'AND s.archive_chat_id::text=$1':''} ORDER BY RANDOM() LIMIT 1`,archiveId?[archiveId]:[])
  return normCard(q.rows[0])
}
async function spawn (groupJid, card) {
  await ensureSchema()
  await db().query(`INSERT INTO rimuru_wa_card_spawns(group_jid,card_key,card_name,series,tier,source_url,telegram_file_id,telegram_media_type,spawned_at,expires_at,claimed_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()+INTERVAL '10 minutes',NULL)
    ON CONFLICT(group_jid) DO UPDATE SET card_key=EXCLUDED.card_key,card_name=EXCLUDED.card_name,series=EXCLUDED.series,tier=EXCLUDED.tier,source_url=EXCLUDED.source_url,telegram_file_id=EXCLUDED.telegram_file_id,telegram_media_type=EXCLUDED.telegram_media_type,spawned_at=NOW(),expires_at=NOW()+INTERVAL '10 minutes',claimed_by=NULL`,
  [groupJid, card.card_key, card.name || '', card.series || '', Number(card.tier) || 1, card.source_url || '', card.telegram_file_id || '', card.telegram_media_type || 'photo'])
}
async function claim (groupJid, userId, key) {
  await ensureSchema()
  const q = await db().query(`WITH won AS (
      UPDATE rimuru_wa_card_spawns SET claimed_by=$2
      WHERE group_jid=$1 AND card_key=$3 AND claimed_by IS NULL AND expires_at>NOW()
        AND NOT EXISTS(SELECT 1 FROM rimuru_wa_card_claims WHERE card_key=$3)
      RETURNING *
    ), ins AS (
      INSERT INTO rimuru_wa_card_claims(card_key,user_id,card_name,series,tier,source_url,telegram_file_id,telegram_media_type,claimed_group_jid)
      SELECT card_key,$2,card_name,series,tier,source_url,telegram_file_id,telegram_media_type,$1 FROM won
      ON CONFLICT(card_key) DO NOTHING RETURNING *
    ) SELECT * FROM ins`, [groupJid, userId, String(key)])
  if (q.rows[0]) return { ok: true, card: q.rows[0] }
  const active = (await db().query('SELECT card_key,claimed_by,expires_at FROM rimuru_wa_card_spawns WHERE group_jid=$1', [groupJid])).rows[0]
  if (!active) return { ok: false, message: '🃏 There is no active card spawn in this group.' }
  if (String(active.card_key) !== String(key)) return { ok: false, message: `❌ Wrong card ID. The active spawn is *#${active.card_key}*.` }
  if (active.claimed_by) return { ok: false, message: '💨 Too late — somebody already claimed this card.' }
  if (new Date(active.expires_at).getTime() <= Date.now()) return { ok: false, message: '⌛ That card spawn expired.' }
  return { ok: false, message: '💨 Too late — that card is already owned.' }
}
async function collection (userId, limit = 20) {
  await ensureSchema()
  const q = await db().query('SELECT * FROM rimuru_wa_card_claims WHERE user_id=$1 ORDER BY tier DESC,claimed_at DESC LIMIT $2', [userId, Math.max(1, Math.min(50, limit))])
  const total = Number((await db().query('SELECT COUNT(*)::int AS n FROM rimuru_wa_card_claims WHERE user_id=$1', [userId])).rows[0]?.n || 0)
  return { rows: q.rows, total }
}
async function ownedCard (key) { await ensureSchema(); return (await db().query('SELECT * FROM rimuru_wa_card_claims WHERE card_key=$1', [String(key)])).rows[0] || null }

function createCards ({ logger }) {
  const send = (s, j, m, t) => s.sendMessage(j, { text: t }, { quoted: m })
  async function handle (sock, m, content) {
    const jid = m.key.remoteJid
    const id = canonicalUserId(m.key)
    const name = displayName(m) || 'Player'
    const raw = String(content.conversation || content.extendedTextMessage?.text || '').trim()
    if (!raw) return false
    const claimMatch = raw.match(/^!claim\s+card\s+#?([a-zA-Z0-9._-]+)\s*$/i)
    if (claimMatch) {
      if (!(await registered(id))) { await send(sock, jid, m, '🌊 Use */start* first to register with Rimuru.'); return true }
      if (!jid.endsWith('@g.us')) { await send(sock, jid, m, '🃏 Cards can only be claimed from a group spawn.'); return true }
      const r = await claim(jid, id, claimMatch[1])
      await send(sock, jid, m, r.ok ? `🎉 *CARD CLAIMED!*\n\n👤 *${name}* claimed *#${r.card.card_key} — ${r.card.card_name}*\n${tierStars(r.card.tier)} T${r.card.tier}\n\nUse */collection* to view your cards.` : r.message)
      return true
    }
    if (!raw.startsWith('/')) return false
    const parts = raw.split(/\s+/), cmd = parts.shift().toLowerCase().split('@')[0], args = parts
    if (!['/cards','/collection','/card','/cardinfo','/spawncard'].includes(cmd)) return false
    if (!(await registered(id))) { await send(sock, jid, m, '🌊 Use */start* first to register with Rimuru.'); return true }
    await ensureSchema()
    if (cmd === '/cards') {
      const c = await collection(id, 5)
      await send(sock, jid, m, `🃏 *RIMURU CARDS*\n\n🎴 Owned: *${c.total}*\n\n*/collection* — your cards\n*/cardinfo <id>* — card details\n*/card <id>* — open artwork\n\nGroup claims use *!claim card <id>*.`)
      return true
    }
    if (cmd === '/collection') {
      const c = await collection(id, 25)
      const body = c.rows.length ? c.rows.map((x, i) => `${i + 1}. ${tierStars(x.tier)} *#${x.card_key} — ${x.card_name}*\n   ${x.series || 'Unknown Series'} • T${x.tier}`).join('\n\n') : 'No cards yet. Catch a group spawn.'
      await send(sock, jid, m, `🎴 *${name.toUpperCase()} • COLLECTION*\n\nOwned: *${c.total}*\n\n${body}${c.total > c.rows.length ? `\n\n_Showing ${c.rows.length}/${c.total}._` : ''}`)
      return true
    }
    if (cmd === '/cardinfo' || cmd === '/card') {
      const key = String(args[0] || '').replace(/^#/, '')
      if (!key) { await send(sock, jid, m, `Use *${cmd} <card id>*.`); return true }
      const owned = await ownedCard(key), card = owned || await archiveByKey(key)
      if (!card) { await send(sock, jid, m, `❌ Card *#${key}* wasn't found in the shared archive catalogue.`); return true }
      const info = `🃏 *${cardTitle({ ...card, card_key: key, name: card.card_name || card.name })}*\n${tierStars(card.tier)} T${card.tier}\n🎬 ${card.series || 'Unknown Series'}${owned ? `\n👤 Owned: *Yes*` : '\n👤 Owned: *No*'}`
      if (cmd === '/cardinfo') { await send(sock, jid, m, info); return true }
      try { await media.sendCardMedia(sock, jid, { ...card, card_key: key }, info, m) } catch (e) { logger.warn({ err: e, card: key }, 'card media send failed'); await send(sock, jid, m, `⚠️ Card metadata was found, but the archive media could not be fetched.\n\n${e.message}`) }
      return true
    }
    if (cmd === '/spawncard') {
      if (!jid.endsWith('@g.us')) { await send(sock, jid, m, '🃏 Spawn cards inside a WhatsApp group.'); return true }
      if (!(isOwner(id) || await isModerator(id))) { await send(sock, jid, m, '🛡️ Only the Original Owner or a Rimuru moderator can spawn a card manually.'); return true }
      const key = String(args[0] || '').replace(/^#/, '')
      const card = key ? await archiveByKey(key) : await randomArchiveCard()
      if (!card) { await send(sock, jid, m, key ? `❌ Archive card *#${key}* was not found.` : '❌ No unowned archive card is available.'); return true }
      if (await ownedCard(card.card_key)) { await send(sock, jid, m, `💨 *#${card.card_key}* is already owned. Pick another card.`); return true }
      await spawn(jid, card)
      try { await media.sendCardMedia(sock, jid, card, spawnCaption(card), m) } catch (e) { logger.warn({ err: e, card: card.card_key }, 'card spawn media failed'); await send(sock, jid, m, `⚠️ Spawn prepared but media fetch failed, so the spawn was cancelled.\n\n${e.message}`); await db().query('DELETE FROM rimuru_wa_card_spawns WHERE group_jid=$1 AND card_key=$2', [jid, card.card_key]); return true }
      return true
    }
    return false
  }
  return { handle, ensureSchema }
}

module.exports = { createCards, ensureSchema, archiveByKey, randomArchiveCard, claim, collection }
