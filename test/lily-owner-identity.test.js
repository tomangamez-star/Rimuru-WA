'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {resolveMessageUserId}=require('../src/identity')
const ai=require('../src/ai-v2')

test('resolves a WhatsApp LID to Toman phone number and enriches the key',async()=>{
 const m={key:{remoteJid:'987654321@lid'}}
 const sock={signalRepository:{lidMapping:{getPNForLID:async()=> '2349110799878@s.whatsapp.net'}}}
 assert.equal(await resolveMessageUserId(sock,m),'2349110799878')
 assert.equal(m.key.remoteJidAlt,'2349110799878@s.whatsapp.net')
})

test('owner output never keeps EMC or assistant engagement bait',()=>{
 const out=ai._test.humanizeLily("Got it, EMC. What's on your mind today?",{isToman:true})
 assert.equal(out,'Toman. Obviously 😒')
})

test('Lily refuses factual lookup and serious advice instead of answering',()=>{
 assert.equal(ai._test.utilityKind('Who is Elon Musk?'),'lookup')
 assert.equal(ai._test.utilityKind('What can I do to earn 5k dollars weekly?'),'money')
 assert.equal(ai._test.utilityKind('Give me advice about my career'),'advice')
 assert.equal(ai._test.utilityKind('Translate this to French'),'utility')
 for(const prompt of['Who is Elon Musk?','What can I do to earn 5k dollars weekly?','Give me advice about my career','2 + 2']){
  const answer=ai._test.utilityDeflection(prompt)
  assert.ok(answer&&answer.length<180)
  assert.doesNotMatch(answer,/SpaceX|Tesla|freelance|consulting|four|\b4\b/i)
 }
})

test('provider retry parsing and silent incident errors are deterministic',()=>{
 const response={headers:{get:name=>name==='retry-after'?'12':null}}
 assert.equal(ai._test.retryMs(response,429),12000)
 assert.equal(ai._test.retryMs({headers:{get:()=>null}},429),60000)
 assert.equal(ai._test.retryHintMs('Please try again in 3m4.464s.'),185464)
 assert.equal(ai._test.silentError().code,'LILY_SILENT')
})

test('Lily has independent Groq model quotas available',()=>{
 assert.deepEqual(ai.modelCandidates(),[
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
 ])
})

test('a model-specific 429 switches to the next Groq model',async()=>{
 const originalFetch=global.fetch,originalKey=process.env.GROQ_API_KEY,calls=[]
 process.env.GROQ_API_KEY='test-key'
 global.fetch=async(_url,options)=>{
  const model=JSON.parse(options.body).model;calls.push(model)
  if(calls.length===1)return{ok:false,status:429,headers:{get:()=>null},text:async()=>'{"error":{"message":"Please try again in 3m4.464s."}}'}
  return{ok:true,json:async()=>({choices:[{message:{content:'Still here.'}}]})}
 }
 try{
  assert.equal(await ai._test.call([{role:'user',content:'hi'}]),'Still here.')
  assert.deepEqual(calls,['openai/gpt-oss-20b','openai/gpt-oss-120b'])
 }finally{
  global.fetch=originalFetch
  if(originalKey===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=originalKey
 }
})
