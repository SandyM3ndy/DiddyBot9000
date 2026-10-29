import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
 buildSandShopPreviewButtons,buildSandShopItemPreview,buildSandShopPanel,
 SAND_SHOP_CATEGORIES,normalizeSandShopCategory,
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

test('shop categories show only the correct existing cosmetics and preserve global buttons',()=>{
 const rows=buildSandShopPreviewButtons();
 const buttons=rows.flatMap(row=>row.toJSON().components);
 assert.equal(buttons.length,SAND_CATALOG.length+SAND_SHOP_CATEGORIES.length+2+5);
 assert.ok(rows.every(row=>row.toJSON().components.length<=5));
 assert.deepEqual(buttons.slice(0,4).map(button=>button.custom_id),
  ['sand_shop_category:all','sand_shop_category:border','sand_shop_category:tag','sand_shop_category:background']);
 assert.deepEqual(buttons.filter(button=>button.custom_id.startsWith('sand_shop_preview:')).map(button=>button.custom_id),
  SAND_CATALOG.map(item=>'sand_shop_preview:all:'+item.id));
 assert.equal(buttons.at(-2).custom_id,'sand_shop_back');
 assert.equal(buttons.at(-1).custom_id,'sand_shop_treasury');
 assert.deepEqual(buttons.filter(button=>button.custom_id.startsWith('sand_shop_preview:')).map(button=>button.label),
  SAND_CATALOG.map(item=>'Preview '+item.name));
 assert.ok(buttons.every(button=>button.disabled!==true));
 assert.deepEqual(shopHandlers.map(x=>x.name),['sand_shop_preview','sand_shop_category','sand_shop_back','sand_shop_filter','sand_shop_treasury']);
 for(const [category,expected] of [
  ['border',['gold','diamond']],
  ['tag',['royal','pioneer']],
  ['background',['sunset','galaxy','emerald']],
 ]){
  const current=buildSandShopPreviewButtons(category);
  const items=current.flatMap(row=>row.toJSON().components).filter(button=>button.custom_id.startsWith('sand_shop_preview:'));
  assert.deepEqual(items.map(button=>button.custom_id),expected.map(id=>'sand_shop_preview:'+category+':'+id));
  assert.equal(items.length,expected.length);
  assert.equal(current.length,4);
  assert.equal(current[0].toJSON().components.find(x=>x.custom_id==='sand_shop_category:'+category).style,1);
 }
 assert.equal(normalizeSandShopCategory('not-real'),'all');
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
  assert.equal(result.components.length,5);
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
  appearance:{background:'galaxy',border:'diamond',tag:'royal'},fastPreview:true,
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
 assert.equal(panel.components.length,5);
 assert.equal(panel.embeds.length,1);
 for(const [category,expected] of [
  ['border',['gold','diamond']],
  ['tag',['royal','pioneer']],
  ['background',['sunset','galaxy','emerald']],
 ]){
  const filtered=await buildSandShopPanel({db},guildId,'Sand Castle',category);
  assert.match(filtered.embeds[0].toJSON().title,new RegExp(category==='border'?'Frames':category==='tag'?'Name Tags':'Backgrounds'));
  assert.equal(filtered.embeds[0].toJSON().fields.length,expected.length);
  const items=filtered.components.flatMap(row=>row.toJSON().components)
   .filter(btn=>btn.custom_id.startsWith('sand_shop_preview:'));
  assert.deepEqual(items.map(btn=>btn.custom_id),expected.map(id=>'sand_shop_preview:'+category+':'+id));
 }
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
 assert.match(edits[0].payload.embeds[0].toJSON().title,/Beacon Network • Rank Card Shop/);
 assert.equal(edits[0].payload.components.length,5);
});

test('category button navigates publicly and preview keeps its selected category',async()=>{
 const {db}=mockDb(),client={db},seen=[],id='888888888888888887';
 await handleSandShopButton(fakeButton('frames',id,seen,client),client,['border'],'category');
 let edited=seen.find(x=>x.edited);
 assert.match(edited.payload.embeds[0].toJSON().title,/Frames/);
 assert.equal(edited.payload.embeds[0].toJSON().fields.length,2);
 seen.length=0;
 await handleSandShopButton(fakeButton('gold',id,seen,client),client,['border','gold'],'preview');
 edited=seen.find(x=>x.edited);
 assert.match(edited.payload.embeds[0].toJSON().title,/Golden Frame/);
 const ids=edited.payload.components.flatMap(row=>row.toJSON().components).map(btn=>btn.custom_id);
 assert.ok(ids.includes('sand_shop_category:background'));
 assert.ok(ids.includes('sand_shop_preview:border:diamond'));
 assert.ok(!ids.includes('sand_shop_preview:border:royal'));
 assert.ok(!ids.includes('sand_shop_preview:all:royal'));
});

test('redesigned artwork keeps existing item IDs, is deterministic and visually different',()=>{
 const ids=SAND_CATALOG.map(item=>item.id);
 assert.deepEqual(ids,['sunset','galaxy','emerald','gold','diamond','royal','pioneer']);
 const render=opts=>renderProgressionRankPng({name:'Sand Castle',rank:42,level:14,xp:48500,progress:74,
  appearance:opts,fastPreview:true});
 const baseline=digest(render({}));
 const scene=['sunset','galaxy','emerald'].map(background=>digest(render({background})));
 const frames=['gold','diamond'].map(border=>digest(render({border})));
 const tags=['royal','pioneer'].map(tag=>digest(render({tag})));
 assert.equal(new Set([baseline,...scene,...frames,...tags]).size,8);
 assert.equal(digest(render({background:'galaxy',border:'gold',tag:'royal'})),
  digest(render({background:'galaxy',border:'gold',tag:'royal'})));
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

test('new shop filters retain server ownership and avoid personal balance disclosure',async()=>{
 const {db,values}=mockDb();
 values.set('beacon:sandcoins:v1:server:'+guildId,{inventory:['gold','galaxy']});
 const client={db};
 const owned=await buildSandShopPanel(client,guildId,'Sand Castle','all','owned');
 assert.deepEqual(owned.embeds[0].toJSON().fields.map(x=>x.name.includes('Golden Frame')?'gold':'galaxy').sort(),['galaxy','gold']);
 assert.equal(owned.components.flatMap(row=>row.toJSON().components)
  .filter(x=>x.custom_id.startsWith('sand_shop_preview:')).length,2);
 const unowned=await buildSandShopPanel(client,guildId,'Sand Castle','all','unowned');
 assert.equal(unowned.embeds[0].toJSON().fields.length,SAND_CATALOG.length-2);
 const limited=await buildSandShopPanel(client,guildId,'Sand Castle','all','limited');
 assert.equal(limited.embeds[0].toJSON().fields.length,1);
 const first=buildSandShopItemPreview('sunset',emptyServer,'Sand Castle');
 assert.ok(first.components.flatMap(x=>x.toJSON().components).some(x=>x.custom_id==='sand_shop_buy:sunset'));
 const already=buildSandShopItemPreview('gold',{...emptyServer,inventory:['gold']},'Sand Castle');
 assert.ok(already.components.flatMap(x=>x.toJSON().components).some(x=>x.custom_id==='sand_shop_buy:gold'&&x.disabled));
});


test('a filtered cosmetic preview and category switch keep the chosen filter',async()=>{
 const {db,values}=mockDb(),client={db},seen=[],id='999999999999999971';
 values.set('beacon:sandcoins:v1:server:'+guildId,{inventory:['gold','galaxy']});
 const panel=await buildSandShopPanel(client,guildId,'Sand Castle','all','owned');
 const panelButtons=panel.components.flatMap(row=>row.toJSON().components);
 assert.ok(panelButtons.some(button=>button.custom_id==='sand_shop_category:border:owned'));
 assert.deepEqual(panelButtons.filter(button=>button.custom_id.startsWith('sand_shop_preview:'))
  .map(button=>button.custom_id).sort(),['sand_shop_preview:all:owned:galaxy','sand_shop_preview:all:owned:gold']);
 await handleSandShopButton(fakeButton('owned',id,seen,client),client,['all','owned','gold'],'preview');
 let edit=seen.find(x=>x.edited);
 assert.ok(edit);
 let ids=edit.payload.components.flatMap(row=>row.toJSON().components).map(x=>x.custom_id);
 assert.ok(ids.includes('sand_shop_category:border:owned'));
 assert.ok(ids.includes('sand_shop_preview:all:owned:galaxy'));
 assert.ok(!ids.includes('sand_shop_preview:all:owned:diamond'));
 seen.length=0;
 await handleSandShopButton(fakeButton('border',id,seen,client),client,['border','owned'],'category');
 edit=seen.find(x=>x.edited);
 assert.equal(edit.payload.embeds[0].toJSON().fields.length,1);
 ids=edit.payload.components.flatMap(row=>row.toJSON().components).map(x=>x.custom_id);
 assert.ok(ids.includes('sand_shop_preview:border:owned:gold'));
 assert.ok(!ids.includes('sand_shop_preview:border:owned:diamond'));
});

test('affordable shop filter stays private and never reveals the wallet amount',async()=>{
 const {db,values}=mockDb(),client={db},seen=[];
 const uid='111111111111111111';
 values.set('beacon:sandcoins:v1:wallet:'+uid,{balance:650,lifetime:750});
 const i=fakeButton(uid,'999999999999999972',seen,client);
 i.deferReply=async payload=>{i.deferred=true;seen.push({deferred:payload});};
 await handleSandShopButton(i,client,['all','affordable'],'filter');
 const privateAck=seen.find(x=>x.deferred)?.deferred;
 assert.equal(privateAck?.flags,64);
 const edit=seen.find(x=>x.edited)?.payload;
 assert.ok(edit?.embeds);
 assert.ok(!JSON.stringify(edit.embeds[0].toJSON()).includes('650 SC available'));
 const ids=edit.components.flatMap(row=>row.toJSON().components).map(b=>b.custom_id);
 assert.ok(ids.includes('sand_shop_category:border:affordable'));
 assert.ok(ids.includes('sand_shop_preview:all:affordable:gold'));
 assert.ok(!ids.includes('sand_shop_preview:all:affordable:galaxy'));
});
