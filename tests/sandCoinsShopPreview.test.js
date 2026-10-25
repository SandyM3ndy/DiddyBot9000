import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
 buildSandShopPreviewButtons,
 buildSandShopItemPreview,
} from '../src/commands/Community/sandcoins.js';
import { SAND_CATALOG } from '../src/services/sandCoinsService.js';
import { renderProgressionRankPng } from '../src/utils/progressionRankCard.js';

const interactionId='123456789012345678';
const emptyServer={inventory:[],equipped:{background:null,border:null,tag:null}};
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');

test('every Sand Coins shop item has an individually labeled preview button',()=>{
 const rows=buildSandShopPreviewButtons(interactionId);
 assert.equal(rows.length,Math.ceil(SAND_CATALOG.length/4));
 const buttons=rows.flatMap(row=>row.toJSON().components);
 assert.equal(buttons.length,SAND_CATALOG.length);
 assert.ok(rows.every(row=>row.toJSON().components.length<=5));
 assert.deepEqual(buttons.map(button=>button.custom_id),
  SAND_CATALOG.map(item=>'sand_shop_preview:'+interactionId+':'+item.id));
 assert.deepEqual(buttons.map(button=>button.label),
  SAND_CATALOG.map(item=>'Preview '+item.name));
 assert.ok(buttons.every(button=>button.disabled!==true));
 const expired=buildSandShopPreviewButtons(interactionId,true);
 assert.ok(expired.flatMap(row=>row.toJSON().components).every(button=>button.disabled===true));
 assert.throws(()=>buildSandShopPreviewButtons('invalid'),/Invalid Sand Coins shop interaction/);
});

test('previews render an actual Discord-ready PNG for each cosmetic without changing ownership',()=>{
 const untouched=structuredClone(emptyServer);
 const hashes=new Map();
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
  hashes.set(item.id,digest(bytes));
 }
 assert.equal(hashes.size,SAND_CATALOG.length);
 for(const [left,right] of [
  ['sunset','galaxy'],['sunset','emerald'],['gold','diamond'],['royal','pioneer'],
 ])assert.notEqual(hashes.get(left),hashes.get(right));
 assert.deepEqual(emptyServer,untouched);
});

test('preview overrides just one cosmetic slot and preserves existing equipped items',()=>{
 const server={
  inventory:['galaxy','gold','royal'],
  equipped:{background:'galaxy',border:'gold',tag:'royal'},
 };
 const old=structuredClone(server);
 const preview=buildSandShopItemPreview('diamond',server,'Test Castle');
 const expected=renderProgressionRankPng({
  name:'Test Castle',rank:42,level:14,xp:48500,progress:74,
  appearance:{background:'galaxy',border:'diamond',tag:'royal'},
 });
 assert.equal(digest(preview.files[0].attachment),digest(expected));
 assert.deepEqual(server,old);
 const owned=buildSandShopItemPreview('gold',server,'Test Castle').embeds[0].toJSON();
 assert.match(owned.description,/Already owned/);
 assert.throws(()=>buildSandShopItemPreview('unlisted',server,'Test Castle'),/unavailable/);
});

test('preview interactions use ephemeral responses, time out, and never invoke purchase or equip mutations',async()=>{
 const file=await readFile(new URL('../src/commands/Community/sandcoins.js',import.meta.url),'utf8');
 const handler=file.slice(file.indexOf('async function openSandShopPreviews('),file.indexOf('\nexport default {'));
 assert.match(handler,/button\.deferReply\(\{flags:MessageFlags\.Ephemeral\}\)/);
 assert.match(handler,/getSandServer\(interaction\.client,interaction\.guildId\)/);
 assert.match(handler,/button\.editReply\(preview\)/);
 assert.match(handler,/button\.user\.id!==interaction\.user\.id/);
 assert.match(handler,/time:10\*60_000/);
 assert.match(handler,/buildSandShopPreviewButtons\(interaction\.id,true\)/);
 assert.doesNotMatch(handler,/buySandDecoration|equipSandDecoration|tx\.put|setConfigValue/);
 assert.match(file,/components:buildSandShopPreviewButtons\(interaction\.id\)/);
});
