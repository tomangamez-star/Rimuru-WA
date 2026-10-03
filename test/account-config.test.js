'use strict'
const test=require('node:test'),assert=require('node:assert/strict')
const {_test}=require('../src/account-config')
test('secondary accounts default to Boy Alone auto reply',()=>{const x=_test.defaults('wa-two',false);assert.equal(x.mode,'autoreply');assert.equal(x.personaName,'Boy Alone');assert.equal(x.replyCooldownSec,30);assert.equal(x.groupMode,'mentions')})
test('Boy Alone config clamps unsafe dashboard values',()=>{const x=_test.clean('wa-two',{replyCooldownSec:9999,groupMode:'anything',mutedChats:['a','a','b'],personaName:''},false);assert.equal(x.replyCooldownSec,600);assert.equal(x.groupMode,'mentions');assert.deepEqual(x.mutedChats,['a','b']);assert.equal(x.personaName,'Boy Alone')})
