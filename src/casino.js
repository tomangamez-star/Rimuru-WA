'use strict'
const REDS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
const SLOT_ITEMS=['🍒','🍋','🍇','💎','⭐','7️⃣','🎰','🔰']
const cooldowns=new Map(),COOLDOWN_MS=Number(process.env.PER_GAME_COOLDOWN_MS||120000)
function amount(raw){const n=Number(String(raw||'').replace(/,/g,''));return Number.isFinite(n)&&n>0?Math.floor(n):null}
function guard(id,game){const k=`${id}:${game}`,left=(cooldowns.get(k)||0)-Date.now();if(left>0)return Math.ceil(left/1000);cooldowns.set(k,Date.now()+COOLDOWN_MS);return 0}
function createCasino({economy}){
 async function play(id,name,game,bet,resolver){const left=guard(id,game);if(left)return{ok:false,message:`⏳ ${game} cooldown: ${left}s.`};const r=await economy.playBet(id,bet,game,resolver,name);if(!r.ok)cooldowns.delete(`${id}:${game}`);return r}
 async function slots(id,name,raw){const bet=amount(raw);if(!bet)return{ok:false,message:'🎩 Usage: */slots [amount]*'};return play(id,name,'slots',bet,()=>{const reels=[0,0,0].map(()=>SLOT_ITEMS[Math.floor(Math.random()*SLOT_ITEMS.length)]),[a,b,c]=reels,m=a===b&&b===c?4:(a===b||a===c||b===c?2:0);return{reels,mult:m,payout:bet*m}})}
 async function coinflip(id,name,choiceRaw,raw){const c=String(choiceRaw||'').toLowerCase(),choice=['h','head','heads'].includes(c)?'heads':['t','tail','tails'].includes(c)?'tails':null,bet=amount(raw);if(!choice||!bet)return{ok:false,message:'🎩 Usage: */cf [heads|tails] [amount]*'};return play(id,name,'coinflip',bet,()=>{const flip=Math.random()<.5?'heads':'tails';return{choice,flip,payout:flip===choice?bet*2:0}})}
 async function dice(id,name,pickRaw,raw){const pick=Number(pickRaw),bet=amount(raw);if(![1,2,3,4,5,6].includes(pick)||!bet)return{ok:false,message:'🎩 Usage: */dice [1-6] [amount]*'};return play(id,name,'dice',bet,()=>{const rolled=Math.floor(Math.random()*6)+1;return{pick,rolled,payout:rolled===pick?bet*6:0}})}
 async function roulette(id,name,args){const bet=amount(args.at(-1));if(!bet)return{ok:false,message:'🎩 Try */roulette red 5000*, */roulette even 5000*, */roulette straight 7 5000*'};const p=args.slice(0,-1).map(x=>x.toLowerCase());let type,value,mult;if(p.length===1&&['red','black'].includes(p[0])){type='color';value=p[0];mult=2}else if(p.length===1&&['even','odd'].includes(p[0])){type='parity';value=p[0];mult=2}else if(p.length===1&&['low','high'].includes(p[0])){type='half';value=p[0];mult=2}else if(p[0]==='straight'&&Number(p[1])>=0&&Number(p[1])<=36){type='straight';value=Number(p[1]);mult=36}else return{ok:false,message:'🎩 Try */roulette red 5000*, */roulette even 5000*, */roulette straight 7 5000*'};return play(id,name,'roulette',bet,()=>{const n=Math.floor(Math.random()*37),color=n===0?'green':REDS.has(n)?'red':'black';let win=type==='color'?color===value:type==='parity'?n!==0&&((value==='even')===(n%2===0)):type==='half'?n!==0&&(value==='low'?n<=18:n>=19):n===value;return{number:n,color,mult,payout:win?bet*mult:0}})}
 return{slots,coinflip,dice,roulette}
}
module.exports={createCasino}
