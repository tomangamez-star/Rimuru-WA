'use strict'
const store=require('./rpg-store')
const {canonicalUserId,displayName}=require('./economy-router')
const ENEMIES=[
 {name:'Wandering Wraith',hp:60,atk:10,def:4,xp:30,gold:15,gems:0},
 {name:'Corrupted Golem',hp:90,atk:14,def:10,xp:45,gold:25,gems:0},
 {name:'Void Stalker',hp:75,atk:18,def:6,xp:50,gold:30,gems:1},
 {name:'Rift Hound',hp:55,atk:12,def:5,xp:25,gold:12,gems:0}
]
const BOSSES=[{name:'The Hollow Sovereign',hp:260,atk:26,def:14,xp:220,gold:150,gems:8},{name:'Chronophage, Eater of Time',hp:300,atk:24,def:18,xp:260,gold:180,gems:10}]
const STORY=["You find a torn page of a forgotten Odyssey. It hints at a monarch who once refused the System's judgment.","The sky fractures for a moment, revealing a world that never chose a Master.","You hear whispers in a language your Master refuses to translate."]
const RARITIES=['Common','Common','Common','Uncommon','Uncommon','Rare','Epic','Legendary','Mythic','Ascended']
const MASTER_KEYS=new Set(store.MASTERS.map(x=>x.key))
function item(){const kinds=['weapon','armor','accessory'],names=['Fractured Blade','System Dagger','Void-Touched Spear','Shadow-Woven Cloak','Rift Compass','System Core Fragment'];return{name:names[Math.floor(Math.random()*names.length)],rarity:RARITIES[Math.floor(Math.random()*RARITIES.length)],kind:kinds[Math.floor(Math.random()*kinds.length)]}}
function createRpg({economy,logger,sendButtons}){
 const send=(s,j,m,t)=>s.sendMessage(j,{text:t},{quoted:m})
 const buttons=(s,j,body,footer,defs)=>sendButtons?sendButtons(s,j,body,footer,defs):send(s,j,null,body)
 async function panel(sock,m){
  const id=canonicalUserId(m.key),name=displayName(m),jid=m.key.remoteJid,p=await store.ensurePlayer(id,name),g=await store.guildForPlayer(id)
  const body=[
   '⚔️ *RYUDEN ODYSSEY*','',
   `> 👤 *${p.username||name||'Player'}*`,
   `🎖️ *${p.rank} • Lv. ${p.level}*   ✨ ${p.xp}/${store.xpNeed(p.level)} XP`,
   `💥 Power *${p.powerScore}*`,'',
   `❤️ ${p.hp}   ⚔️ ${p.atk}   🛡️ ${p.def}   💨 ${p.spd}`,
   `🍀 ${p.luck}   🎯 ${p.crit}%`,'',
   `🧙 ${p.currentMaster||'No Master'}   🏰 ${g?.name||'No Guild'}`,
   `🪙 ${economy.fmt(p.gold)} Gold   💎 ${p.gems} Gems`,
   `📖 Odyssey • Part ${p.storyChapter+1}/15`
  ].join('\n')
  return buttons(sock,jid,body,'RYUDEN • ODYSSEY',[
   ['🗺️ Explore','rpg_explore'],['🧙 Master','rpg_master'],['🎒 Inventory','rpg_inventory'],
   ['🏰 Guild','rpg_guild'],['📖 Odyssey','rpg_story'],['🎁 Daily','rpg_daily'],['⬅️ Menu','menu_main']
  ])
 }
 async function masterPanel(sock,m){
  const id=canonicalUserId(m.key),jid=m.key.remoteJid,p=await store.ensurePlayer(id,displayName(m))
  if(p.currentMaster)return buttons(sock,jid,`🧙 *YOUR MASTER*\n\n> *${p.currentMaster}*\nBond: *${p.bondPoints}*\n\nYour Master will eventually be available for contextual conversations and story reactions.`,`RYUDEN • MASTER`,[['💬 Talk to Master','rpg_talk_master'],['⚔️ RPG Home','rpg_home']])
  const defs=store.MASTERS.map(x=>[`${x.name}`,`rpg_master_${x.key}`])
  return buttons(sock,jid,'🧙 *CHOOSE YOUR MASTER*\n\nYour Master shapes your Odyssey universe, abilities and story.\n\nThis choice cannot be changed until you complete an Odyssey.','RYUDEN • DESTINY',defs)
 }
 async function inventoryPanel(sock,m){const p=await store.ensurePlayer(canonicalUserId(m.key),displayName(m)),x=p.inventory.length?p.inventory.map((v,i)=>`${i+1}. *${v.rarity}* ${v.name}\n   └ ${v.kind}`).join('\n'):'> Your inventory is empty.';return buttons(sock,m.key.remoteJid,`🎒 *RPG INVENTORY*\n\n${x}`,'RYUDEN • INVENTORY',[['🗺️ Explore','rpg_explore'],['⚔️ RPG Home','rpg_home']])}
 async function storyPanel(sock,m){const p=await store.ensurePlayer(canonicalUserId(m.key),displayName(m));return buttons(sock,m.key.remoteJid,`📖 *YOUR ODYSSEY*\n\n🧙 Master: *${p.currentMaster||'Not chosen'}*\n📍 Current Part: *${p.storyChapter+1}/15*\n🎖️ Rank: *${p.rank}*\n\nYour choices, battles and encounters will form your personal Odyssey log.\n\n> AI narration will be layered onto recorded game events later — it will narrate, never control rewards or outcomes.`,'RYUDEN • STORY',[['🗺️ Explore','rpg_explore'],['⚔️ RPG Home','rpg_home']])}
 async function guildPanel(sock,m){const id=canonicalUserId(m.key),jid=m.key.remoteJid,g=jid.endsWith('@g.us')?await store.guildForGroup(jid):await store.guildForPlayer(id);return buttons(sock,jid,g?`🏰 *${g.name}*\n\nLevel: *${g.level}*\nXP: *${economy.fmt(g.xp)}*\nTreasury: *${economy.fmt(g.treasury)}*\nMembers: *${g.member_count}*`:'🏰 *GUILDS*\n\nNo guild found.\n\nOnly WhatsApp group admins can propose a guild with */guild create [name]*. Other group admins vote with */guild accept*.','RYUDEN • GUILDS',g?[['⚔️ RPG Home','rpg_home']]:[['⚔️ RPG Home','rpg_home']])}
 async function isAdmin(sock,jid,userId){if(!jid.endsWith('@g.us'))return false;const meta=await sock.groupMetadata(jid),p=meta.participants.find(x=>[x.id,x.phoneNumber,x.lid].filter(Boolean).some(v=>String(v).split(':')[0].split('@')[0]===userId));return !!p?.admin}
 async function adminIds(sock,jid){const meta=await sock.groupMetadata(jid);return meta.participants.filter(p=>p.admin).map(p=>String(p.id||p.phoneNumber||p.lid||'').split(':')[0].split('@')[0])}
 async function explore(sock,m){
  const id=canonicalUserId(m.key),name=displayName(m),jid=m.key.remoteJid,p=await store.ensurePlayer(id,name)
  if(!p.currentMaster){await masterPanel(sock,m);return true}
  const roll=Math.random()
  if(roll<.22){const gold=20+Math.floor(Math.random()*61),it=Math.random()<.35?item():null,n=await store.addProgress(id,{xp:20,gold,item:it});await buttons(sock,jid,`🗺️ *SYSTEM CACHE*\n\nA sealed cache pulses beneath the ruins.\n\n✨ +20 XP\n🪙 +${gold} Gold${it?`\n🎒 *${it.rarity} ${it.name}*`:''}\n\n🎖️ ${n.rank} • Lv.${n.level}`,'RYUDEN • EXPLORE',[['🗺️ Explore Again','rpg_explore'],['🎒 Inventory','rpg_inventory'],['⚔️ RPG Home','rpg_home']]);return true}
  if(roll<.42){await buttons(sock,jid,`📖 *ODYSSEY ECHO*\n\n${STORY[Math.floor(Math.random()*STORY.length)]}`,'RYUDEN • UNKNOWN RECORD',[['➡️ Continue','rpg_explore'],['📖 Odyssey','rpg_story'],['⚔️ RPG Home','rpg_home']]);return true}
  const boss=roll>.92,e=(boss?BOSSES:ENEMIES)[Math.floor(Math.random()*(boss?BOSSES:ENEMIES).length)],playerHit=Math.max(1,p.atk+Math.floor(Math.random()*12)-e.def),enemyHit=Math.max(1,e.atk+Math.floor(Math.random()*8)-p.def),turns=Math.ceil(e.hp/playerHit),damage=enemyHit*Math.max(0,turns-1),won=damage<p.hp
  if(won){const drop=Math.random()<(boss?.7:.18)?item():null,n=await store.addProgress(id,{xp:e.xp,gold:e.gold,gems:e.gems,item:drop,win:1});await buttons(sock,jid,`${boss?'👑 *BOSS DEFEATED*':'⚔️ *VICTORY*'}\n\n> *${e.name}*\n\n❤️ Damage taken: ${damage}\n✨ +${e.xp} XP\n🪙 +${e.gold} Gold${e.gems?`\n💎 +${e.gems} Gems`:''}${drop?`\n🎒 *${drop.rarity} ${drop.name}*`:''}\n\n🎖️ ${n.rank} • Lv.${n.level}`,'RYUDEN • BATTLE',[['🗺️ Continue','rpg_explore'],['🎒 Inventory','rpg_inventory'],['⚔️ RPG Home','rpg_home']])}
  else{const loss=Math.max(1,Math.floor(p.gold*.1));await store.addProgress(id,{gold:-loss,loss:1});await buttons(sock,jid,`💀 *DEFEAT*\n\n> *${e.name}*\n\nThe System drags you back to Ryuden.\n🪙 Lost *${loss}* RPG Gold.`,'RYUDEN • DEFEAT',[['🗺️ Try Again','rpg_explore'],['⚔️ RPG Home','rpg_home']])}
  return true
 }
 async function daily(sock,m){const r=await store.daily(canonicalUserId(m.key));if(!r.ok){await buttons(sock,m.key.remoteJid,`⏳ *DAILY ALREADY CLAIMED*\n\nReturn in about *${Math.ceil(r.remaining/3600000)}h*.`,'RYUDEN • DAILY',[['⚔️ RPG Home','rpg_home']]);return true}await buttons(sock,m.key.remoteJid,`🎁 *DAILY REWARD*\n\n🪙 +${r.gold} RPG Gold${r.gems?`\n💎 +${r.gems} Gem`:''}`,'RYUDEN • DAILY',[['🗺️ Explore','rpg_explore'],['⚔️ RPG Home','rpg_home']]);return true}
 async function section(sock,m,id){
  if(id==='rpg_home')return panel(sock,m)
  if(id==='rpg_explore')return explore(sock,m)
  if(id==='rpg_master')return masterPanel(sock,m)
  if(id==='rpg_inventory')return inventoryPanel(sock,m)
  if(id==='rpg_guild')return guildPanel(sock,m)
  if(id==='rpg_story')return storyPanel(sock,m)
  if(id==='rpg_daily')return daily(sock,m)
  if(id==='rpg_talk_master'){await buttons(sock,m.key.remoteJid,'💬 *MASTER COMMUNICATION*\n\nThe communication layer is reserved for the AI/NPC phase.\n\nYour Master state and bond are already persistent, so AI can later react to real events without controlling game outcomes.','RYUDEN • MASTER',[['⚔️ RPG Home','rpg_home']]);return true}
  if(id.startsWith('rpg_master_')){const key=id.slice(11);if(!MASTER_KEYS.has(key))return false;const p=await store.ensurePlayer(canonicalUserId(m.key),displayName(m));if(p.currentMaster){await masterPanel(sock,m);return true}const r=await store.setMaster(canonicalUserId(m.key),key);await buttons(sock,m.key.remoteJid,`🧙 *DESTINY ACCEPTED*\n\n> *${r.master.name}* — ${r.master.universe}\n\n🌀 ${r.master.passive}\n⚔️ ${r.master.skill}\n🌌 ${r.master.ultimate}\n\nYour Odyssey has begun.`,'RYUDEN • MASTER',[['🗺️ Begin Odyssey','rpg_explore'],['⚔️ RPG Home','rpg_home']]);return true}
  return false
 }
 async function route(sock,m,c){
  const id=canonicalUserId(m.key),name=displayName(m),jid=m.key.remoteJid,args=c.args||[]
  if(c.command==='/rpg'){await panel(sock,m);return true}
  if(c.command==='/masters'){await masterPanel(sock,m);return true}
  if(c.command==='/master'){const p=await store.ensurePlayer(id,name);if(p.currentMaster){await masterPanel(sock,m);return true}const r=await store.setMaster(id,args[0]);if(!r){await masterPanel(sock,m);return true}await buttons(sock,jid,`🧙 *DESTINY ACCEPTED*\n\n> *${r.master.name}* — ${r.master.universe}\n\nYour Odyssey has begun.`,'RYUDEN • MASTER',[['🗺️ Begin Odyssey','rpg_explore'],['⚔️ RPG Home','rpg_home']]);return true}
  if(c.command==='/daily')return daily(sock,m)
  if(c.command==='/explore')return explore(sock,m)
  if(c.command==='/inventory'){await inventoryPanel(sock,m);return true}
  if(['/rlb','/rpgleaderboard'].includes(c.command)){const rows=await store.leaderboard(10);await send(sock,jid,m,`🏆 *ODYSSEY POWER RANKING*\n\n${rows.map((p,i)=>`${i+1}. *${p.username||'Player'}* — ${p.rank} Lv.${p.level}\n   💥 ${p.powerScore}`).join('\n\n')||'No adventurers yet.'}`);return true}
  if(c.command==='/guild'){
   const sub=String(args[0]||'info').toLowerCase()
   if(sub==='create'){if(!jid.endsWith('@g.us')){await send(sock,jid,m,'🏰 Guilds can only be created from WhatsApp groups.');return true}if(!(await isAdmin(sock,jid,id))){await send(sock,jid,m,'🛡️ Only a *group admin* can propose a guild.');return true}const gname=args.slice(1).join(' ').trim();if(gname.length<3||gname.length>32){await send(sock,jid,m,'Use */guild create [name]* — 3 to 32 characters.');return true}await store.ensurePlayer(id,name);const ids=await adminIds(sock,jid),r=await store.createProposal(jid,gname,id,ids);if(!r.ok){await send(sock,jid,m,`❌ ${r.message}`);return true}await send(sock,jid,m,r.created?`🏰 *GUILD CREATED*\n\n*${r.guild.name}* now represents this group.`:`🗳️ *GUILD PROPOSAL*\n\n> 🏰 *${gname}*\nProposed by: *${name||'Group Admin'}*\n\nVotes: *1/${r.needed}* required\nAdmins: */guild accept*\n⏳ Expires in 24 hours.`);return true}
   if(sub==='accept'){if(!jid.endsWith('@g.us')||!(await isAdmin(sock,jid,id))){await send(sock,jid,m,'🛡️ Only group admins can vote.');return true}const r=await store.voteProposal(jid,id);await send(sock,jid,m,!r.ok?`❌ ${r.message}`:r.created?`🏰 *GUILD APPROVED!*\n\n*${r.guild.name}* has been founded.\nVote: *${r.votes}/${r.needed}*.`:`🗳️ Vote accepted for *${r.name}*.\nVotes: *${r.votes}/${r.needed}*.`);return true}
   if(sub==='join'){if(!jid.endsWith('@g.us')){await send(sock,jid,m,'Use */guild join* inside the guild’s WhatsApp group.');return true}const g=await store.joinGroupGuild(jid,id);await send(sock,jid,m,g?`🏰 You joined *${g.name}*.`:'❌ This group has no approved guild.');return true}
   await guildPanel(sock,m);return true
  }
  return false
 }
 return{route,section,panel,getPlayer:(id)=>store.getPlayer(id)}
}
module.exports={createRpg}
