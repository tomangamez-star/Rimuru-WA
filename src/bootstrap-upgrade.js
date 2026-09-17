'use strict'
const Module=require('module'),path=require('path'),original=Module._load
Module._load=function(request,parent,isMain){if(request==='./ui'&&parent&&path.basename(parent.filename)==='server.js')return original.call(this,'./ui-upgrade',parent,isMain);return original.apply(this,arguments)}
