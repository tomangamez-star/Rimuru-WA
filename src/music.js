'use strict'
const fs=require('fs'),os=require('os'),path=require('path')
const {database}=require('./auth-store'),{canonicalUserId}=require('./economy-router')
const TUBEGRAB=String(process.env.TUBEGRAB_URL||'https://tubegrab-87t1.onrender.com').replace(/\/$/,'')
const TOTAL_MB=Math.max(1,Number(process.env.MUSIC_TOTAL_DAILY_MB||150))
const FAST_MB=Math.min(TOTAL_MB,Math.max(1,Number(process.env.MUSIC_FAST_DAILY_MB||100)))
const MAX_MINUTES=Math.max(1,Number(process.env.MUSIC_MAX_MINUTES||15))
const POLL_MS=Math.max(1500,Number(process.env.MUSIC_WORKER_POLL_MS||3000))
const POLL_TIMEOUT_MS=Math.max(60000,Number(process.env.MUSIC_WORKER_TIMEOUT_MS||30*60*1000))
const queue=[];let working=false,ready=false
function db(){const d=database();if(!d)throw Error('DATABASE_URL is required for /play');return d}
async function ensureSchema(){if(ready)return;await db().query(`CREATE TABLE IF NOT EXISTS rimuru_music_daily_usage(usage_date DATE PRIMARY KEY,accounted_bytes BIGINT NOT NULL DEFAULT 0,successful_downloads INT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);ready=true}
async function usage(){await ensureSchema();const q=await db().query(`INSERT INTO rimuru_music_daily_usage(usage_date) VALUES(CURRENT_DATE) ON CONFLICT(usage_date) DO UPDATE SET updated_at=rimuru_music_daily_usage.updated_at RETURNING accounted_bytes,successful_downloads`);return{bytes:Number(q.rows[0].accounted_bytes||0)}}
async function charge(bytes){await ensureSchema();await db().query(`INSERT INTO rimuru_music_daily_usage(usage_date,accounted_bytes,successful_downloads) VALUES(CURRENT_DATE,$1,1) ON CONFLICT(usage_date) DO UPDATE SET accounted_bytes=rimuru_music_daily_usage.accounted_bytes+EXCLUDED.accounted_bytes,successful_downloads=rimuru_music_daily_usage.successful_downloads+1,updated_at=NOW()`,[Math.max(0,Math.floor(bytes))])}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),mb=n=>(n/1048576).toFixed(1)
const clean=s=>String(s||'Rimuru Music').replace(/[\\/:*?"<>|]/g,'').slice(0,90)
const duration=n=>{n=Math.max(0,Math.floor(Number(n)||0));return`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
async function json(url,opts={}){const r=await fetch(url,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}}),text=await r.text();let data;try{data=text?JSON.parse(text):null}catch{data={error:text}}if(!r.ok)throw Error(data?.error||`Music service HTTP ${r.status}`);return data}
async function resolveSong(query){if(/^https?:\/\//i.test(query))return{url:query,title:query};const data=await json(`${TUBEGRAB}/api/search`,{method:'POST',body:JSON.stringify({q:query})}),x=data?.results?.[0];if(!x?.url)throw Error('No matching song was found.');return x}
async function dispatch(url){return json(`${TUBEGRAB}/api/download`,{method:'POST',body:JSON.stringify({url,type:'audio',quality:'360'})})}
async function waitJob(id){const start=Date.now();while(Date.now()-start<POLL_TIMEOUT_MS){const j=await json(`${TUBEGRAB}/api/jobs/${encodeURIComponent(id)}`);if(j.status==='complete'&&j.ready)return j;if(j.status==='failed')throw Error(j.error||'Audio processing failed.');await sleep(POLL_MS)}throw Error('Audio processing timed out.')}
async function downloadFile(id,dir){const r=await fetch(`${TUBEGRAB}/api/jobs/${encodeURIComponent(id)}/file`,{redirect:'follow'});if(!r.ok)throw Error(`Audio file HTTP ${r.status}`);const ct=String(r.headers.get('content-type')||'audio/mpeg'),ext=ct.includes('mp4')?'m4a':ct.includes('webm')?'webm':ct.includes('ogg')?'ogg':'mp3',file=path.join(dir,`track.${ext}`),buf=Buffer.from(await r.arrayBuffer());fs.writeFileSync(file,buf);return{file,size:buf.length,mime:ct.split(';')[0]||'audio/mpeg'}}
async function registered(id){return!!(await db().query('SELECT 1 FROM rimuru_wa_users WHERE user_id=$1',[id])).rowCount}
function createMusic({logger}){
 const send=(s,j,m,t)=>s.sendMessage(j,{text:t},{quoted:m})
 async function resultCard(sock,jid,m,song){
  const title=clean(song.title||'Unknown title'),creator=clean(song.uploader||song.channel||song.artist||'Unknown creator'),len=duration(song.duration)
  const caption=`🎵 *${title}*\n👤 ${creator}${Number(song.duration)>0?`\n⏱️ ${len}`:''}\n\n⏳ *Processing audio…*`
  const thumb=song.thumbnail||song.thumbnails?.at?.(-1)?.url||song.thumbnails?.[0]?.url
  if(thumb){try{await sock.sendMessage(jid,{image:{url:thumb},caption},{quoted:m});return}catch(e){logger.warn({err:e},'music thumbnail send failed')}}
  await send(sock,jid,m,caption)
 }
 async function processJob(job){const{sock,m,jid,query}=job;let dir
  try{
   const before=await usage(),hard=TOTAL_MB*1048576
   if(before.bytes>=hard){await send(sock,jid,m,`🛑 *LILY MUSIC LIMIT REACHED*\n\nToday's allowance is finished (${mb(before.bytes)} MB / ${TOTAL_MB} MB).`);return}
   await send(sock,jid,m,`🎧 *LILY MUSIC*\n🔎 Searching for *${query}*…${before.bytes>=FAST_MB*1048576?`\n🐢 Conservation range active: ${FAST_MB}–${TOTAL_MB} MB.`:''}`)
   const song=await resolveSong(query)
   if(Number(song.duration||0)>MAX_MINUTES*60){await send(sock,jid,m,`⏱️ That result is longer than the *${MAX_MINUTES} minute* /play limit.`);return}
   await resultCard(sock,jid,m,song)
   const started=await dispatch(song.url);if(!started?.id)throw Error('Audio worker did not return a job ID.')
   const done=await waitJob(started.id)
   dir=fs.mkdtempSync(path.join(os.tmpdir(),'rimuru-music-'))
   const media=await downloadFile(done.id,dir),fresh=await usage(),projected=media.size
   if(fresh.bytes+projected>hard){await send(sock,jid,m,`🛑 The ${mb(media.size)} MB file would exceed today's ${TOTAL_MB} MB allowance.`);return}
   const title=clean(done.title||song.title||'Lily Music')
   await sock.sendMessage(jid,{audio:{url:media.file},mimetype:media.mime,fileName:`${title}${path.extname(media.file)}`,ptt:false},{quoted:m})
   await charge(projected)
  }catch(e){logger.warn({err:e},'Lily /play failed');await send(sock,jid,m,`❌ I couldn't download that song.\n${String(e.message||e).slice(0,500)}`)}
  finally{if(dir)fs.rmSync(dir,{recursive:true,force:true})}
 }
 async function pump(){if(working)return;working=true;try{while(queue.length)await processJob(queue.shift())}finally{working=false}}
 async function handle(sock,m,content){const raw=String(content.conversation||content.extendedTextMessage?.text||'').trim(),x=raw.match(/^\/play(?:@\S+)?(?:\s+([\s\S]+))?$/i);if(!x)return false;const jid=m.key.remoteJid,id=canonicalUserId(m.key),query=String(x[1]||'').trim();if(!(await registered(id))){await send(sock,jid,m,'🌊 Use */start* first to register with Rimuru.');return true}if(!query){await send(sock,jid,m,'🎵 Use */play <song name or YouTube URL>*');return true}queue.push({sock,m,jid,id,query});if(queue.length>1)await send(sock,jid,m,`🎶 Added to queue. Position: *${queue.length}*`);pump().catch(e=>logger.error({err:e},'music queue failed'));return true}
 return{handle,ensureSchema}
}
module.exports={createMusic,ensureSchema}
