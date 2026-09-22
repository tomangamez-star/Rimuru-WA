'use strict'

const crypto = require('crypto')
const { database } = require('./auth-store')

const TIER_MULTIPLIERS = Object.freeze({ 1: 0.82, 2: 0.88, 3: 0.94, 4: 1, 5: 1.08, 6: 1.17 })
const FALLBACK_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b']
let ready = false

function db () { const d = database(); if (!d) throw new Error('DATABASE_URL is required for Card Battle'); return d }
function clamp (value, min, max) { return Math.max(min, Math.min(max, Math.round(Number(value) || min))) }
function clean (value, max = 90) { return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) }
function normalize (value) { return clean(value, 160).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() }
function profileKey (card) { return crypto.createHash('sha256').update(`${normalize(card.card_name || card.name)}|${normalize(card.series)}`).digest('hex').slice(0, 32) }
function hashInt (seed, index, min, max) { const h = crypto.createHash('sha256').update(`${seed}:${index}`).digest(); return min + (h.readUInt32BE(0) % (max - min + 1)) }

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
    ALTER TABLE rimuru_wa_card_claims ADD COLUMN IF NOT EXISTS acquisition_source TEXT NOT NULL DEFAULT 'spawn_claim';
    ALTER TABLE rimuru_wa_card_claims ADD COLUMN IF NOT EXISTS granted_by TEXT;
    CREATE TABLE IF NOT EXISTS rimuru_wa_card_power_profiles(
      profile_key TEXT PRIMARY KEY, character_name TEXT NOT NULL, series TEXT NOT NULL DEFAULT '',
      base_power INT NOT NULL, attack INT NOT NULL, defense INT NOT NULL, speed INT NOT NULL, technique INT NOT NULL,
      role TEXT NOT NULL DEFAULT 'Fighter', energy_type TEXT NOT NULL DEFAULT 'Unknown', passive TEXT NOT NULL DEFAULT '', signature TEXT NOT NULL DEFAULT '',
      confidence NUMERIC(4,3) NOT NULL DEFAULT 0.5, source TEXT NOT NULL DEFAULT 'ai', raw_ai JSONB NOT NULL DEFAULT '{}'::jsonb,
      balance_version INT NOT NULL DEFAULT 1, generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS rimuru_wa_card_decks(
      user_id TEXT PRIMARY KEY REFERENCES rimuru_wa_users(user_id) ON DELETE CASCADE,
      card_keys TEXT[] NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)
  ready = true
}

function validateProfile (value, card) {
  const name = clean(card.card_name || card.name || 'Unknown Character', 100)
  return {
    character_name: name,
    series: clean(card.series || 'Unknown Series', 100),
    base_power: clamp(value.base_power, 100, 1000),
    attack: clamp(value.attack, 25, 100), defense: clamp(value.defense, 25, 100),
    speed: clamp(value.speed, 25, 100), technique: clamp(value.technique, 25, 100),
    role: clean(value.role || 'Fighter', 30), energy_type: clean(value.energy_type || 'Unknown', 40),
    passive: clean(value.passive || 'Steady Resolve', 90), signature: clean(value.signature || 'Signature Strike', 90),
    confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0.5))
  }
}

function fallbackProfile (card) {
  const seed = `${card.card_name || card.name}|${card.series}`
  const attack = hashInt(seed, 1, 48, 88), defense = hashInt(seed, 2, 45, 88), speed = hashInt(seed, 3, 45, 92), technique = hashInt(seed, 4, 45, 92)
  return validateProfile({ base_power: Math.round((attack + defense + speed + technique) * 1.75), attack, defense, speed, technique, role: 'Fighter', energy_type: 'Unknown', passive: 'Unshaken Will', signature: 'Focused Impact', confidence: 0.25 }, card)
}

async function aiProfile (card) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY missing')
  const models = [...new Set([String(process.env.GROQ_MODEL || '').trim(), ...FALLBACK_MODELS].filter(Boolean))]
  const prompt = `Rate this fictional character/form for a deterministic card combat game. Character: ${clean(card.card_name || card.name, 120)}. Series: ${clean(card.series, 120)}. Judge canonical abilities and this named form, not card rarity. Return ONLY JSON with keys base_power (100-1000), attack/defense/speed/technique (25-100), role, energy_type, passive, signature, confidence (0-1). Powerful characters may exceed higher-tier weaker characters. Passive and signature must be short original game labels, not copied dialogue.`
  let last
  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: 'system', content: 'You are a conservative fictional combat power evaluator. Output strict JSON only.' }, { role: 'user', content: prompt }], temperature: 0.15, max_tokens: 260, response_format: { type: 'json_object' } }), signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error(`Groq HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`)
      const text = String((await response.json()).choices?.[0]?.message?.content || '').replace(/^```(?:json)?|```$/gi, '').trim()
      return validateProfile(JSON.parse(text), card)
    } catch (error) { last = error }
  }
  throw last || new Error('No power-rating model available')
}

async function saveProfile (card, profile, source, raw = {}) {
  const key = profileKey(card)
  const q = await db().query(`INSERT INTO rimuru_wa_card_power_profiles(profile_key,character_name,series,base_power,attack,defense,speed,technique,role,energy_type,passive,signature,confidence,source,raw_ai,generated_at,updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,NOW(),NOW())
    ON CONFLICT(profile_key) DO UPDATE SET character_name=EXCLUDED.character_name,series=EXCLUDED.series,base_power=EXCLUDED.base_power,attack=EXCLUDED.attack,defense=EXCLUDED.defense,speed=EXCLUDED.speed,technique=EXCLUDED.technique,role=EXCLUDED.role,energy_type=EXCLUDED.energy_type,passive=EXCLUDED.passive,signature=EXCLUDED.signature,confidence=EXCLUDED.confidence,source=EXCLUDED.source,raw_ai=EXCLUDED.raw_ai,updated_at=NOW() RETURNING *`,
  [key, profile.character_name, profile.series, profile.base_power, profile.attack, profile.defense, profile.speed, profile.technique, profile.role, profile.energy_type, profile.passive, profile.signature, profile.confidence, source, JSON.stringify(raw)])
  return q.rows[0]
}

async function getProfile (card, { force = false, logger } = {}) {
  await ensureSchema()
  const key = profileKey(card)
  if (!force) {
    const old = (await db().query('SELECT * FROM rimuru_wa_card_power_profiles WHERE profile_key=$1', [key])).rows[0]
    const fallbackIsFresh = old?.source === 'deterministic_fallback' && Date.now() - new Date(old.updated_at).getTime() < 6 * 60 * 60 * 1000
    if (old && (old.source !== 'deterministic_fallback' || fallbackIsFresh)) return old
  }
  try { const p = await aiProfile(card); return await saveProfile(card, p, 'ai', p) } catch (error) {
    logger?.warn?.({ err: error, card: card.card_key }, 'AI card rating failed; persisted deterministic fallback')
    const p = fallbackProfile(card); return saveProfile(card, p, 'deterministic_fallback', { reason: error.message })
  }
}

function effectiveStats (card, profile) {
  const tier = clamp(card.tier, 1, 6), mult = TIER_MULTIPLIERS[tier]
  const core = Number(profile.base_power)
  return {
    cardKey: String(card.card_key), name: card.card_name || card.name, series: card.series || '', tier,
    role: profile.role, energyType: profile.energy_type, passive: profile.passive, signature: profile.signature,
    power: Math.round(core * mult), hp: Math.round((120 + profile.defense * 2.2 + core * 0.12) * mult),
    attack: Math.round((profile.attack * 1.7 + core * 0.16) * mult), defense: Math.round((profile.defense * 1.45 + core * 0.1) * mult),
    speed: Math.round(profile.speed * mult), technique: Math.round(profile.technique * mult), profileSource: profile.source
  }
}

async function ownedCard (userId, key) {
  await ensureSchema()
  return (await db().query('SELECT * FROM rimuru_wa_card_claims WHERE user_id=$1 AND card_key=$2', [userId, String(key).replace(/^#/, '')])).rows[0] || null
}
async function ratedCard (card, options) { return effectiveStats(card, await getProfile(card, options)) }
async function strongestOwned (userId, limit = 3, options = {}) {
  await ensureSchema()
  const rows = (await db().query('SELECT * FROM rimuru_wa_card_claims WHERE user_id=$1 ORDER BY tier DESC,claimed_at DESC', [userId])).rows
  const rated = []
  for (const card of rows) rated.push(await ratedCard(card, options))
  return rated.sort((a, b) => b.power - a.power || b.tier - a.tier).slice(0, limit)
}
async function deck (userId, limit = 3, options = {}) {
  await ensureSchema()
  const saved = (await db().query('SELECT card_keys FROM rimuru_wa_card_decks WHERE user_id=$1', [userId])).rows[0]?.card_keys || []
  const cards = []
  for (const key of saved.slice(0, limit)) { const card = await ownedCard(userId, key); if (card) cards.push(await ratedCard(card, options)) }
  if (cards.length < limit) {
    const strongest = await strongestOwned(userId, limit, options)
    for (const card of strongest) if (!cards.some(x => x.cardKey === card.cardKey) && cards.length < limit) cards.push(card)
  }
  return cards
}
async function setDeck (userId, keys) {
  await ensureSchema()
  const cleanKeys = [...new Set(keys.map(x => String(x).replace(/^#/, '')).filter(Boolean))]
  if (!cleanKeys.length || cleanKeys.length > 3) return { ok: false, message: 'Choose 1–3 unique owned card IDs.' }
  const q = await db().query('SELECT card_key FROM rimuru_wa_card_claims WHERE user_id=$1 AND card_key=ANY($2::text[])', [userId, cleanKeys])
  if (q.rowCount !== cleanKeys.length) return { ok: false, message: 'Every deck card must belong to you.' }
  await db().query(`INSERT INTO rimuru_wa_card_decks(user_id,card_keys) VALUES($1,$2::text[]) ON CONFLICT(user_id) DO UPDATE SET card_keys=EXCLUDED.card_keys,updated_at=NOW()`, [userId, cleanKeys])
  return { ok: true, keys: cleanKeys }
}

module.exports = { TIER_MULTIPLIERS, ensureSchema, profileKey, getProfile, effectiveStats, ratedCard, ownedCard, strongestOwned, deck, setDeck, saveProfile, validateProfile }
