'use strict'
const fs=require('fs'),os=require('os'),path=require('path'),https=require('https'),{spawn}=require('child_process')
const {database}=require('./auth-store'),{canonicalUserId}=require('./economy-router')
const FAST_MB=Math.max(1,Number(process.env.MUSIC_FAST_DAILY_MB||100))
const TOTAL_MB=Math.max(FAST_MB,Number(process.env.MUSIC_TOTAL_DAILY_MB||150))
const MAX_MINUTES=Math.max(1,Number(process.env.MUSIC_MAX_MINUTES||15))
const YTDLP_URL='https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp'
const YTDLP=path.join(os.tmpdir(),'rimuru-tools','yt-dlp')
const queue=[];let working=false,ready=false,toolPromise=null

function db(){const d=database();if(!d)throw new Error('DATABASE_URL is required for /play');return d}
async function ensureSchema(){if(ready)return;await db().query(`CREATE TABLE IF NOT EXISTS rimuru_music_daily_usage(usage_date DATE PRIMARY KEY,accounted_bytes BIGINT NOT NULL DEFAULT 0,successful_downloads INT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);ready=true}
async function usage(){await ensureSchema();const q=await db().query(`INSERT INTO rimuru_music_daily_usage(usage_date) VALUES(CURRENT_DATE) ON CONFLICT(usage_date) DO UPDATE SET updated_at=rimuru_music_daily_usage.updated_at RETURNING accounted_bytes,successful_downloads`);return{bytes:Number(q.rows[0].accounted_bytes||0),downloads:Number(q.rows[0].successful_downloads||0)}}
async function charge(bytes){await ensureSchema();await db().query(`INSERT INTO rimuru_music_daily_usage(usage_date,accounted_bytes,successful_downloads) VALUES(CURRENT_DATE,$1,1) ON CONFLICT(usage_date) DO UPDATE SET accounted_bytes=rimuru_music_daily_usage.accounted_bytes+EXCLUDED.accounted_bytes,successful_downloads=rimuru_music_daily_usage.successful_downloads+1,updated_at=NOW()`,[Math.max(0,Math.floor(bytes))])}

function run(bin,args){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(new Error((err||out||`${bin} exited ${c}`).slice(-1800))))})}
function fetchTo(url,dest,redirects=0){return new Promise((resolve,reject)=>{
 if(redirects>8)return reject(new Error('Too many redirects while fetching yt-dlp'))
 https.get(url,{headers:{'User-Agent':'Rimuru-WA/1.0'}},res=>{
  if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();return resolve(fetchTo(new URL(res.headers.location,url).toString(),dest,redirects+1))}
  if(res.statusCode!==200){res.resume();return reject(new Error(`yt-dlp download HTTP ${res.statusCode}`))}
  fs.mkdirSync(path.dirname(dest),{recursive:true});const tmp=dest+'.part',f=fs.createWriteStream(tmp)
  res.pipe(f);f.on('finish',()=>f.close(()=>{try{fs.renameSync(tmp,dest);fs.chmodSync(dest,0o755);resolve(dest)}catch(e){reject(e)}}))
  f.on('error',e=>{try{fs.rmSync(tmp,{force:true})}catch{};reject(e)})
 }).on('error',reject)
})}
async function ensureYtDlp(logger){
 if(toolPromise)return toolPromise
 toolPromise=(async()=>{
  if(!fs.existsSync(YTDLP)){logger?.info('Music: fetching yt-dlp runtime');await fetchTo(YTDLP_URL,YTDLP)}
  try{fs.chmodSync(YTDLP,0o755)}catch{}
  let version
  try{version=(await run(YTDLP,['--version'])).trim()}catch(e){
   try{fs.rmSync(YTDLP,{force:true})}catch{}
   await fetchTo(YTDLP_URL,YTDLP);version=(await run(YTDLP,['--version'])).trim()
  }
  logger?.info({ytDlp:version},'Music tools ready')
  return YTDLP
 })().catch(e=>{toolPromise=null;throw e})
 return toolPromise
}
async function metadata(query,bin){const target=/^https?:\/\//i.test(query)?query:`ytsearch1:${query}`;return JSON.parse(await run(bin,['--no-playlist','--dump-single-json','--skip-download',target]))}
async function download(query,dir,bin){
 const target=/^https?:\/\//i.test(query)?query:`ytsearch1:${query}`,tmpl=path.join(dir,'track.%(ext)s')
 // No FFmpeg dependency: prefer a WhatsApp-friendly single-file audio stream.
 const out=await run(bin,['--no-playlist','-f','bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio[ext=webm]/bestaudio','--print','after_move:filepath','-o',tmpl,target])
 const f=out.trim().split(/\r?\n/).filter(Boolean).pop()
 if(f&&fs.existsSync(f))return f
 const files=fs.readdirSync(dir).filter(v=>v.startsWith('track.'))
 if(!files.length)throw new Error('yt-dlp completed but no audio file was produced')
 return path.join(dir,files[0])
}
const mb=n=>(n/1048576).toFixed(1)
const clean=s=>String(s||'Rimuru Music').replace(/[\\/:*?"<>|]/g,'').slice(0,90)
const mimeFor=f=>{const e=path.extname(f).toLowerCase();if(e==='.m4a'||e==='.mp4')return'audio/mp4';if(e==='.webm')return'audio/webm';if(e==='.ogg'||e==='.opus')return'audio/ogg';return'audio/mpeg'}
async function registered(id){return!!(await db().query('SELECT 1 FROM rimuru_wa_users WHERE user_id=$1',[id])).rowCount}

function createMusic({logger}){
 const send=(s,j,m,t)=>s.sendMessage(j,{text:t},{quoted:m})
 // Warm the downloader after startup, but never crash the bot if GitHub is temporarily unavailable.
 setTimeout(()=>ensureYtDlp(logger).catch(e=>logger.warn({err:e},'Music runtime warmup failed')),2500).unref?.()
 async function processJob(job){const{sock,m,jid,query}=job;let dir
  try{
   const bin=await ensureYtDlp(logger)
   const u=await usage(),hard=TOTAL_MB*1048576,fast=FAST_MB*1048576
   if(u.bytes>=hard){await send(sock,jid,m,`🛑 *RIMURU MUSIC LIMIT REACHED*\n\nToday's global allowance is finished (${mb(u.bytes)} MB / ${TOTAL_MB} MB).`);return}
   if(u.bytes>=fast){await send(sock,jid,m,`🐢 *FAST MUSIC LIMIT REACHED*\n\nFast mode has used ${mb(u.bytes)} MB today. The slower GitHub fallback comes next.`);return}
   await send(sock,jid,m,`🎧 *RIMURU MUSIC*\nSearching for *${query}*…`)
   const info=await metadata(query,bin),duration=Number(info.duration||0)
   if(duration>MAX_MINUTES*60){await send(sock,jid,m,`⏱️ That result is *${Math.ceil(duration/60)} minutes*. /play currently allows *${MAX_MINUTES} minutes* max.`);return}
   dir=fs.mkdtempSync(path.join(os.tmpdir(),'rimuru-play-'))
   const file=await download(query,dir,bin),stat=fs.statSync(file),projected=stat.size*2,fresh=await usage()
   if(fresh.bytes+projected>fast){await send(sock,jid,m,`🐢 This ${mb(stat.size)} MB song would push fast mode past today's ${FAST_MB} MB allowance.`);return}
   if(fresh.bytes+projected>hard){await send(sock,jid,m,`🛑 Sending this would exceed today's ${TOTAL_MB} MB global music allowance.`);return}
   const title=clean(info.title),artist=clean(info.artist||info.uploader||'Rimuru Music'),ext=path.extname(file)||'.audio'
   await sock.sendMessage(jid,{audio:{url:file},mimetype:mimeFor(file),fileName:`${title}${ext}`,ptt:false},{quoted:m})
   await charge(projected)
   await send(sock,jid,m,`✅ *${title}*\n👤 ${artist}\n📦 ${mb(stat.size)} MB\n⚡ Daily usage charged: ${mb(projected)} MB`)
  }catch(e){logger.warn({err:e},'play download failed');await send(sock,jid,m,`❌ I couldn't download that song.\n${String(e.message||e).slice(0,600)}`)}
  finally{if(dir)fs.rmSync(dir,{recursive:true,force:true})}
 }
 async function pump(){if(working)return;working=true;while(queue.length)await processJob(queue.shift());working=false}
 async function handle(sock,m,content){const raw=String(content.conversation||content.extendedTextMessage?.text||'').trim(),x=raw.match(/^\/play(?:@\S+)?(?:\s+([\s\S]+))?$/i);if(!x)return false;const jid=m.key.remoteJid,id=canonicalUserId(m.key),query=String(x[1]||'').trim();if(!(await registered(id))){await send(sock,jid,m,'🌊 Use */start* first to register with Rimuru.');return true}if(!query){await send(sock,jid,m,'🎵 Use */play <song name or URL>*\nExample: */play Die With A Smile*');return true}const u=await usage();if(u.bytes>=TOTAL_MB*1048576){await send(sock,jid,m,`🛑 Today's global /play allowance is finished (${mb(u.bytes)} MB / ${TOTAL_MB} MB).`);return true}queue.push({sock,m,jid,id,query});if(queue.length>1)await send(sock,jid,m,`🎶 Added to the music queue. Position: *${queue.length}*`);pump().catch(e=>logger.error({err:e},'music queue failed'));return true}
 return{handle,ensureSchema,ensureYtDlp:()=>ensureYtDlp(logger)}
}
module.exports={createMusic,ensureSchema}
