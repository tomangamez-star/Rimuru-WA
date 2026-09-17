'use strict'
const casinoPolish=require('./casino-polish'),balanceUp=require('./rpg-balance-upgrade'),zones=require('./zone-router'),baseUi=require('./ui'),{createRpg}=require('./rpg'),{createRpgUpgrade}=require('./rpg-upgrade'),{createCards}=require('./cards'),{createMusic}=require('./music'),{canonicalUserId,displayName,commandParts}=require('./economy-router'),ai=require('./ai-v2')
const META=/\b(ai|model|groq|whatsapp|bot|command|menu|button|quest ?log|bug|glitch|database|supabase|render|code|coding|server|deploy|redeploy|cooldown|how (?:do|can) i (?:use|end|stop)|not working|doesn't work|isn't working)\b/i
balanceUp.install()
function createUi(opts){casinoPolish.install(opts.casino);const base=baseUi.createUi(opts),rpg=createRpg({economy:opts.economy,logger:opts.logger,sendButtons:opts.sendButtons}),up=createRpgUpgrade({base:rpg,economy:opts.economy,sendButtons:opts.sendButtons}),cards=createCards({logger:opts.logger}),music=createMusic({logger:opts.logger}),masters=new Set(),send=(s,j,m,t)=>s.sendMessage(j,{text:t},{quoted:m}),P=m=>({id:canonicalUserId(m.key),name:displayName(m),jid:m.key.remoteJid})
 async function route(s,m,content){const c=commandParts(content);
 if(c&&['/slots','/cf','/coinflip','/dice','/roulette'].includes(c.command)){
  if(await zones.guard(s,m,c.command))return true
  const p=P(m);let r=null
  if(c.command==='/slots')r=await opts.casino.slots(p.id,p.name,c.args[0])
  if(['/cf','/coinflip'].includes(c.command))r=await opts.casino.coinflip(p.id,p.name,c.args[0],c.args[1])
  if(c.command==='/dice')r=await opts.casino.dice(p.id,p.name,c.args[0],c.args[1])
  if(c.command==='/roulette')r=await opts.casino.roulette(p.id,p.name,c.args)
  if(!r?.ok){await send(s,p.jid,m,r?.message||'Casino command failed.');return true}
  const payout=Number(r.payout||0),bet=Number(r.bet||0),net=payout-bet,outcome=net>0?'🎉 *WIN*':net<0?'❌ *LOSS*':'➖ *PUSH*'
  const face=r.reels?r.reels.join(' | '):r.flip||r.rolled||r.number||''
  await send(s,p.jid,m,`🎰 *CASINO RESULT*\n\n${face}\n\n${outcome}\n${net>=0?'💚 Gained':'🔻 Lost'}: *${opts.economy.fmt(Math.abs(net))}*\n💵 Bet: ${opts.economy.fmt(bet)}\n${payout?`💰 Payout: ${opts.economy.fmt(payout)}\n`:''}👛 Wallet: *${opts.economy.fmt(r.user.wallet)}*`)
  return true
 }if(c&&await zones.handle(s,m,c,P(m).id))return true;if(c&&await balanceUp.admin(s,m,c))return true;if(c&&await zones.guard(s,m,c.command))return true;if(await cards.handle(s,m,content))return true;if(await music.handle(s,m,content))return true;if(c){if(await up.route(s,m,c))return true;if(c.command==='/talk'){const r=await base.route(s,m,content);masters.add(P(m).id);return r}if(c.command==='/endtalk'){masters.delete(P(m).id);return base.route(s,m,content)}}return base.route(s,m,content)}
 async function section(s,m,x){if(await up.section(s,m,x))return true;const r=await base.section(s,m,x);if(x==='rpg_talk_master')masters.add(P(m).id);return r}
 async function maybeAi(s,m,content){const p=P(m),text=String(content.conversation||content.extendedTextMessage?.text||'').trim();if(!text||text.startsWith('/')||text.startsWith('!claim')||m.key.fromMe)return false;const npc=await rpg.npcContext(p.id),master=masters.has(p.id);if(!npc&&!master)return base.maybeAi?.(s,m,content)||false;const player=master?await rpg.getPlayer(p.id):null,meta=META.test(text);const mode=meta?'rimuru':master?'master':'npc';const a=await ai.chat({jid:p.jid,userId:p.id,name:p.name,text,mode,player,npc:mode==='npc'?npc:null});if(master&&!meta)await rpg.recordMasterChat(p.id);await send(s,p.jid,m,mode==='npc'?`*${npc.name}:* ${a}`:mode==='master'?`*${player.currentMaster}:* ${a}`:`🌊 *Rimuru:* ${a}`);return true}
 return{...base,route,section,maybeAi}}
module.exports={createUi}
