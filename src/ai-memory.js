'use strict'
const {database}=require('./auth-store')
let ready=false
function db(){const d=database();if(!d)throw Error('DATABASE_URL is required for AI memory');return d}
async function ensureSchema(){if(ready)return;await db().query(`CREATE TABLE IF NOT EXISTS rimuru_ai_memories(id BIGSERIAL PRIMARY KEY,user_id TEXT NOT NULL,scope TEXT NOT NULL,memory_key TEXT NOT NULL,memory_text TEXT NOT NULL,importance INT NOT NULL DEFAULT 5,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),last_used_at TIMESTAMPTZ,UNIQUE(user_id,scope,memory_key));CREATE INDEX IF NOT EXISTS rimuru_ai_memories_lookup ON rimuru_ai_memories(user_id,scope,importance DESC,updated_at DESC)`);ready=true}
function clean(x){return String(x||'').trim().replace(/\s+/g,' ').slice(0,240)}
function candidates(text){const t=clean(text),out=[];const rules=[
 [/\b(?:my name is|call me)\s+([\p{L}\p{N}_ .'-]{2,40})/iu,'name',9,x=>`Prefers to be called ${x}`],
 [/\bi(?:'m| am)\s+(\d{1,3})\s*(?:years? old)?\b/i,'age',7,x=>`Says they are ${x} years old`],
 [/\bi (?:really )?(?:like|love|enjoy)\s+(.{2,80})/i,'likes',6,x=>`Likes ${x}`],
 [/\bi (?:really )?(?:hate|dislike|don't like|do not like)\s+(.{2,80})/i,'dislikes',6,x=>`Dislikes ${x}`],
 [/\bmy favou?rite\s+(.{2,35}?)\s+is\s+(.{2,80})/i,'favorite',7,x=>`Favorite: ${x}`],
 [/\bi prefer\s+(.{2,90})/i,'preference',6,x=>`Prefers ${x}`]
 ];for(const [re,key,importance,fmt] of rules){const m=t.match(re);if(m){let v=clean(m.slice(1).join(' ')).replace(/[.!?]+$/,'');if(v)out.push({key:`${key}:${v.toLowerCase().slice(0,60)}`,text:fmt(v),importance})}}return out.slice(0,3)}
async function remember(userId,scope,text){await ensureSchema();for(const m of candidates(text)){await db().query(`INSERT INTO rimuru_ai_memories(user_id,scope,memory_key,memory_text,importance) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,scope,memory_key) DO UPDATE SET memory_text=EXCLUDED.memory_text,importance=GREATEST(rimuru_ai_memories.importance,EXCLUDED.importance),updated_at=NOW()`,[userId,scope,m.key,m.text,m.importance])}}
async function recall(userId,scope,limit=8){await ensureSchema();const q=await db().query(`SELECT id,memory_text FROM rimuru_ai_memories WHERE user_id=$1 AND scope=$2 ORDER BY importance DESC,updated_at DESC LIMIT $3`,[userId,scope,limit]);if(q.rows.length)await db().query(`UPDATE rimuru_ai_memories SET last_used_at=NOW() WHERE id=ANY($1::bigint[])`,[q.rows.map(x=>x.id)]).catch(()=>{});return q.rows.map(x=>x.memory_text)}
module.exports={ensureSchema,remember,recall}
