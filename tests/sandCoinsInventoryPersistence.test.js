import test from 'node:test';
import assert from 'node:assert/strict';
import {
 buySandDecoration, equipSandDecoration, getSandServer,
 getSandInventoryBackupStatus, getSandInventoryProtectedSnapshot,
 offerSandTrade, resolveSandTrade,
 SAND_INVENTORY_SNAPSHOT_DEPTH,
} from '../src/services/sandCoinsService.js';

const user='111111111111111111';
const serverA='222222222222222222';
const serverB='333333333333333333';
const base='beacon:sandcoins:v1:';
const k=id=>base+'server:'+id;
const vault=id=>base+'inventory-vault:'+id;
const wallet=id=>base+'wallet:'+id;
function mockDatabase(){
 const values=new Map();
 let failOnInsert=0;
 const pool={async connect(){
  let pending=null;
  return {
   async query(sql,args=[]){
    if(sql==='BEGIN'){pending=new Map();return {rows:[]};}
    if(sql==='ROLLBACK'){pending=null;return {rows:[]};}
    if(sql==='COMMIT'){
     for(const [key,value] of pending)values.set(key,value);
     pending=null;return {rows:[]};
    }
    if(sql.includes('pg_advisory_xact_lock'))return {rows:[]};
    if(sql.startsWith('SELECT value FROM')){
     const key=args[0],value=pending?.has(key)?pending.get(key):values.get(key);
     return {rows:value===undefined?[]:[{value:structuredClone(value)}]};
    }
    if(sql.startsWith('INSERT INTO')){
     if(failOnInsert>0&&--failOnInsert===0)throw Error('Injected database write failure');
     pending.set(args[0],JSON.parse(args[1]));return {rows:[]};
    }
    throw Error('Unexpected SQL '+sql);
   },
   release(){},
  };
 }};
 const db={db:{pool,isAvailable:()=>true},isAvailable:()=>true,
  get:async(key,defaultValue=null)=>structuredClone(values.get(key)??defaultValue),
  list:async prefix=>[...values.keys()].filter(x=>x.startsWith(prefix))};
 return {db,values,failAt(n){failOnInsert=n}};
}
const client=db=>({db});

test('existing inventory is protected on first read and preserves unlisted/retired items forever',async()=>{
 const {db,values}=mockDatabase();
 values.set(k(serverA),{inventory:['royal','collector-legacy-2025'],equipped:{tag:'royal'},
  purchases:[{id:'444444444444444444'}],pendingLogs:[],tradeOffers:[]});
 const original=await getSandServer(client(db),serverA);
 assert.deepEqual(original.inventory,['royal','collector-legacy-2025']);
 assert.equal(original.equipped.tag,'royal');
 const status=await getSandInventoryBackupStatus(client(db),serverA);
 assert.equal(status.revision,1);
 assert.equal(status.copies,1);
 assert.equal(status.items,2);
 assert.deepEqual(values.get(vault(serverA)).snapshots[0].server.inventory,original.inventory);
 await equipSandDecoration(client(db),{guildId:serverA,itemId:null,slot:'tag',actorId:user});
 const next=await getSandServer(client(db),serverA);
 assert.deepEqual(next.inventory,original.inventory);
 assert.equal(next.equipped.tag,null);
 assert.equal((await getSandInventoryBackupStatus(client(db),serverA)).revision,2);
});

test('a purchase has a durable independent vault, survives restart and can only charge once',async()=>{
 const {db,values}=mockDatabase();
 values.set(wallet(user),{balance:4000,lifetime:4000});
 const first=await buySandDecoration(client(db),{userId:user,guildId:serverA,itemId:'sunset',purchaseId:'444444444444444444'});
 assert.equal(first.balance,3700);
 const record=values.get(k(serverA)),copy=values.get(vault(serverA));
 assert.ok(record.inventory.includes('sunset'));
 assert.deepEqual(copy.snapshots[0].server.inventory,record.inventory);
 // Simulate a restart with a new bot client and the SAME persistent data.
 const rebooted=client(db);
 assert.equal((await getSandServer(rebooted,serverA)).inventory.includes('sunset'),true);
 const second=await buySandDecoration(rebooted,{userId:user,guildId:serverA,itemId:'sunset',purchaseId:'444444444444444444'});
 assert.equal(second.duplicate,true);
 assert.equal((await rebooted.db.get(wallet(user))).balance,3700);
 const reused=await buySandDecoration(rebooted,{userId:user,guildId:serverB,itemId:'sunset',purchaseId:'444444444444444444'});
 assert.equal(reused.error,'PURCHASE_ID_REUSED');
 assert.equal((await getSandServer(rebooted,serverB)).inventory.length,0);
});

test('a missing live inventory is recovered from the latest verified snapshot, never from old purchases',async()=>{
 const {db,values}=mockDatabase();
 values.set(wallet(user),{balance:5000,lifetime:5000});
 await buySandDecoration(client(db),{userId:user,guildId:serverA,itemId:'gold',purchaseId:'444444444444444444'});
 await equipSandDecoration(client(db),{guildId:serverA,itemId:'gold',slot:'border',actorId:user});
 const before=await getSandInventoryBackupStatus(client(db),serverA);
 values.delete(k(serverA));
 const recovered=await getSandServer(client(db),serverA);
 assert.deepEqual(recovered.inventory,['gold']);
 assert.equal(recovered.equipped.border,'gold');
 assert.deepEqual(values.get(k(serverA)).inventory,recovered.inventory);
 const health=await getSandInventoryBackupStatus(client(db),serverA);
 assert.equal(health.revision,before.revision);
 assert.equal(health.recoveryCount,1);
 assert.ok(Number.isFinite(Date.parse(health.lastRecoveredAt)));
 assert.equal((await db.get(wallet(user))).balance,4350);
});

test('cross-server trade settles both copies, and recovery cannot resurrect traded-away items',async()=>{
 const {db,values}=mockDatabase(),bot=client(db);
 values.set(k(serverA),{inventory:['gold'],equipped:{border:'gold'}});
 values.set(k(serverB),{inventory:['galaxy'],equipped:{background:'galaxy'}});
 const args={tradeId:'555555555555555555',fromGuildId:serverA,toGuildId:serverB,
  fromOwnerId:'666666666666666666',toOwnerId:'777777777777777777',
  offeredItem:'gold',requestedItem:'galaxy',now:new Date('2027-01-01T12:00:00Z')};
 const offered=await offerSandTrade(bot,args);
 assert.equal(offered.offer.status,'pending');
 const traded=await resolveSandTrade(bot,{tradeId:args.tradeId,actorId:args.toOwnerId,actingGuildId:serverB,
  fromOwnerId:args.fromOwnerId,toOwnerId:args.toOwnerId,decision:'accept',now:args.now});
 assert.equal(traded.offer.status,'completed');
 assert.deepEqual(values.get(vault(serverA)).snapshots[0].server.inventory,['galaxy']);
 assert.deepEqual(values.get(vault(serverB)).snapshots[0].server.inventory,['gold']);
 values.delete(k(serverA));values.delete(k(serverB));
 const [a,b]=await Promise.all([getSandServer(bot,serverA),getSandServer(bot,serverB)]);
 assert.deepEqual(a.inventory,['galaxy']);
 assert.deepEqual(b.inventory,['gold']);
 assert.equal(a.equipped.border,null);
 assert.equal(b.equipped.background,null);
});

test('vault stops silent tampering or data drift instead of minting extra items',async()=>{
 const {db,values}=mockDatabase(),bot=client(db);
 await getSandServer(bot,serverA);
 const drift=structuredClone(values.get(k(serverA)));
 drift.inventory.push('royal');
 values.set(k(serverA),drift);
 await assert.rejects(getSandServer(bot,serverA),/disagreement/);
 await assert.rejects(equipSandDecoration(bot,{guildId:serverA,itemId:'royal',slot:'tag',actorId:user}),/disagreement/);
 assert.deepEqual(values.get(vault(serverA)).snapshots[0].server.inventory,[]);
 assert.deepEqual(values.get(k(serverA)).inventory,['royal']); // fail closed: never overwrote suspicious record
});

test('corrupt vault checksums are rejected rather than blindly restoring inventory',async()=>{
 const {db,values}=mockDatabase(),bot=client(db);
 await getSandServer(bot,serverA);
 const bad=structuredClone(values.get(vault(serverA)));
 bad.snapshots[0].server.inventory.push('gold');
 values.set(vault(serverA),bad);
 values.delete(k(serverA));
 await assert.rejects(getSandServer(bot,serverA),/checksum/);
 assert.equal(values.has(k(serverA)),false);
});

test('all related purchase writes roll back if any one database write fails',async()=>{
 const {db,values,failAt}=mockDatabase(),bot=client(db);
 values.set(wallet(user),{balance:2000,lifetime:2000});
 // Includes wallet, server, backup, and idempotency receipt.
 failAt(3);
 await assert.rejects(buySandDecoration(bot,{userId:user,guildId:serverA,itemId:'sunset',
  purchaseId:'444444444444444444'}),/Injected database write failure/);
 assert.equal(values.get(wallet(user)).balance,2000);
 assert.equal(values.has(k(serverA)),false);
 assert.equal(values.has(vault(serverA)),false);
 assert.equal(values.has(base+'purchase:444444444444444444'),false);
});

test('rolling snapshots save each equipment change and cap backup storage',async()=>{
 const {db,values}=mockDatabase(),bot=client(db);
 values.set(k(serverA),{inventory:['gold','diamond','archive-gift'],equipped:{border:null}});
 await getSandServer(bot,serverA);
 for(let i=0;i<14;i++)await equipSandDecoration(bot,{
  guildId:serverA,itemId:i%2?'gold':'diamond',slot:'border',actorId:user,
 });
 const backup=values.get(vault(serverA));
 assert.equal(backup.revision,15);
 assert.equal(backup.snapshots.length,SAND_INVENTORY_SNAPSHOT_DEPTH);
 assert.deepEqual(backup.snapshots.map(x=>x.revision),[15,14,13,12,11,10,9,8]);
 assert.equal(values.get(k(serverA)).inventory.includes('archive-gift'),true);
 assert.equal(backup.snapshots[0].server.equipped.border,'gold');
 assert.equal((await getSandInventoryBackupStatus(bot,serverA)).copies,8);
});

test('invalid duplicate inventory records fail safely rather than silently shedding ownership',async()=>{
 const {db,values}=mockDatabase(),bot=client(db);
 values.set(k(serverA),{inventory:['royal','royal']});
 await assert.rejects(getSandServer(bot,serverA),/duplicate/);
 assert.equal(values.get(k(serverA)).inventory.length,2);
 assert.equal(values.has(vault(serverA)),false);
});

test('offers and audit metadata never evict meaningful inventory recovery revisions',async()=>{
 const {db,values}=mockDatabase(),bot=client(db);
 values.set(k(serverA),{inventory:['gold']});
 values.set(k(serverB),{inventory:['galaxy']});
 const ownerA='666666666666666666',ownerB='777777777777777777';
 const time=new Date('2027-01-01T12:00:00Z');
 await getSandServer(bot,serverA);
 await getSandServer(bot,serverB);
 for(let i=0;i<12;i++){
  const id=String(555555555555555555n+BigInt(i));
  const offer=await offerSandTrade(bot,{tradeId:id,fromGuildId:serverA,toGuildId:serverB,
   fromOwnerId:ownerA,toOwnerId:ownerB,offeredItem:'gold',requestedItem:'galaxy',now:time});
  assert.equal(offer.offer.status,'pending');
  const closed=await resolveSandTrade(bot,{tradeId:id,actorId:ownerA,actingGuildId:serverA,
   fromOwnerId:ownerA,toOwnerId:ownerB,decision:'cancel',now:time});
  assert.equal(closed.offer.status,'cancelled');
 }
 const current=await getSandInventoryProtectedSnapshot(bot,serverA);
 assert.deepEqual(current.server.inventory,['gold']);
 assert.equal(current.backup.revision,1);
 assert.equal(current.backup.copies,1);
 assert.equal(values.get(vault(serverA)).snapshots[0].server.tradeOffers.length,0);
 assert.equal(values.get(vault(serverA)).snapshots[0].server.tradeHistory.length,12);
});

test('protected export always returns inventory and revision from the same transaction',async()=>{
 const {db}=mockDatabase(),bot=client(db);
 const first=await getSandInventoryProtectedSnapshot(bot,serverA);
 assert.equal(first.backup.revision,1);
 assert.equal(first.backup.items,0);
 assert.equal(first.backup.copies,1);
 const other=await getSandInventoryProtectedSnapshot(bot,serverA);
 assert.deepEqual(other,first);
 assert.equal(other.backup.savedAt,first.backup.savedAt);
});
