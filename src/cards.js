'use strict'

const { database } = require('./auth-store')
const { canonicalUserId, quotedUserId, displayName, isModerator } = require('./economy-router')
const { isOwner } = require('./access')
const media = require('./card-media')
const power = require('./card-power')

function db () { const d = database(); if (!d) throw new Error('DATABASE_URL is required for Cards'); return d }
function cardKeyFromRow (r) {
  const m = String(r?.source_url || '').match(/\/cards\/info\/([^/?#]+)/i)
  return m ? m[1] : String(r?.telegram_message_id || '')
}
function normCard (r) { return r ? { ...r, card_key: cardKeyFromRow(r) } : null }
function tierStars (tier) { const n = Math.max(1, Math.min(6, Number(tier) || 1)); return '⭐'.repeat(n) }
function cardTitle (c) { return `#${c.card_key} • ${c.name || 'Unknown Character'}` }
function makeClaimCode () { return String(Math.floor(1000 + Math.random() * 90000)) }
function spawnCaption (c, code) {
  return `🃏 *CARD SPAWNED*

*${c.name || 'Unknown Character'}*
🎬 ${c.series || 'Unknown Series'}
${tierStars(c.tier)} *T${c.tier || 1}*
🆔 Claim ID: *${code}*

Use *!claim card ${code}* to claim.`
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
      group_jid TEXT PRIMARY KEY, card_key TEXT NOT NULL, claim_code TEXT, card_name TEXT NOT NULL DEFAULT '', series TEXT NOT NULL DEFAULT '', tier INT NOT NULL DEFAULT 1,
      source_url TEXT NOT NULL DEFAULT '', telegram_file_id TEXT NOT NULL DEFAULT '', telegram_media_type TEXT NOT NULL DEFAULT 'photo',
      spawned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '10 minutes', claimed_by TEXT
    );
    ALTER TABLE rimuru_wa_card_spawns ADD COLUMN IF NOT EXISTS claim_code TEXT;
    CREATE INDEX IF NOT EXISTS rimuru_wa_card_spawns_claim_code_idx ON rimuru_wa_card_spawns(claim_code);
  `)
  await power.ensureSchema()
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
async function archiveByNameTier (name, tier) {
  const archiveId = String(process.env.TELEGRAM_CARD_ARCHIVE_CHAT_ID || '').trim()
  const needle = String(name).trim().toLowerCase().replace(/\s+/g, ' ')
  const params = [needle, Number(tier)]
  let archiveSql = ''
  if (archiveId) { params.push(archiveId); archiveSql = ' AND archive_chat_id::text=$3' }
  const q = await db().query(`SELECT source_url,name,normalized_name,series,tier,media_url,media_type,telegram_file_id,telegram_media_type,telegram_message_id,archive_chat_id
    FROM shoob_cards
    WHERE tier=$2${archiveSql}
      AND (
        lower(trim(name))=$1 OR lower(trim(COALESCE(normalized_name,'')))=$1
        OR lower(name) ~ ('(^|[^a-z0-9])' || $1 || '([^a-z0-9]|$)')
        OR lower(COALESCE(normalized_name,'')) ~ ('(^|[^a-z0-9])' || $1 || '([^a-z0-9]|$)')
      )
    ORDER BY CASE WHEN lower(trim(name))=$1 OR lower(trim(COALESCE(normalized_name,'')))=$1 THEN 0 ELSE 1 END,
             telegram_message_id DESC NULLS LAST
    LIMIT 10`, params)
  return q.rows.map(normCard)
}
async function randomArchiveCard () {
  const archiveId=String(process.env.TELEGRAM_CARD_ARCHIVE_CHAT_ID||'').trim()
  const q = await db().query(`SELECT s.source_url,s.name,s.normalized_name,s.series,s.tier,s.media_url,s.media_type,s.telegram_file_id,s.telegram_media_type,s.telegram_message_id,s.archive_chat_id
    FROM shoob_cards s LEFT JOIN rimuru_wa_card_claims c ON c.card_key=COALESCE(substring(s.source_url from '/cards/info/([^/?#]+)'),s.telegram_message_id::text)
    WHERE c.card_key IS NULL AND COALESCE(s.telegram_file_id,'')<>'' ${archiveId?'AND s.archive_chat_id::text=$1':''} ORDER BY RANDOM() LIMIT 1`,archiveId?[archiveId]:[])
  return normCard(q.rows[0])
}
async function uniqueClaimCode () {
  for (let i = 0; i < 20; i++) {
    const code = makeClaimCode()
    const q = await db().query('SELECT 1 FROM rimuru_wa_card_spawns WHERE claim_code=$1 AND claimed_by IS NULL AND expires_at>NOW() LIMIT 1', [code])
    if (!q.rowCount) return code
  }
  return String(Date.now()).slice(-5)
}
async function spawn (groupJid, card) {
  await ensureSchema()
  const code = await uniqueClaimCode()
  await db().query(`INSERT INTO rimuru_wa_card_spawns(group_jid,card_key,claim_code,card_name,series,tier,source_url,telegram_file_id,telegram_media_type,spawned_at,expires_at,claimed_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()+INTERVAL '10 minutes',NULL)
    ON CONFLICT(group_jid) DO UPDATE SET card_key=EXCLUDED.card_key,claim_code=EXCLUDED.claim_code,card_name=EXCLUDED.card_name,series=EXCLUDED.series,tier=EXCLUDED.tier,source_url=EXCLUDED.source_url,telegram_file_id=EXCLUDED.telegram_file_id,telegram_media_type=EXCLUDED.telegram_media_type,spawned_at=NOW(),expires_at=NOW()+INTERVAL '10 minutes',claimed_by=NULL`,
  [groupJid, card.card_key, code, card.name || '', card.series || '', Number(card.tier) || 1, card.source_url || '', card.telegram_file_id || '', card.telegram_media_type || 'photo'])
  return code
}
async function claim (groupJid, userId, code) {
  await ensureSchema()
  const q = await db().query(`WITH won AS (
      UPDATE rimuru_wa_card_spawns SET claimed_by=$2
      WHERE group_jid=$1 AND claim_code=$3 AND claimed_by IS NULL AND expires_at>NOW()
        AND NOT EXISTS(SELECT 1 FROM rimuru_wa_card_claims c WHERE c.card_key=rimuru_wa_card_spawns.card_key)
      RETURNING *
    ), ins AS (
      INSERT INTO rimuru_wa_card_claims(card_key,user_id,card_name,series,tier,source_url,telegram_file_id,telegram_media_type,claimed_group_jid)
      SELECT card_key,$2,card_name,series,tier,source_url,telegram_file_id,telegram_media_type,$1 FROM won
      ON CONFLICT(card_key) DO NOTHING RETURNING *
    ) SELECT * FROM ins`, [groupJid, userId, String(code)])
  if (q.rows[0]) return { ok: true, card: q.rows[0] }
  const active = (await db().query('SELECT card_key,claim_code,claimed_by,expires_at FROM rimuru_wa_card_spawns WHERE group_jid=$1', [groupJid])).rows[0]
  if (!active) return { ok: false, message: '🃏 There is no active card spawn in this group.' }
  if (String(active.claim_code) !== String(code)) return { ok: false, message: '❌ Wrong claim ID.' }
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

const searchSessions = new Map()
function quotedStanzaId (content) {
  return content?.extendedTextMessage?.contextInfo?.stanzaId ||
    content?.imageMessage?.contextInfo?.stanzaId ||
    content?.videoMessage?.contextInfo?.stanzaId || ''
}
function mentionedUserId (content) {
  const contexts = [content?.extendedTextMessage?.contextInfo, content?.imageMessage?.contextInfo, content?.videoMessage?.contextInfo]
  const jid = contexts.flatMap(x => x?.mentionedJid || [])[0]
  return jid ? String(jid).split(':')[0].split('@')[0] : null
}
function rememberSearch (messageId, jid, userId, cards) {
  if (!messageId) return
  searchSessions.set(messageId, { jid, userId, cards, expiresAt: Date.now() + 5 * 60 * 1000 })
  const timer = setTimeout(() => searchSessions.delete(messageId), 5 * 60 * 1000 + 1000)
  timer.unref?.()
}

function createCards ({ logger }) {
  const send = (s, j, m, t) => s.sendMessage(j, { text: t }, { quoted: m })
  async function handle (sock, m, content) {
    const jid = m.key.remoteJid
    const id = canonicalUserId(m.key)
    const name = displayName(m) || 'Player'
    const raw = String(content.conversation || content.extendedTextMessage?.text || '').trim()
    if (!raw) return false
    const replyId = quotedStanzaId(content)
    if (/^\d{1,2}$/.test(raw) && replyId && searchSessions.has(replyId)) {
      const session = searchSessions.get(replyId)
      if (session.expiresAt <= Date.now()) { searchSessions.delete(replyId); await send(sock, jid, m, '⌛ That card search expired. Run */card <name> t<tier>* again.'); return true }
      if (session.jid !== jid || session.userId !== id) return false
      const pick = Number(raw) - 1
      const card = session.cards[pick]
      if (!card) { await send(sock, jid, m, `❌ Reply with a number from *1–${session.cards.length}*.`); return true }
      searchSessions.delete(replyId)
      const info = `🃏 *${card.name}*\n${tierStars(card.tier)} T${card.tier}\n🎬 ${card.series || 'Unknown Series'}`
      try { await media.sendCardMedia(sock, jid, card, info, m) } catch (e) { logger.warn({ err: e, card: card.card_key }, 'card selection media failed'); await send(sock, jid, m, `⚠️ Card found, but archive media could not be fetched.\n\n${e.message}`) }
      return true
    }
    const claimMatch = raw.match(/^!claim\s+card\s+#?(\d{4,5})\s*$/i)
    if (claimMatch) {
      if (!(await registered(id))) { await send(sock, jid, m, '🌊 Use */start* first to register with Rimuru.'); return true }
      if (!jid.endsWith('@g.us')) { await send(sock, jid, m, '🃏 Cards can only be claimed from a group spawn.'); return true }
      const r = await claim(jid, id, claimMatch[1])
      await send(sock, jid, m, r.ok ? `🎉 *CARD CLAIMED!*\n\n👤 *${name}* claimed *${r.card.card_name}*\n${tierStars(r.card.tier)} T${r.card.tier}\n\nUse */collection* to view your cards.` : r.message)
      return true
    }
    if (!raw.startsWith('/')) return false
    const parts = raw.split(/\s+/), cmd = parts.shift().toLowerCase().split('@')[0], args = parts
    if (!['/cards','/collection','/card','/cardinfo','/spawncard','/grant','/grantcard','/cardstats','/deck','/rerollcardstats','/setcardstats'].includes(cmd)) return false
    if (!(await registered(id))) { await send(sock, jid, m, '🌊 Use */start* first to register with Rimuru.'); return true }
    await ensureSchema()
    if (cmd === '/grant' || cmd === '/grantcard') {
      if (!isOwner(id)) { await send(sock, jid, m, '⛔ *ORIGINAL OWNER ONLY*'); return true }
      if (cmd === '/grant' && String(args[0] || '').toLowerCase() !== 'card') return false
      const grantArgs = cmd === '/grant' ? args.slice(1) : args.slice()
      const tierArg = grantArgs.find(x => /^t[1-6]$/i.test(x))
      const tier = tierArg ? Number(tierArg.slice(1)) : 0
      const target = quotedUserId(content) || mentionedUserId(content) || id
      const searchName = grantArgs.filter(x => x !== tierArg && !/^@\d+$/.test(x)).join(' ').trim()
      if (!searchName || !tier) { await send(sock, jid, m, 'Use */grant card <character name> t1-t6*\nReply to or mention a registered player to grant it to them.'); return true }
      if (!(await registered(target))) { await send(sock, jid, m, '🌊 That player must use */start* before receiving cards.'); return true }
      const matches = await archiveByNameTier(searchName, tier)
      let card = null
      for (const candidate of matches) if (!(await ownedCard(candidate.card_key))) { card = candidate; break }
      if (!card) { await send(sock, jid, m, matches.length ? `💨 Every matching *${searchName} T${tier}* archive instance is already owned.` : `❌ No *${searchName} T${tier}* card was found.`); return true }
      await db().query(`INSERT INTO rimuru_wa_card_claims(card_key,user_id,card_name,series,tier,source_url,telegram_file_id,telegram_media_type,claimed_group_jid,acquisition_source,granted_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'owner_grant',$10)`, [card.card_key, target, card.name || '', card.series || '', Number(card.tier) || tier, card.source_url || '', card.telegram_file_id || '', card.telegram_media_type || 'photo', jid, id])
      await send(sock, jid, m, `🎁 *CARD GRANTED*\n\n🃏 *${card.name}* — T${card.tier}\n🆔 #${card.card_key}\n👤 +${target}\n\nIts combat profile will be generated and permanently saved on first use.`)
      return true
    }
    if (cmd === '/deck') {
      const keys = args.map(x => String(x).replace(/^#/, '')).filter(Boolean)
      if (!keys.length) {
        const current = await power.deck(id, 3, { logger })
        await send(sock, jid, m, `🃏 *CARD BATTLE DECK*\n\n${current.length ? current.map((x, i) => `${i + 1}. *${x.name}* — T${x.tier} • ⚡ ${x.power}`).join('\n') : 'No owned cards yet.'}\n\nSet it with */deck #id #id #id*.`)
        return true
      }
      const result = await power.setDeck(id, keys)
      await send(sock, jid, m, result.ok ? `✅ *DECK SAVED*\n\n${result.keys.map((x, i) => `${i + 1}. #${x}`).join('\n')}\n\nUnused slots automatically use your strongest owned cards.` : `❌ ${result.message}`)
      return true
    }
    if (cmd === '/cardstats' || cmd === '/rerollcardstats' || cmd === '/setcardstats') {
      const key = String(args[0] || '').replace(/^#/, '')
      const card = key ? await ownedCard(key) : null
      if (!card) { await send(sock, jid, m, 'Use */cardstats #owned-card-id*.'); return true }
      if (cmd !== '/cardstats' && !(isOwner(id) || await isModerator(id))) { await send(sock, jid, m, '🛡️ Only Lily moderators can change a saved combat profile.'); return true }
      if (cmd === '/setcardstats') {
        const nums = args.slice(1, 6).map(Number)
        if (nums.length !== 5 || nums.some(x => !Number.isFinite(x))) { await send(sock, jid, m, 'Use */setcardstats #id <base power> <attack> <defense> <speed> <technique>*.'); return true }
        const profile = power.validateProfile({ base_power: nums[0], attack: nums[1], defense: nums[2], speed: nums[3], technique: nums[4], role: 'Custom Fighter', energy_type: 'Custom', passive: 'Owner Tuned', signature: 'Owner Tuned', confidence: 1 }, card)
        await power.saveProfile(card, profile, 'owner_override', { set_by: id })
      }
      const profile = await power.getProfile(card, { force: cmd === '/rerollcardstats', logger })
      const stat = power.effectiveStats(card, profile)
      await send(sock, jid, m, `⚔️ *CARD COMBAT PROFILE*\n\n🃏 *${stat.name}* — T${stat.tier}\n🎬 ${stat.series || 'Unknown Series'}\n⚡ Power: *${stat.power}* (base ${profile.base_power})\n❤️ HP: *${stat.hp}*\n🗡️ Attack: *${stat.attack}*\n🛡️ Defense: *${stat.defense}*\n💨 Speed: *${stat.speed}*\n🎯 Technique: *${stat.technique}*\n\n✨ ${stat.passive}\n💥 ${stat.signature}\n_Rating: ${profile.source}; saved permanently._`)
      return true
    }
    if (cmd === '/cards') {
      const c = await collection(id, 5)
      await send(sock, jid, m, `🃏 *RIMURU CARDS*\n\n🎴 Owned: *${c.total}*\n\n*/collection* — your cards\n*/cardinfo <id>* — card details\n*/cardstats <id>* — combat rating\n*/deck #id #id #id* — battle team\n*/card <name> t<tier>* — moderator archive search\n\nGroup claims use *!claim card <id>*.`)
      return true
    }
    if (cmd === '/collection') {
      const c = await collection(id, 25)
      const body = c.rows.length ? c.rows.map((x, i) => `${i + 1}. ${tierStars(x.tier)} *#${x.card_key} — ${x.card_name}*\n   ${x.series || 'Unknown Series'} • T${x.tier}`).join('\n\n') : 'No cards yet. Catch a group spawn.'
      await send(sock, jid, m, `🎴 *${name.toUpperCase()} • COLLECTION*\n\nOwned: *${c.total}*\n\n${body}${c.total > c.rows.length ? `\n\n_Showing ${c.rows.length}/${c.total}._` : ''}`)
      return true
    }
    if (cmd === '/card') {
      if (!(isOwner(id) || await isModerator(id))) { await send(sock, jid, m, '🛡️ */card* archive search is for Rimuru moderators only.'); return true }
      const tierArg = args.find(x => /^t[1-6]$/i.test(x))
      const tier = tierArg ? Number(tierArg.slice(1)) : 0
      const searchName = args.filter(x => x !== tierArg).join(' ').trim()
      if (!searchName || !tier) { await send(sock, jid, m, 'Use */card <character> t<tier>*\nExample: */card Goku t5*'); return true }
      const matches = await archiveByNameTier(searchName, tier)
      if (!matches.length) { await send(sock, jid, m, `❌ No *${searchName} T${tier}* card was found in the archive.`); return true }
      if (matches.length > 1) {
        const shown = matches.slice(0, 8)
        const list = shown.map((x, i) => `${i + 1}. *${x.name}* — ${x.series || 'Unknown'} • T${x.tier}`).join('\n')
        const sent = await sock.sendMessage(jid, { text: `🔎 *${shown.length} MATCHES FOUND*\n\n${list}\n\n↩️ Reply to this message with *1–${shown.length}* to view a card.` }, { quoted: m })
        rememberSearch(sent?.key?.id, jid, id, shown)
        return true
      }
      const card = matches[0]
      const info = `🃏 *${card.name}*\n${tierStars(card.tier)} T${card.tier}\n🎬 ${card.series || 'Unknown Series'}`
      try { await media.sendCardMedia(sock, jid, card, info, m) } catch (e) { logger.warn({ err: e, card: card.card_key }, 'card search media send failed'); await send(sock, jid, m, `⚠️ Card found, but archive media could not be fetched.\n\n${e.message}`) }
      return true
    }
    if (cmd === '/cardinfo') {
      const key = String(args[0] || '').replace(/^#/, '')
      if (!key) { await send(sock, jid, m, 'Use */cardinfo <archive card id>*.'); return true }
      const owned = await ownedCard(key), card = owned || await archiveByKey(key)
      if (!card) { await send(sock, jid, m, '❌ Card was not found in the shared archive catalogue.'); return true }
      await send(sock, jid, m, `🃏 *${cardTitle({ ...card, card_key: key, name: card.card_name || card.name })}*\n${tierStars(card.tier)} T${card.tier}\n🎬 ${card.series || 'Unknown Series'}${owned ? '\n👤 Owned: *Yes*' : '\n👤 Owned: *No*'}`)
      return true
    }
    if (cmd === '/spawncard') {
      if (!jid.endsWith('@g.us')) { await send(sock, jid, m, '🃏 Spawn cards inside a WhatsApp group.'); return true }
      if (!(isOwner(id) || await isModerator(id))) { await send(sock, jid, m, '🛡️ Only the Original Owner or a Rimuru moderator can spawn a card manually.'); return true }
      const key = String(args[0] || '').replace(/^#/, '')
      const card = key ? await archiveByKey(key) : await randomArchiveCard()
      if (!card) { await send(sock, jid, m, key ? `❌ Archive card *#${key}* was not found.` : '❌ No unowned archive card is available.'); return true }
      if (await ownedCard(card.card_key)) { await send(sock, jid, m, `💨 *#${card.card_key}* is already owned. Pick another card.`); return true }
      const code = await spawn(jid, card)
      try { await media.sendCardMedia(sock, jid, card, spawnCaption(card, code), m) } catch (e) { logger.warn({ err: e, card: card.card_key }, 'card spawn media failed'); await send(sock, jid, m, `⚠️ Spawn prepared but media fetch failed, so the spawn was cancelled.\n\n${e.message}`); await db().query('DELETE FROM rimuru_wa_card_spawns WHERE group_jid=$1 AND card_key=$2', [jid, card.card_key]); return true }
      return true
    }
    return false
  }
  return { handle, ensureSchema }
}

module.exports = { createCards, ensureSchema, archiveByKey, archiveByNameTier, randomArchiveCard, claim, collection }
