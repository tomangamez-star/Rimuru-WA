'use strict'

const CACHE_BUCKET = process.env.SUPABASE_CARD_CACHE_BUCKET || 'rimuru-wa-card-cache'

function supabaseUrl () { return String(process.env.SUPABASE_URL || '').replace(/\/$/, '') }
function supabaseKey () { return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '' }
function cacheReady () { return !!(supabaseUrl() && supabaseKey()) }
function archiveToken () { return process.env.TELEGRAM_CARD_ARCHIVE_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '' }

let bucketReady = false
async function ensureBucket () {
  if (!cacheReady() || bucketReady) return
  const key = supabaseKey()
  const r = await fetch(`${supabaseUrl()}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: CACHE_BUCKET, name: CACHE_BUCKET, public: false, file_size_limit: 25 * 1024 * 1024 })
  })
  if (!r.ok && r.status !== 409) {
    const text = await r.text().catch(() => '')
    if (!/already exists/i.test(text)) throw new Error(`Supabase card cache HTTP ${r.status}: ${text.slice(0, 160)}`)
  }
  bucketReady = true
}

function safeKey (card) {
  return String(card.card_key || card.cardKey || card.telegram_message_id || 'card').replace(/[^a-zA-Z0-9._-]+/g, '_')
}
function extensionFor (card, filePath = '') {
  const m = String(filePath).match(/\.([a-zA-Z0-9]{2,5})$/)
  if (m) return m[1].toLowerCase()
  const t = String(card.telegram_media_type || '').toLowerCase()
  return t === 'video' || t === 'animation' ? 'mp4' : t === 'document' ? 'bin' : 'jpg'
}
function contentTypeFor (ext, card) {
  const e = String(ext).toLowerCase()
  if (e === 'jpg' || e === 'jpeg') return 'image/jpeg'
  if (e === 'png') return 'image/png'
  if (e === 'webp') return 'image/webp'
  if (e === 'gif') return 'image/gif'
  if (e === 'mp4') return 'video/mp4'
  if (e === 'webm') return 'video/webm'
  return String(card.telegram_media_type).toLowerCase() === 'video' ? 'video/mp4' : 'application/octet-stream'
}
async function cacheDownload (path) {
  if (!cacheReady() || !path) return null
  const key = supabaseKey()
  const r = await fetch(`${supabaseUrl()}/storage/v1/object/authenticated/${CACHE_BUCKET}/${path}`, { headers: { Authorization: `Bearer ${key}`, apikey: key } })
  if (r.status === 404 || r.status === 400) return null
  if (!r.ok) throw new Error(`Supabase cache download HTTP ${r.status}`)
  return Buffer.from(await r.arrayBuffer())
}
async function cacheUpload (path, buffer, contentType) {
  if (!cacheReady()) return false
  await ensureBucket()
  const key = supabaseKey()
  const r = await fetch(`${supabaseUrl()}/storage/v1/object/${CACHE_BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buffer
  })
  if (!r.ok) throw new Error(`Supabase cache upload HTTP ${r.status}: ${(await r.text().catch(() => '')).slice(0, 120)}`)
  return true
}
async function telegramDownload (card) {
  const token = archiveToken()
  if (!token) throw new Error('TELEGRAM_CARD_ARCHIVE_BOT_TOKEN is not configured')
  if (!card.telegram_file_id) throw new Error('Archive card has no Telegram file_id')
  const r = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_id: card.telegram_file_id })
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok || !data.ok || !data.result?.file_path) {
    const desc = String(data.description || '')
    throw new Error(`Telegram archive getFile failed${desc ? `: ${desc}` : ''}. If these file_ids were created by OG Rimuru, set TELEGRAM_CARD_ARCHIVE_BOT_TOKEN to OG Rimuru's bot token; Telegram file_ids are bot-specific.`)
  }
  const filePath = data.result.file_path
  const f = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)
  if (!f.ok) throw new Error(`Telegram archive download HTTP ${f.status}`)
  return { buffer: Buffer.from(await f.arrayBuffer()), filePath }
}
async function sourceFallback (card) {
  const url = String(card.media_url || '')
  if (!/^https?:\/\//i.test(url)) return null
  const r = await fetch(url, { signal: AbortSignal.timeout(20000) })
  if (!r.ok) return null
  return { buffer: Buffer.from(await r.arrayBuffer()), filePath: new URL(url).pathname }
}
async function getMedia (card) {
  const base = `archive/${safeKey(card)}`
  for (const ext of ['jpg', 'png', 'webp', 'gif', 'mp4', 'webm', 'bin']) {
    const path = `${base}.${ext}`
    const hit = await cacheDownload(path).catch(() => null)
    if (hit) return { buffer: hit, path, contentType: contentTypeFor(ext, card), cached: true }
  }
  let got
  try { got = await telegramDownload(card) } catch (e) {
    got = await sourceFallback(card)
    if (!got) throw e
  }
  const ext = extensionFor(card, got.filePath)
  const path = `${base}.${ext}`
  const contentType = contentTypeFor(ext, card)
  await cacheUpload(path, got.buffer, contentType).catch(() => false)
  return { buffer: got.buffer, path, contentType, cached: false }
}
async function sendCardMedia (sock, jid, card, caption, quoted) {
  const media = await getMedia(card)
  const type = String(card.telegram_media_type || card.media_type || 'photo').toLowerCase()
  if (type === 'video') return sock.sendMessage(jid, { video: media.buffer, mimetype: media.contentType, caption }, { quoted })
  if (type === 'animation') return sock.sendMessage(jid, { video: media.buffer, mimetype: media.contentType || 'video/mp4', gifPlayback: true, caption }, { quoted })
  if (type === 'document') return sock.sendMessage(jid, { document: media.buffer, mimetype: media.contentType, fileName: `card-${card.card_key || 'archive'}`, caption }, { quoted })
  return sock.sendMessage(jid, { image: media.buffer, caption }, { quoted })
}

module.exports = { getMedia, sendCardMedia, cacheReady, CACHE_BUCKET }
