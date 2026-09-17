'use strict'
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process')
const {database}=require('./auth-store'),{canonicalUserId}=require('./economy-router')
const FAST_MB=Math.max(1,Number(process.env.MUSIC_FAST_DAILY_MB||100))
const TOTAL_MB=Math.max(FAST_MB,Number(process.env.MUSIC_TOTAL_DAILY_MB||150))
const MAX_MINUTES=Math.max(1,Number(process.env.MUSIC_MAX_MINUTES||15))
const queue=[];let working=false,ready=false,toolsLogged=false

function db(){const d=database();if(!d)throw new Error('DATABASE_URL is required for /play');return d}
async function ensureSchema(){if(ready)return;await db().query(`CREATE TABLE IF NOT EXISTS rimuru_music_daily_usage(usage_date DATE PRIMARY KEY,accounted_bytes BIGINT NOT NULL DEFAULT 0,successful_downloads INT NOT NULL DEFAULT 0,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);ready=true}
async function usage(){await ensureSchema();const q=await db().query(`INSERT INTO rimuru_music_daily_usage(usage_date) VALUES(CURRENT_DATE) ON CONFLICT(usage_date) DO UPDATE SET updated_at=rimuru_music_daily_usage.updated_at RETURNING accounted_bytes,successful_downloads`);return{bytes:Number(q.rows[0].accounted_bytes||0),downloads:Number(q.rows[0].successful_downloads||0)}}
async function charge(bytes){await ensureSchema();await db().query(`INSERT INTO rimuru_music_daily_usage(usage_date,accounted_bytes,successful_downloads) VALUES(CURRENT_DATE,$1,1) ON CONFLICT(usage_date) DO UPDATE SET accounted_bytes=rimuru_music_daily_usage.accounted_bytes+EXCLUDED.accounted_bytes,successful_downloads=rimuru_music_daily_usage.successful_downloads+1,updated_at=NOW()`,[Math.max(0,Math.floor(bytes))])}

function resolveTools(){
 let yt=null,ff=null
 try{
  const mod=require('youtube-dl-exec')
  yt=mod?.binPath||mod?.binaryPath||null
  if(!yt){
   const candidates=[
    path.join(process.cwd(),'node_modules','youtube-dl-exec','bin','yt-dlp'),
    path.join(process.cwd(),'node_modules','youtube-dl-exec','bin','yt-dlp.exe')
   ]
   yt=candidates.find(fs.existsSync)||null
  }
 }catch{}
 try{ff=require('ffmpeg-static')}catch{}
 if(!yt||!fs.existsSync(yt))throw new Error('Music runtime missing yt-dlp binary. npm dependency youtube-dl-exec did not install correctly.')
 if(!ff||!fs.existsSync(ff))throw new Error('Music runtime missing FFmpeg binary. npm dependency ffmpeg-static did not install correctly.')
 try{fs.chmodSync(yt,0o755)}catch{}
 try{fs.chmodSync(ff,0o755)}catch{}
 return{yt,ff}
}
function run(bin,args,extraEnv={}){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,...extraEnv}});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(new Error((err||out||`${path.basename(bin)} exited ${c}`).slice(-1800))))})}
async function verifyTools(logger){
 const t=resolveTools()
 const [yv,fv]=await Promise.all([run(t.yt,['--version']),run(t.ff,['-version'])])
 if(!toolsLogged){toolsLogged=true;logger?.info({ytDlp:yv.trim().split(/\r?\n/)[0],ffmpeg:fv.trim().split(/\r?\n/)[0]},'Music tools ready')}
 return t
}
async function metadata(query,tools){const target=/^https?:\/\//i.test(query)?query:`ytsearch1:${query}`;return JSON.parse(await run(tools.yt,['--no-playlist','--dump-single-json','--skip-download',target],{PATH:`${path.dirname(tools.ff)}${path.delimiter}${process.env.PATH||''}`}))}
async function download(query,dir,tools){const target=/^https?:\/\//i.test(query)?query:`ytsearch1:${query}`,tmpl=path.join(dir,'track.%(ext)s');const args=['--no-playlist','--ffmpeg-location',tools.ff,'-x','--audio-format','mp3','--audio-quality','5','--print','after_move:filepath','-o',tmpl,target];const out=await run(tools.yt,args);const f=out.trim().split(/\r?\n/).filter(Boolean).pop();if(f&&fs.existsSync(f))return f;const x=fs.readdirSync(dir).find(v=>v.endsWith('.mp3'));if(!x)throw new Error('yt-dlp completed but no MP3 was produced');return path.join(dir,x)}
const mb=n=>(n/1048576).toFixed(1)
const clean=s=>String(s||'Rimuru Music').replace(/[\\/:*?"<>|]/g,'').slice(0,90)
async function registered(id){return!!(await db().query('SELECT 1 FROM rimuru_wa_users WHERE user_id=$1',[id])).rowCount}

function createMusic({logger}){
 const send=(s,j,m,t)=>s.sendMessage(j,{text:t},{quoted:m})
 // Verify at module use/startup without taking the bot down if music alone is broken.
 verifyTools(logger).catch(e=>logger.warn({err:e},'Music tools unavailable'))
 async function processJob(job){const{sock,m,jid,query}=job;let dir
  try{
   const tools=await verifyTools(logger)
   const u=await usage(),hard=TOTAL_MB*1048576,fast=FAST_MB*1048576
   if(u.bytes>=hard){await send(sock,jid,m,`🛑 *RIMURU MUSIC LIMIT REACHED*\n\nToday's global allowance is finished (${mb(u.bytes)} MB / ${TOTAL_MB} MB).`);return}
   if(u.bytes>=fast){await send(sock,jid,m,`🐢 *FAST MUSIC LIMIT REACHED*\n\nFast mode has used ${mb(u.bytes)} MB today. The slower GitHub fallback comes next.`);return}
   await send(sock,jid,m,`🎧 *RIMURU MUSIC*\nSearching for *${query}*…`)
   const info=await metadata(query,tools),duration=Number(info.duration||0)
   if(duration>MAX_MINUTES*60){await send(sock,jid,m,`⏱️ That result is *${Math.ceil(duration/60)} minutes*. /play currently allows *${MAX_MINUTES} minutes* max.`);return}
   dir=fs.mkdtempSync(path.join(os.tmpdir(),'rimuru-play-'))
   const file=await download(query,dir,tools),stat=fs.statSync(file),projected=stat.size*2,fresh=await usage()
   if(fresh.bytes+projected>fast){await send(sock,jid,m,`🐢 This ${mb(stat.size)} MB song would push fast mode past today's ${FAST_MB} MB allowance. The GitHub slow fallback will handle this in the next phase.`);return}
   if(fresh.bytes+projected>hard){await send(sock,jid,m,`🛑 Sending this would exceed today's ${TOTAL_MB} MB global music allowance.`);return}
   const title=clean(info.title),artist=clean(info.artist||info.uploader||'Rimuru Music')
   await sock.sendMessage(jid,{audio:{url:file},mimetype:'audio/mpeg',fileName:`${title}.mp3`,ptt:false},{quoted:m})
   await charge(projected)
   await send(sock,jid,m,`✅ *${title}*\n👤 ${artist}\n📦 ${mb(stat.size)} MB\n⚡ Daily usage charged: ${mb(projected)} MB`)
  }catch(e){logger.warn({err:e},'play download failed');const msg=String(e.message||e);await send(sock,jid,m,`❌ I couldn't download that song.\n${msg.includes('Music runtime missing')?`🔧 ${msg}`:msg.slice(0,500)}`)}
  finally{if(dir)fs.rmSync(dir,{recursive:true,force:true})}
 }
 async function pump(){if(working)return;working=true;while(queue.length)await processJob(queue.shift());working=false}
 async function handle(sock,m,content){const raw=String(content.conversation||content.extendedTextMessage?.text||'').trim(),x=raw.match(/^\/play(?:@\S+)?(?:\s+([\s\S]+))?$/i);if(!x)return false;const jid=m.key.remoteJid,id=canonicalUserId(m.key),query=String(x[1]||'').trim();if(!(await registered(id))){await send(sock,jid,m,'🌊 Use */start* first to register with Rimuru.');return true}if(!query){await send(sock,jid,m,'🎵 Use */play <song name or URL>*\nExample: */play Die With A Smile*');return true}const u=await usage();if(u.bytes>=TOTAL_MB*1048576){await send(sock,jid,m,`🛑 Today's global /play allowance is finished (${mb(u.bytes)} MB / ${TOTAL_MB} MB).`);return true}queue.push({sock,m,jid,id,query});if(queue.length>1)await send(sock,jid,m,`🎶 Added to the music queue. Position: *${queue.length}*`);pump().catch(e=>logger.error({err:e},'music queue failed'));return true}
 return{handle,ensureSchema,verifyTools:()=>verifyTools(logger)}
}
module.exports={createMusic,ensureSchema,resolveTools}
