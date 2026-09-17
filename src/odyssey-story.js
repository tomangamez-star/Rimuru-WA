 'use strict'
const CHAPTERS=[
 {n:1,title:'The Broken Gate',location:'East Gate',summary:'A violet rift opens where the System insists nothing exists. Kael asks you to recover a scout taken by the Pale Choir.',npc:'kael',choice:'lostScout'},
 {n:2,title:'Tracks Below Ryuden',location:'Old Transit Tunnels',summary:'The tunnels rearrange themselves. Someone is using Rift Cores to rewrite paths beneath the city.'},
 {n:3,title:'The Name in the Archive',location:'Lower Archive',summary:'Nyra finds your name in a record written years before you entered Ryuden.',npc:'nyra'},
 {n:4,title:'A Voice Wearing Your Face',location:'Mirror District',summary:'An Echo that looks like you warns that one of Ryuden’s trusted factions is feeding the rifts.'},
 {n:5,title:'Sovereign of Hollow Glass',location:'Glass Cathedral',summary:'The Pale Choir releases the Hollow Sovereign to erase everyone who saw the Echo.',boss:'hollow'},
 {n:6,title:'The Master’s Doubt',location:'Silent Courtyard',summary:'Your Master recognizes something inside the recovered Core but refuses to explain it immediately.'},
 {n:7,title:'The Scout Who Returned Wrong',location:'North Barracks',summary:'The missing scout returns alive—but remembers events that never happened in your timeline.',npc:'kael'},
 {n:8,title:'The Choir Beneath the Choir',location:'Sunken Chapel',summary:'You learn the Pale Choir is divided. One side wants to control the Thirteenth Echo; another wants it destroyed.'},
 {n:9,title:'A City That Never Existed',location:'Zero Ryuden',summary:'A rift leads to an abandoned version of Ryuden where no player ever chose a Master.'},
 {n:10,title:'Chronophage',location:'Clock Rift',summary:'A creature feeding on discarded timelines blocks the way home.',boss:'chrono'},
 {n:11,title:'The First Monarch',location:'Monarch Vault',summary:'Nyra uncovers the truth: the first Monarch rejected the System after learning players were being repeated across worlds.',npc:'nyra'},
 {n:12,title:'Betrayal at Central',location:'Ryuden Central',summary:'A recurring ally makes their move. Who betrays you depends on the relationships and choices you built earlier.'},
 {n:13,title:'The Thirteenth Echo',location:'Edge of the Rift',summary:'You finally meet the Echo behind the impossible records. It knows choices you never made.'},
 {n:14,title:'Choose What Survives',location:'System Nexus',summary:'Saving Ryuden, saving the Echoes, and preserving the System cannot all happen cleanly. Your earlier decisions change the available routes.'},
 {n:15,title:'Odyssey End: The Door Beyond',location:'Throne Beyond Time',summary:'The final confrontation decides what your version of Ryuden remembers—and what follows you into the next Odyssey.',boss:'final'}
]
const NPCS={
 kael:{name:'Kael',role:'Rift Scout',personality:'Wary, practical, brave, dry humor. Loyal once trust is earned.',knowledge:'The Pale Choir abducts people exposed to unstable rifts. He suspects someone inside Ryuden gives them routes.'},
 nyra:{name:'Nyra',role:'Archivist',personality:'Sharp, impatient, curious, obsessed with impossible records. She values truth over comfort.',knowledge:'Records contain contradictory timelines and references to the Thirteenth Echo and the first Monarch.'},
 vesper:{name:'Vesper',role:'Pale Choir Defector',personality:'Controlled, suspicious, guilt-ridden and difficult to read.',knowledge:'The Choir is split between the Cantors and the Null faction. Vesper knows the System deletes failed timelines.'},
 echo:{name:'Echo',role:'Unknown Reflection',personality:'Calm, unsettling, familiar. Speaks as if they remember the player personally.',knowledge:'Knows fragments of alternate player choices but cannot freely reveal the final truth.'}
}
function chapter(n){return CHAPTERS[Math.max(0,Math.min(14,(Number(n)||1)-1))]}
module.exports={CHAPTERS,NPCS,chapter}
