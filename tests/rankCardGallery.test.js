import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import rankCommand from '../src/commands/Community/rank.js';
import { LEGACY_SLASH_COMMANDS, REQUIRED_V11_COMMANDS } from '../src/handlers/loaders/commandLoader.js';
import handler,{ handleRankCardButton } from '../src/interactions/buttons/rankCardGallery.js';
import {
 isRankCardId,rankCardSaveKey,loadLiveRankCard,buildRankCardDisplay,
 rankCardButtons,saveRankCardSnapshot,readRankCardSnapshot,
} from '../src/services/rankCardGalleryService.js';

const target='222222222222222222',viewer='333333333333333333',
 post='444444444444444444',other='555555555555555555';
function mockClient(){
 const values=new Map([
  ['guild:'+target+':config',{serverProgression:{enabled:true}}],
  ['guild:'+target+':progression',{xp:48500,level:10,lastQuestDay:'2026-10-24',dailyQuests:[]}],
  ['beacon:sandcoins:v1:server:'+target,{inventory:['gold','galaxy','royal'],
   equipped:{background:'galaxy',border:'gold',tag:'royal'}}],
 ]);
 const query=async(sql,args=[])=>{
  if(sql==='BEGIN'||sql==='COMMIT'||sql==='ROLLBACK'||/pg_advisory_(xact_)?(un)?lock/.test(sql))
   return {rows:[]};
  if(sql.startsWith('SELECT value FROM'))
   return {rows:values.has(args[0])?[{value:structuredClone(values.get(args[0]))}]:[]};
  if(sql.startsWith('INSERT INTO')){
   values.set(args[0],JSON.parse(args[1]));return {rows:[]};
  }
  throw Error('Unexpected SQL: '+sql);
 };
 const pool={options:{max:8},connect:async()=>({query,release(){}})};
 const db={db:{pool,isAvailable:()=>true},
  async get(key,def=null){return values.get(key)??def;},
  async set(key,value){values.set(key,structuredClone(value));return true;},
  async list(prefix){return [...values.keys()].filter(x=>x.startsWith(prefix));},
 };
 const client={db,guilds:{cache:new Map([
  [target,{id:target,name:'ROYAL SANDBOX',memberCount:31}],
  [viewer,{id:viewer,name:'VIEWER GUILD',memberCount:4}],
 ])}};
 return {client,values};
}
function fakeButton(client,action,user=post,id='666666666666666666'){
 const seen=[];
 const interaction={
  guildId:viewer,guild:{id:viewer},message:{id},user:{id:user},client,
  async deferUpdate(){seen.push('deferred')},
  async editReply(payload){seen.push({type:'edit',payload})},
  async reply(payload){seen.push({type:'reply',payload})},
  async followUp(payload){seen.push({type:'follow',payload})},
 };
 return {interaction,seen,args:[action,target,post]};
}

test('/rank card accepts a server ID and old rank report remains available as /rank server',()=>{
 const body=rankCommand.data.toJSON();
 assert.equal(body.name,'rank');
 assert.equal(LEGACY_SLASH_COMMANDS.has('rank'),false);
 assert.ok(REQUIRED_V11_COMMANDS.includes('rank'));
 assert.deepEqual(body.options.map(o=>o.name),['server','card']);
 assert.equal(body.options[1].options[0].name,'server_id');
 assert.equal(body.options[1].options[0].required,true);
 assert.equal(handler.name,'rank_card');
 assert.ok(isRankCardId(target));
 assert.equal(isRankCardId('abc123'),false);
});
test('only servers currently public on Beacon leaderboards can be searched',async()=>{
 const {client,values}=mockClient();
 const card=await loadLiveRankCard(client,target);
 assert.equal(card.guildId,target);
 assert.equal(card.guildName,'ROYAL SANDBOX');
 assert.equal(card.xp,48500);
 assert.equal(card.rank,1);
 assert.equal(card.appearance.border,'gold');
 assert.equal(card.appearance.tag,'royal');
 assert.ok(card.inventory.includes('galaxy'));
 await assert.rejects(loadLiveRankCard(client,'123'),/INVALID_SERVER_ID/);
 await assert.rejects(loadLiveRankCard(client,other),/SERVER_NOT_FOUND/);
 values.set('guild:'+target+':config',{serverProgression:{enabled:false}});
 await assert.rejects(loadLiveRankCard(client,target),/PROGRESSION_NOT_PUBLIC/);
 values.set('guild:'+target+':config',{serverProgression:{enabled:true}});
 values.set('guild:'+target+':progression',{...values.get('guild:'+target+':progression'),
  leaderboardExcluded:true});
 await assert.rejects(loadLiveRankCard(client,target),/PROGRESSION_NOT_PUBLIC/);
});
test('rank-card image and cosmetics page use the target server style, not the viewer server',async()=>{
 const {client}=mockClient();
 const card=await loadLiveRankCard(client,target);
 const image=buildRankCardDisplay(card,{ownerId:post});
 const img=image.files[0].attachment;
 assert.equal(img.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const e=image.embeds[0].toJSON();
 assert.match(e.description,/48,500 XP/);
 assert.equal(e.image.url,'attachment://beacon-rank-card.png');
 assert.ok(image.components[0].toJSON().components.some(x=>x.custom_id==='rank_card:save:'+target+':'+post));
 assert.equal(image.components[0].toJSON().components.find(x=>x.custom_id.startsWith('rank_card:saved:')).disabled,true);
 const cosmetics=buildRankCardDisplay(card,{view:'cosmetics',ownerId:post});
 const details=cosmetics.embeds[0].toJSON();
 assert.match(details.title,/Cosmetic Collection/);
 assert.ok(details.fields.some(f=>f.value.includes('Golden Frame')));
 assert.ok(details.fields.some(f=>f.value.includes('Royal Sands')));
 assert.ok(details.fields.some(f=>f.value.includes('Galaxy Night')));
 assert.deepEqual(cosmetics.files,[]);
 assert.deepEqual(cosmetics.attachments,[]);
 assert.equal(rankCardButtons(target,post,'saved',true)[0].toJSON().components.at(-1).disabled,false);
});
test('saved rank cards are durable across a new client instance and never mutate server inventories',async()=>{
 const {client,values}=mockClient(),card=await loadLiveRankCard(client,target);
 const before=structuredClone(values.get('beacon:sandcoins:v1:server:'+target));
 const saved=await saveRankCardSnapshot(client,'666666666666666666',card,post);
 assert.equal(saved.card.guildId,target);
 assert.ok(values.has(rankCardSaveKey('666666666666666666')));
 const afterRestart={db:client.db};
 const read=await readRankCardSnapshot(afterRestart,'666666666666666666',target);
 assert.equal(read.ownerId,post);
 assert.equal(read.card.appearance.tag,'royal');
 assert.deepEqual(values.get('beacon:sandcoins:v1:server:'+target),before);
 assert.equal(await readRankCardSnapshot(afterRestart,'666666666666666666',other),null);
 assert.equal(await readRankCardSnapshot(afterRestart,'invalid',target),null);
});
test('a revoked Founder badge disappears from saved rank cards without destroying saved cosmetics',async()=>{
 const {client,values}=mockClient();
 const card=await loadLiveRankCard(client,target);
 values.set('beacon:founders:v1',{version:1,entries:[{guildId:target,number:3}]});
 card.founder={number:3};
 const id='666666666666666668';
 await saveRankCardSnapshot(client,id,card,post);
 const originally=await readRankCardSnapshot(client,id,target);
 assert.deepEqual(originally.card.founder,{number:3});
 values.set('guild:'+target+':progression',{
  ...values.get('guild:'+target+':progression'),leaderboardExcluded:true,
 });
 // Even if the Founder registry write has not finished, the persisted
 // exclusion flag is authoritative for both live and archived cards.
 const revoked=await readRankCardSnapshot(client,id,target);
 assert.equal(revoked.card.founder,null);
 assert.equal(revoked.card.appearance.tag,'royal');
 assert.deepEqual(values.get(rankCardSaveKey(id)).card.founder,{number:3},
  'do not corrupt the historical snapshot while hiding invalid entitlements');
});

test('public buttons can save, view a saved version and survive disabled progression',async()=>{
 const {client,values}=mockClient();
 const saving=fakeButton(client,'save');
 await handleRankCardButton(saving.interaction,client,saving.args);
 assert.equal(saving.seen[0],'deferred');
 const edit=saving.seen.find(x=>x.type==='edit');
 assert.match(edit.payload.embeds[0].toJSON().title,/Saved Rank Card/);
 assert.equal((await readRankCardSnapshot(client,'666666666666666666',target)).ownerId,post);
 const denied=fakeButton(client,'save',other);
 await handleRankCardButton(denied.interaction,client,denied.args);
 assert.equal(denied.seen[0].type,'reply');
 assert.match(denied.seen[0].payload.content,/Only the person/);
 values.set('guild:'+target+':config',{serverProgression:{enabled:false}});
 const saved=fakeButton(client,'saved');
 await handleRankCardButton(saved.interaction,client,saved.args);
 assert.match(saved.seen.find(x=>x.type==='edit').payload.embeds[0].toJSON().title,/Saved Rank Card/);
 const live=fakeButton(client,'live');
 await handleRankCardButton(live.interaction,client,live.args);
 assert.match(live.seen.find(x=>x.type==='follow').payload.content,/no longer available/);
});
test('rank-card controls register globally, immediately acknowledge and never use collectors',async()=>{
 const source=await readFile(new URL('../src/interactions/buttons/rankCardGallery.js',import.meta.url),'utf8');
 const loader=await readFile(new URL('../src/handlers/loaders/interactions.js',import.meta.url),'utf8');
 assert.match(source,/await interaction\.deferUpdate\(\)/);
 assert.match(source,/saveRankCardSnapshot\(client,interaction\.message\.id,card,ownerId\)/);
 assert.doesNotMatch(source,/createMessageComponentCollector/);
 assert.match(loader,/'rank_card'/);
});
