'use strict'
const history=new Map()
const FALLBACKS=['openai/gpt-oss-20b','openai/gpt-oss-120b']
const configured=String(process.env.GROQ_MODEL||'').trim()
function modelCandidates(){return [...new Set([configured,...FALLBACKS].filter(Boolean))]}
async function availableModels(){
 if(!process.env.GROQ_API_KEY)return null
 try{const r=await fetch('https://api.groq.com/openai/v1/models',{headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`},signal:AbortSignal.timeout(10000)});if(!r.ok)return null;const j=await r.json();return new Set((j.data||[]).filter(x=>x&&x.active!==false).map(x=>x.id))}catch{return null}
}
async function call(messages){
 if(!process.env.GROQ_API_KEY)throw new Error('GROQ_API_KEY missing')
 const live=await availableModels(),candidates=modelCandidates().filter(x=>!live||live.has(x));let last=null
 for(const model of (candidates.length?candidates:modelCandidates())){
  try{
   const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages,temperature:.8,max_tokens:350}),signal:AbortSignal.timeout(20000)})
   if(!r.ok){const body=(await r.text().catch(()=>'' )).slice(0,500);throw new Error(`Groq HTTP ${r.status}${body?`: ${body}`:''}`)}
   const out=String((await r.json()).choices?.[0]?.message?.content||'').trim();if(!out)throw new Error(`empty response from ${model}`)
   if(configured&&model!==configured)console.warn(`[rimuru-wa] recovered with fallback Groq model ${model}`)
   return {out,model}
  }catch(e){last=e;console.warn(`[rimuru-wa] Groq model ${model} failed:`,e?.message||e)}
 }
 throw last||new Error('all Groq models failed')
}
function canned(mode,player,name){if(mode==='master')return `${player?.currentMaster||'Your Master'} is listening, ${name||'adventurer'}. The communication link is unstable, but your Odyssey remains intact.`;return `I'm here, ${name||'mortal'} 😅 My AI link is having a moment, but Ryuden's game systems are still online.`}
async function chat({jid,userId,name,text,mode,player}){const k=`${jid}:${userId}:${mode}`,h=history.get(k)||[],system=mode==='master'?`Roleplay as ${player.currentMaster}, Master of ${name||'Player'} in Ryuden Odyssey. Player rank ${player.rank}, level ${player.level}, bond ${player.bondPoints}, Odyssey part ${player.storyChapter+1}/15, wins ${player.winCount}, losses ${player.lossCount}. Be recognizable but do not quote copyrighted dialogue. Be concise and natural for WhatsApp. Never grant or alter XP, gold, gems, items, skills, stats, combat, guilds or story state; the game engine alone controls those.`:`You are Rimuru, conversational guardian of the WhatsApp realm Ryuden (JTF × Ryuden). Be friendly, lively, concise and natural. You know the bot has casino/economy and Ryuden Odyssey RPG. Never claim to alter coins, inventory, XP, rewards, combat, guilds or database state. Point users to commands/buttons for actual actions.`;try{const {out}=await call([{role:'system',content:system},...h,{role:'user',content:text}]);history.set(k,[...h,{role:'user',content:text},{role:'assistant',content:out}].slice(-10));return out}catch(e){console.warn('[rimuru-wa] all Groq models failed:',e?.message||e);return canned(mode,player,name)}}
module.exports={chat,model:configured||'auto (gpt-oss fallback)',modelCandidates}
