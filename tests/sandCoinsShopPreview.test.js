import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
 buildSandShopPreviewButtons,buildSandShopItemPreview,buildSandShopPanel,
} from '../src/commands/Community/sandcoins.js';
import { handleSandShopButton } from '../src/interactions/buttons/sandShopPreview.js';
import shopHandlers from '../src/interactions/buttons/sandShopPreview.js';
import { SAND_CATALOG } from '../src/services/sandCoinsService.js';
import { renderProgressionRankPng } from '../src/utils/progressionRankCard.js';

const emptyServer={inventory:[],equipped:{background:null,border:null,tag:null}};
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
const guildId='222222222222222222';
const mockDb=()=>{
 const values=new Map();
 const pool={connect:async()=>({query:async(sql,args=[])=>{
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||sql.includes('pg_advisory_xact_lock'))
   return {rows:[]};
  if(sql.startsWith('SELECT value FROM'))
   return {rows:values.has(args[0])?[{value:structuredClone(values.get(args[0]))}]:[]};
  if(sql.startsWith('INSERT INTO')){
   values.set(args[0],JSON.parse(args[1]));return {rows:[]};
  }
  throw Error('Unexpected SQL: '+sql);
 },release(){}})};
 const db={db:{pool,isAvailable:()=>true},get:async(key,def=null)=>values.get(key)??def};
 return {db,values};
};
function fakeButton(id,messageId,seen,client){
 const i={id,user:{id},guildId,guild:{name:'Sand Castle'},message:{id:messageId},
  deferred:false,replied:false,
  async deferUpdate(){seen.push('ack:'+id);this.deferred=true;},
  async editReply(payload){seen.push({edited:id,payload});},
  async reply(payload){seen.push({reply:id,payload});},
  async followUp(payload){seen.push({followUp:id,payload});},
 };
 return i;
}

test('each shop item has a persistent globally routed Preview button and an overview button',()=>{
 const rows=buildSandShopPreviewButtons();
 const buttons=rows.flatMap(row=>row.toJSON().components);
 assert.equal(buttons.length,SAND_CATALOG.length+1);
 assert.ok(rows.every(row=>row.toJSON().components.length<=5));
 assert.deepEqual(buttons.slice(0,-1).map(button=>button.custom_id),
  SAND_CATALOG.map(item=>'sand_shop_preview:'+item.id));
 assert.equal(buttons.at(-1).custom_id,'sand_shop_back');
 assert.deepEqual(buttons.slice(0,-1).map(button=>button.label),
  SAND_CATALOG.map(item=>'Preview '+item.name));
 assert.ok(buttons.every(button=>button.disabled!==true));
 assert.deepEqual(shopHandlers.map(x=>x.name),['sand_shop_preview','sand_shop_back']);
});

test('every cosmetic produces a real rank-card image without touching inventory',()=>{
 const untouched=structuredClone(emptyServer),hashes=new Map();
 for(const item of SAND_CATALOG){
  const result=buildSandShopItemPreview(item.id,emptyServer,'Sand Castle');
  assert.equal(result.files.length,1);
  assert.equal(result.embeds.length,1);
  const bytes=result.files[0].attachment;
  assert.ok(Buffer.isBuffer(bytes));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const view=result.embeds[0].toJSON();
  assert.equal(view.image.url,'attachment://beacon-preview-'+item.id+'.png');
  assert.match(view.title,new RegExp(item.name));
  assert.match(view.description,/sample rank card/);
  assert.match(view.description,/Not owned/);
  assert.match(view.fields[1].value,/No coins spent/);
  assert.equal(result.components.length,3);
  hashes.set(item.id,digest(bytes));
 }
 for(const [left,right] of [
  ['sunset','galaxy'],['sunset','emerald'],['gold','diamond'],['royal','pioneer'],
 ])assert.notEqual(hashes.get(left),hashes.get(right));
 assert.deepEqual(emptyServer,untouched);
});

test('render cache reuses the same PNG and reacts correctly to equipped changes',()=>{
 const server={inventory:['galaxy','gold','royal'],
  equipped:{background:'galaxy',border:'gold',tag:'royal'}};
 const original=structuredClone(server);
 const first=buildSandShopItemPreview('diamond',server,'Test Castle');
 const second=buildSandShopItemPreview('diamond',server,'Test Castle');
 assert.strictEqual(first.files[0].attachment,second.files[0].attachment);
 const expected=renderProgressionRankPng({
  name:'Test Castle',rank:42,level:14,xp:48500,progress:74,
  appearance:{background:'galaxy',border:'diamond',tag:'royal'},
 });
 assert.equal(digest(first.files[0].attachment),digest(expected));
 const changed=structuredClone(server);
 changed.equipped.background=null;
 const third=buildSandShopItemPreview('diamond',changed,'Test Castle');
 assert.notEqual(digest(first.files[0].attachment),digest(third.files[0].attachment));
 assert.deepEqual(server,original);
 assert.match(buildSandShopItemPreview('gold',server,'Test Castle').embeds[0].toJSON().description,/Already owned/);
 assert.throws(()=>buildSandShopItemPreview('not-real',server,'Test Castle'),/unavailable/);
});

test('shop is publicly shareable and does not reveal anyone’s balance',async()=>{
 const {db,values}=mockDb();
 values.set('beacon:sandcoins:v1:server:'+guildId,{inventory:['gold']});
 const panel=await buildSandShopPanel({db},guildId,'Sand Castle');
 const serialized=panel.embeds[0].toJSON();
 assert.match(serialized.description,/Preview/);
 assert.doesNotMatch(serialized.description,/Your balance|remaining coins/i);
 assert.ok(serialized.fields.some(f=>/Golden Frame/.test(f.name)&&/650 SC/.test(f.value)));
 assert.equal(panel.components.length,3);
 assert.equal(panel.embeds.length,1);
});

test('spam clicking previews acknowledges all buttons and only renders newest choice',async()=>{
 const {db}=mockDb(),client={db},seen=[],messageId='999999999999999999';
 const a=fakeButton('a',messageId,seen,client);
 const b=fakeButton('b',messageId,seen,client);
 const c=fakeButton('c',messageId,seen,client);
 const pending=[
  handleSandShopButton(a,client,['sunset'],'preview'),
  handleSandShopButton(b,client,['123456789012345678','gold'],'preview'),
  handleSandShopButton(c,client,['galaxy'],'preview'),
 ];
 await Promise.all(pending);
 assert.deepEqual(seen.filter(x=>typeof x==='string'),['ack:a','ack:b','ack:c']);
 const edits=seen.filter(x=>typeof x==='object'&&x.edited);
 assert.equal(edits.length,1);
 assert.equal(edits[0].edited,'c');
 assert.match(edits[0].payload.embeds[0].toJSON().title,/Galaxy Night/);
 assert.equal(seen.filter(x=>x.followUp||x.reply).length,0);
});

test('back button restores the public shop without expiring after ten minutes',async()=>{
 const {db}=mockDb(),client={db},seen=[];
 const back=fakeButton('back','888888888888888888',seen,client);
 await handleSandShopButton(back,client,[],'back');
 assert.equal(seen[0],'ack:back');
 const edits=seen.filter(x=>x.edited);
 assert.equal(edits.length,1);
 assert.match(edits[0].payload.embeds[0].toJSON().title,/Sand Coins Shop/);
 assert.equal(edits[0].payload.components.length,3);
});

test('global handler replaces fragile per-message collectors, and only money-sensitive actions stay private',async()=>{
 const source=await readFile(new URL('../src/commands/Community/sandcoins.js',import.meta.url),'utf8');
 assert.doesNotMatch(source,/createMessageComponentCollector|openSandShopPreviews/);
 assert.match(source,/const publicCommands=new Set\(\['leaderboard','daily','shop','inventory','equip','unequip'\]\)/);
 assert.match(source,/publicCommands\.has\(sub\)\?\{\}:\{flags:MessageFlags\.Ephemeral\}/);
 assert.doesNotMatch(source,/Your balance:/); // Never expose private balance in public shop.
 const handler=await readFile(new URL('../src/interactions/buttons/sandShopPreview.js',import.meta.url),'utf8');
 assert.match(handler,/await interaction\.deferUpdate\(\)/);
 assert.match(handler,/const revision=\+\+state\.revision/);
 assert.match(handler,/if\(revision!==state\.revision\)return/);
 assert.doesNotMatch(handler,/buySandDecoration|equipSandDecoration/);
});
