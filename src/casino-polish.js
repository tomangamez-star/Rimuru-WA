'use strict'
function install(casino){
 for(const key of ['slots','coinflip','dice','roulette']){
  if(typeof casino?.[key]!=='function')continue
  const fn=casino[key].bind(casino)
  casino[key]=async(...args)=>{
   const r=await fn(...args)
   if(r?.ok){
    const payout=Number(r.payout||0),bet=Number(r.bet||0)
    r.outcome=payout>bet?'WIN':payout===bet&&payout>0?'PUSH':'LOSS'
    r.net=payout-bet
   }
   return r
  }
 }
 return casino
}
module.exports={install}
