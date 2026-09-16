'use strict'
const {canonicalUserId,displayName,commandParts}=require('./economy-router')
const BUTTONS={
 main:[['🎰 Casino','menu_casino'],['💰 Balance','menu_balance'],['🏆 Leaderboard','menu_lb'],['🎮 Games','menu_games'],['🛠️ Utilities','menu_utils'],['❓ Help','menu_help']],
 casino:[['🎰 Slots','casino_slots'],['🪙 Coin Flip','casino_cf'],['🎲 Dice','casino_dice'],['🎡 Roulette','casino_roulette'],['⬅️ Menu','menu_main']]
}
function createUi({economy,casino,sendButtons,logger}){
 const send=(sock,jid,msg,text)=>sock.sendMessage(jid,{text},{quoted:msg})
 async function balance(sock,msg){const id=canonicalUserId(msg.key),u=await economy.getBalance(id,displayName(msg));return send(sock,msg.key.remoteJid,msg,`💰 *${u.displayName||'YOUR'} BALANCE*\n\n👛 Wallet: *${economy.fmt(u.wallet)}*\n🏦 Bank: *${economy.fmt(u.bank)}*\n💎 Net worth: *${economy.fmt(u.wallet+u.bank)}*\n🎮 Games: ${u.gamesPlayed} • Wins: ${u.gamesWon}`)}
 async function lb(sock,msg){const rows=await economy.leaderboard(10),med=['🥇','🥈','🥉'];const body=rows.length?rows.map((u,i)=>`${med[i]||`${i+1}.`} *${u.displayName||'Player'}* — ${economy.fmt(u.netWorth)}`).join('\n'):'No registered players yet.';return send(sock,msg.key.remoteJid,msg,`🏆 *RYUDEN WEALTH LEADERBOARD*\n\n${body}\n\n💎 Ranked by wallet + bank.`)}
 async function menu(sock,msg){return sendButtons(sock,msg.key.remoteJid,'🐉 *RIMURU • RYUDEN*\n\nChoose a section below. Only systems currently online are shown.','JTF × RYUDEN',BUTTONS.main)}
 async function section(sock,msg,id){
  if(id==='menu_main')return menu(sock,msg)
  if(id==='menu_balance')return balance(sock,msg)
  if(id==='menu_lb')return lb(sock,msg)
  if(id==='menu_help')return send(sock,msg.key.remoteJid,msg,'❓ *HELP*\n\nHelp is split into pages so it stays readable.\n\nUse */help 1* to start.')
  if(id==='menu_casino')return sendButtons(sock,msg.key.remoteJid,'🎰 *CASINO*\n\nAvailable now:\n/slots [amount]\n/cf [heads|tails] [amount]\n/dice [1-6] [amount]\n/roulette [bet] [amount]\n\nTap a game below for its usage.','Original Rimuru casino • WhatsApp port',BUTTONS.casino)
  if(id==='menu_games')return send(sock,msg.key.remoteJid,msg,'🎮 *GAMES*\n\nThe current playable games are casino games:\n🎰 /slots\n🪙 /cf\n🎲 /dice\n🎡 /roulette\n\nMore original Rimuru games will appear here as they are ported.')
  if(id==='menu_utils')return send(sock,msg.key.remoteJid,msg,'🛠️ *UTILITIES*\n\n/ping — connection speed\n/dbping — database speed\n/menu — main menu\n/start — registration/status\n/help 1 — help pages')
  const usages={casino_slots:'🎰 Use */slots 5000*',casino_cf:'🪙 Use */cf heads 5000*',casino_dice:'🎲 Use */dice 5 2000*',casino_roulette:'🎡 Examples:\n*/roulette red 5000*\n*/roulette even 5000*\n*/roulette high 5000*\n*/roulette straight 7 5000*'}
  if(usages[id])return send(sock,msg.key.remoteJid,msg,usages[id])
  return false
 }
 async function route(sock,msg,content){
  const p=commandParts(content);if(!p)return false;const id=canonicalUserId(msg.key),name=displayName(msg),jid=msg.key.remoteJid
  if(p.command==='/start'){const reg=await economy.register(id,name);if(reg.isNew){await send(sock,jid,msg,`🌊 *WELCOME TO RYUDEN, ${name||'MORTAL'}!*\n\nI'm *Rimuru Tempest* — guardian of the JTF Casino and your guide through Ryuden.\n\nYour account has been registered with *${economy.fmt(reg.user.wallet)}* starting coins. Your wallet, bank and game progress are stored persistently.\n\nUse */menu* anytime to explore.`)}else{await send(sock,jid,msg,`🌊 Hello there, *${name||reg.user.displayName||'mortal'}*.\n\nYou're already registered in *RYUDEN*. I'm Rimuru Tempest, guardian of the JTF Casino. Your account, wallet, bank and game progress are ready.\n\nUse */menu* to continue.`)}await menu(sock,msg);return true}
  if(p.command==='/menu'){await menu(sock,msg);return true}
  if(['/lb','/leaderboard'].includes(p.command)){await lb(sock,msg);return true}
  if(p.command==='/casino'){await section(sock,msg,'menu_casino');return true}
  if(p.command==='/games'){await section(sock,msg,'menu_games');return true}
  if(p.command==='/help'){const page=Number(p.args[0]||0);const pages={1:'❓ *HELP • PAGE 1/3*\n\n/start — register / welcome back\n/menu — interactive menu\n/bal — balance\n/bank — bank status\n/lb — wealth leaderboard\n\nNext: */help 2*',2:'❓ *HELP • PAGE 2/3 — ECONOMY*\n\n/dep [amount|all]\n/wd [amount|all]\n/donate [amount] — reply to a user\n/transfer [amount] — reply to a user\n\nNext: */help 3*',3:'❓ *HELP • PAGE 3/3 — CASINO*\n\n/slots [amount]\n/cf [heads|tails] [amount]\n/dice [1-6] [amount]\n/roulette red|black|even|odd|low|high [amount]\n/roulette straight [0-36] [amount]\n\nUse */casino* for the casino panel.'};await send(sock,jid,msg,pages[page]||'❓ Help uses pages.\n\nStart with */help 1*.');return true}
  let r=null
  if(p.command==='/slots')r=await casino.slots(id,name,p.args[0])
  if(['/cf','/coinflip'].includes(p.command))r=await casino.coinflip(id,name,p.args[0],p.args[1])
  if(p.command==='/dice')r=await casino.dice(id,name,p.args[0],p.args[1])
  if(p.command==='/roulette')r=await casino.roulette(id,name,p.args)
  if(!r)return false
  if(!r.ok){await send(sock,jid,msg,r.message);return true}
  let text=''
  if(p.command==='/slots')text=`🎰 ${r.reels.join(' | ')}\n\n${r.payout?'✅ *YOU WIN!*':'❌ No luck.'}`
  else if(['/cf','/coinflip'].includes(p.command))text=`🪙 The coin lands *${r.flip.toUpperCase()}*.\n\n${r.payout?'✅ *DOUBLE!*':'❌ You lost.'}`
  else if(p.command==='/dice')text=`🎲 You picked *${r.pick}* — rolled *${r.rolled}*.\n\n${r.payout?'✅ *JACKPOT! 6x*':'❌ Missed.'}`
  else text=`🎡 The ball lands on *${r.number} ${r.color}*.\n\n${r.payout?'✅ *WIN!*':'❌ Lost.'}`
  text+=`\n💵 Bet: ${economy.fmt(r.bet)}\n${r.payout?`💰 Payout: ${economy.fmt(r.payout)}\n`:''}👛 Wallet: *${economy.fmt(r.user.wallet)}*`
  await send(sock,jid,msg,text);return true
 }
 return{route,section,menu}
}
module.exports={createUi}
