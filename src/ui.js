'use strict'
const fs=require('fs/promises'),path=require('path')
const {canonicalUserId,displayName,commandParts}=require('./economy-router')
const {createRpg}=require('./rpg')
const START_IMAGE_PATH=path.join(__dirname,'..','assets','ryuden-menu.jpg')
const BUTTONS={main:[['🎰 Casino','menu_casino'],['💰 Balance','menu_balance'],['🏆 Leaderboard','menu_leaderboard'],['🎮 Games','menu_games'],['🛠️ Utilities','menu_utilities'],['❓ Help','menu_help']],casino:[['🎰 Slots','casino_slots_help'],['🪙 Coin Flip','casino_cf_help'],['🎲 Dice','casino_dice_help'],['🎡 Roulette','casino_roulette_help'],['⬅️ Menu','menu_main']]}
function createUi({economy,casino,sendButtons,logger}){const send=(s,j,m,t)=>s.sendMessage(j,{text:t},{quoted:m}),P=m=>({id:canonicalUserId(m.key),name:displayName(m),jid:m.key.remoteJid}),rpg=createRpg({economy,logger,sendButtons})
 async function gate(s,m,c){if(c.command==='/start')return false;const p=P(m),u=await economy.findUser(p.id);if(u?.registeredAt)return false;await send(s,p.jid,m,'🌊 *YOU HAVEN’T ENTERED RYUDEN YET*\n\n> Use */start* to register before using Rimuru.\n\nYour account must be registered before commands, casino, RPG and future card systems can be used.');return true}
 async function balance(s,m){const p=P(m),u=await economy.getBalance(p.id,p.name);return send(s,p.jid,m,`💰 *RIMURU • BALANCE*\n\n> 👤 *${u.displayName||p.name||'Player'}*\n\n👛 Wallet: *${economy.fmt(u.wallet)}*\n🏦 Bank: *${economy.fmt(u.bank)}*\n💎 Net Worth: *${economy.fmt(u.wallet+u.bank)}*`)}
 async function leaderboard(s,m){const rows=await economy.leaderboard(10);return send(s,m.key.remoteJid,m,`🏆 *RIMURU • LEADERBOARD*\n\n${rows.map((u,i)=>`${i+1}. > 👤 *${u.displayName||'Player'}*\n💎 ${economy.fmt(u.netWorth)}`).join('\n\n')||'No registered players yet.'}`)}
 async function profile(s,m){const p=P(m),u=await economy.getBalance(p.id,p.name),wr=u.gamesPlayed?((u.gamesWon/u.gamesPlayed)*100).toFixed(1):'0.0';return send(s,p.jid,m,`👤 *RIMURU PROFILE*\n\n> ${u.displayName||p.name||'Player'}\n💰 ${economy.fmt(u.wallet+u.bank)} net worth\n🎮 ${u.gamesPlayed} games • 🏆 ${u.gamesWon} wins • 📈 ${wr}%\n\n⚔️ Use */rpg* for your Odyssey profile.`)}
 async function menu(s,m){return sendButtons(s,m.key.remoteJid,'🐉 *RIMURU • RYUDEN*\n\nChoose a section below.\n\n⚔️ RPG is now online: use */rpg*.','JTF × RYUDEN',BUTTONS.main)}
 async function casinoPanel(s,m){return sendButtons(s,m.key.remoteJid,'🎰 *RIMURU CASINO*\n\n🎰 /slots [amount]\n🪙 /cf [heads|tails] [amount]\n🎲 /dice [1-6] [amount]\n🎡 /roulette [bet] [amount]','JTF × RYUDEN • CASINO',BUTTONS.casino)}
 async function section(s,m,id){
  const fake={command:id==='menu_main'?'/menu':id==='menu_balance'?'/balance':id==='menu_leaderboard'?'/leaderboard':id==='menu_casino'?'/casino':id==='menu_games'?'/games':id==='menu_utilities'?'/utilities':id==='menu_help'?'/help':id==='start_rpg'?'/rpg':id==='start_casino'?'/casino':id.startsWith('rpg_')?'/rpg':null}
  if(fake.command&&await gate(s,m,fake))return true
  if(id==='start_rpg')return rpg.panel(s,m)
  if(id==='start_casino')return casinoPanel(s,m)
  if(id.startsWith('rpg_')){const handled=await rpg.section(s,m,id);if(handled)return true}
  if(id==='menu_main')return menu(s,m)
  if(id==='menu_balance')return balance(s,m)
  if(id==='menu_leaderboard')return leaderboard(s,m)
  if(id==='menu_casino')return casinoPanel(s,m)
  if(id==='menu_games')return send(s,m.key.remoteJid,m,'🎮 *GAMES*\n\n🎰 Casino: /casino\n⚔️ Ryuden Odyssey RPG: /rpg\n🗺️ Explore: /explore\n🏰 Guild: /guild')
  if(id==='menu_utilities')return send(s,m.key.remoteJid,m,'🛠️ *UTILITIES*\n\n/p • /menu • /help 1 • /rlb')
  if(id==='menu_help')return send(s,m.key.remoteJid,m,'❓ Use */help 1* for commands.')
  const x={casino_slots_help:'🎰 /slots 5000 — 2 matches 2×, 3 matches 4×',casino_cf_help:'🪙 /cf heads 5000 — correct call 2×',casino_dice_help:'🎲 /dice 5 2000 — exact number 6×',casino_roulette_help:'🎡 /roulette red 5000'}
  if(x[id])return send(s,m.key.remoteJid,m,x[id])
  return false
 }
 async function route(s,m,content){const c=commandParts(content);if(!c)return false;const p=P(m)
  if(c.command==='/start'){
   const r=await economy.register(p.id,p.name),n=p.name||r.user.displayName||'mortal'
   const cap=r.isNew
    ?`🌊 *WELCOME TO RYUDEN, ${n.toUpperCase()}!*\n\n> 👤 *${n}*\n\nYour Rimuru account is now registered.\n💰 Starting coins: *${economy.fmt(r.user.wallet)}*\n\nChoose where you want to go next.`
    :`🌊 *WELCOME BACK TO RYUDEN!*\n\n> 👤 *${n}*\n\nYour account and progress are ready.\nChoose where you want to continue.`
   const image=await fs.readFile(START_IMAGE_PATH)
   await s.sendMessage(p.jid,{image,caption:cap},{quoted:m})
   await sendButtons(s,p.jid,'🐉 *CHOOSE YOUR PATH*\n\n⚔️ Enter the Odyssey RPG\n🎰 Enter the JTF Casino','JTF × RYUDEN',[['⚔️ Enter Odyssey','start_rpg'],['🎰 Enter Casino','start_casino'],['📜 Main Menu','menu_main']])
   return true
  }
  if(await gate(s,m,c))return true
  if(await rpg.route(s,m,c))return true
  if(c.command==='/menu'){await menu(s,m);return true}if(['/lb','/leaderboard'].includes(c.command)){await leaderboard(s,m);return true}if(['/p','/profile'].includes(c.command)){await profile(s,m);return true}if(c.command==='/casino'){await casinoPanel(s,m);return true}
  if(c.command==='/games'){await send(s,p.jid,m,'🎮 *RIMURU GAMES*\n\n🎰 /casino — casino games\n⚔️ /rpg — Ryuden Odyssey\n🗺️ /explore — RPG exploration\n🏰 /guild — guild system');return true}
  if(c.command==='/utilities'){await send(s,p.jid,m,'🛠️ *UTILITIES*\n\n/p • /menu • /help 1 • /rlb');return true}
  if(c.command==='/help'){const pg=Number(c.args[0]||1),pages={1:'❓ *HELP 1/4 — CORE*\n\n/start • /menu • /p • /bal • /bank • /lb\n\nNext: /help 2',2:'❓ *HELP 2/4 — ECONOMY*\n\n/dep • /wd • /donate • /transfer\n\nOwner: /addcoin • /setbal\n\nNext: /help 3',3:'❓ *HELP 3/4 — CASINO*\n\n/slots • /cf • /dice • /roulette\n\nNext: /help 4',4:'❓ *HELP 4/4 — RPG*\n\n/rpg • /masters • /master [key]\n/explore • /daily • /inventory • /rlb\n/guild • /guild create [name]\n/guild accept • /guild join'};await send(s,p.jid,m,pages[pg]||pages[1]);return true}
  let r=null;if(c.command==='/slots')r=await casino.slots(p.id,p.name,c.args[0]);if(['/cf','/coinflip'].includes(c.command))r=await casino.coinflip(p.id,p.name,c.args[0],c.args[1]);if(c.command==='/dice')r=await casino.dice(p.id,p.name,c.args[0],c.args[1]);if(c.command==='/roulette')r=await casino.roulette(p.id,p.name,c.args);if(!r)return false;if(!r.ok){await send(s,p.jid,m,r.message);return true}let t=`🎰 *CASINO RESULT*\n\n${r.reels?r.reels.join(' | '):r.flip||r.rolled||r.number}\n\n💵 Bet: ${economy.fmt(r.bet)}\n${r.payout?`💰 Payout: ${economy.fmt(r.payout)}\n`:''}👛 Wallet: *${economy.fmt(r.user.wallet)}*`;await send(s,p.jid,m,t);return true}
 return{route,section,menu,balance,leaderboard,profile}}
module.exports={createUi}
