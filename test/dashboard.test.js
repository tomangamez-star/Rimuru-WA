'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {_test}=require('../src/dashboard')

test('dashboard helpers compare secrets safely',()=>{
 assert.equal(_test.safeEqual('right','right'),true)
 assert.equal(_test.safeEqual('right','wrong'),false)
 assert.equal(_test.safeEqual('short','much-longer'),false)
})

test('dashboard masks connected WhatsApp numbers',()=>{
 const masked=_test.maskPhone('2349110799878:6@s.whatsapp.net')
 assert.equal(masked,'+234 ••• ••9878')
 assert.equal(masked.includes('911079'),false)
})

test('dashboard incident sanitizer limits provider details',()=>{
 const out=_test.cleanIncident({type:'failure',message:'x'.repeat(900),attempts:Array.from({length:12},(_,i)=>({model:`m${i}`,message:'y'.repeat(400)}))})
 assert.equal(out.message.length,500)
 assert.equal(out.attempts.length,8)
 assert.equal(out.attempts[0].message.length,220)
})
