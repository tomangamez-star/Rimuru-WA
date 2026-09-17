'use strict'
const ORIGINAL_OWNER='2349110799878'
function norm(x){return String(x||'').replace(/\D/g,'')}
function ownerIds(){return new Set([ORIGINAL_OWNER,...String(process.env.OWNER_NUMBERS||process.env.OWNER_NUMBER||process.env.OWNER_ID||'').split(/[,;\s]+/).map(norm).filter(Boolean)])}
function isOwner(id){return ownerIds().has(norm(id))}
module.exports={ORIGINAL_OWNER,ownerIds,isOwner,norm}
