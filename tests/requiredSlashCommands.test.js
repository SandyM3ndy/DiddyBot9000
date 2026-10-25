import test from 'node:test';
import assert from 'node:assert/strict';
import {
 REQUIRED_V11_COMMANDS,REQUIRED_GLOBAL_COMMANDS,getMissingRequiredCommands,
 assertRequiredCommandsPresent,registerCommands,registerSandCoinsGuildCommand,
 registerDailyGuildCommand,registerGuildCommands,
} from '../src/handlers/loaders/commandLoader.js';

const appId='123456789012345678';
const g1='987654321098765432',g2='876543210987654321';

function mockClient({guildIds=[g1,g2],failGuild=null}={}){
 const calls=[];
 const client={
  commands:new Map(REQUIRED_V11_COMMANDS.map(name=>[name,{data:{
   name,toJSON:()=>({name,description:'Test command',
    ...(name==='sandcoins'?{dm_permission:false,options:[{type:1,name:'wallet',description:'Show wallet'},{type:1,name:'daily',description:'Claim daily bonus'}]}:{})
   }),
  }}])),
  config:{bot:{clientId:appId}},
  guilds:{cache:new Map(guildIds.map(id=>[id,{id}]))},
  rest:{
   async put(route,{body}){calls.push({verb:'PUT',route,body});return body;},
   async post(route,{body}){
    calls.push({verb:'POST',route,body});
    if(failGuild&&route.includes('/guilds/'+failGuild+'/'))throw Error('Simulated Discord error');
    return {id:'123456789012345679',guild_id:route.split('/guilds/')[1].split('/')[0],name:body.name};
   },
  },
 };
 return {client,calls};
}

test('v1.1 requires /daily and /sandcoins locally; rest register globally',()=>{
 assert.deepEqual(REQUIRED_V11_COMMANDS,['diagnose','roleaudit','ticket','giveaway','time','sandcoins','daily']);
 assert.deepEqual(REQUIRED_GLOBAL_COMMANDS,['diagnose','roleaudit','ticket','giveaway','time']);
 assert.deepEqual(getMissingRequiredCommands(['help','diagnose','roleaudit','ticket','giveaway']),['time','sandcoins','daily']);
 assert.throws(()=>assertRequiredCommandsPresent(['diagnose','ticket'],'loaded'),/roleaudit/);
 assert.doesNotThrow(()=>assertRequiredCommandsPresent(REQUIRED_V11_COMMANDS));
});

test('all guilds get both economy commands immediately, without global duplicates',async()=>{
 const {client,calls}=mockClient();
 await registerCommands(client,{clientId:appId});
 const posts=calls.filter(call=>call.verb==='POST');
 assert.deepEqual(posts.map(call=>[call.route,call.body.name]),[
  [`/applications/${appId}/guilds/${g1}/commands`,'sandcoins'],
  [`/applications/${appId}/guilds/${g1}/commands`,'daily'],
  [`/applications/${appId}/guilds/${g2}/commands`,'sandcoins'],
  [`/applications/${appId}/guilds/${g2}/commands`,'daily'],
 ]);
 for(const post of posts)assert.equal('dm_permission' in post.body,false);
 assert.deepEqual(posts[0].body.options.map(x=>x.name),['wallet','daily']);
 const global=calls.at(-1);
 assert.equal(global.verb,'PUT');
 assert.equal(global.route,`/applications/${appId}/commands`);
 assert.ok(global.body.some(cmd=>cmd.name==='giveaway'));
 assert.ok(global.body.every(cmd=>!['sandcoins','daily'].includes(cmd.name)));
 assert.ok(calls.every(call=>!call.route.includes('/guilds/')||call.verb==='POST'));
});

test('a failed guild registration retains both global economy command fallbacks',async()=>{
 const {client,calls}=mockClient({failGuild:g2});
 await registerCommands(client,{clientId:appId});
 const global=calls.at(-1);
 assert.equal(global.verb,'PUT');
 assert.ok(global.body.some(x=>x.name==='sandcoins'));
 assert.ok(global.body.some(x=>x.name==='daily'));
});

test('new guild command registration only upserts, never deletes existing commands',async()=>{
 const {client,calls}=mockClient({guildIds:[]});
 assert.equal(await registerGuildCommands(client,g1),2);
 assert.deepEqual(calls.map(x=>x.body.name),['sandcoins','daily']);
 assert.deepEqual(calls.map(x=>x.verb),['POST','POST']);
});

test('individual economy guild registration helpers preserve their names',async()=>{
 const {client,calls}=mockClient({guildIds:[]});
 assert.equal((await registerSandCoinsGuildCommand(client,g1)).name,'sandcoins');
 assert.equal((await registerDailyGuildCommand(client,g1)).name,'daily');
 assert.equal(calls.length,2);
});

test('startup fails before sync if /daily is missing from command files',async()=>{
 const {client,calls}=mockClient();
 client.commands.delete('daily');
 await assert.rejects(registerCommands(client,{clientId:appId}),/daily/);
 assert.equal(calls.length,0);
});
