import test from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { PostgreSQLDatabase } from '../src/utils/postgresDatabase.js';
import { canUseCaseWarningActions } from '../src/commands/Moderation/cases.js';

test('PostgreSQL reconnect is single-flight under simultaneous Discord requests',async()=>{
 const db=new PostgreSQLDatabase();
 let closes=0,connections=0;
 db.pool={end:async()=>{closes++;await new Promise(resolve=>setImmediate(resolve));}};
 db.isConnected=false;
 db.connect=async()=>{connections++;db.isConnected=true;db.pool={};return true;};
 const result=await Promise.all(Array.from({length:12},()=>db.reconnect()));
 assert.deepEqual(result,Array(12).fill(true));
 assert.equal(closes,1);
 assert.equal(connections,1);
 assert.equal(db.reconnectionPromise,null);
 assert.equal(db.isConnected,true);
});
test('Case Manager warnings preserve the configured moderator role with no audit-log privileges',()=>{
 const role='444444444444444444';
 const base={guild:{ownerId:'222222222222222222'},user:{id:'111111111111111111'},
  memberPermissions:{has:()=>false},member:{roles:{cache:new Map([[role,{}]])}}};
 assert.equal(canUseCaseWarningActions(base,{modRole:role}),true);
 assert.equal(canUseCaseWarningActions(base,{modRole:'333333333333333333'}),false);
 assert.equal(canUseCaseWarningActions({...base,memberPermissions:{has:flag=>flag===PermissionFlagsBits.ModerateMembers}},{}),true);
 assert.equal(canUseCaseWarningActions({...base,guild:{ownerId:base.user.id}},{modRole:null}),true);
});
