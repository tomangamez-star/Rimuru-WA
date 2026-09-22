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
