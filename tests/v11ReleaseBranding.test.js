import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import botConfig, { BEACON_VERSION, BEACON_VERSION_LABEL } from '../src/config/bot.js';

const read=async path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Beacon v1.1 presence is centralized and actually used by startup',async()=>{
 assert.equal(BEACON_VERSION,'1.1.0');
 assert.equal(BEACON_VERSION_LABEL,'v1.1');
 assert.equal(botConfig.presence.status,'online');
 assert.equal(botConfig.presence.activities[0].name,'🌐 Beacon Network | v1.1');
 assert.equal(botConfig.presence.activities[0].type,4);
 const ready=await read('src/events/ready.js');
 assert.match(ready,/client\.normalPresence = structuredClone\(config\.bot\.presence\)/);
 assert.match(ready,/client\.user\.setPresence\(client\.normalPresence\)/);
});

test('application and lockfile agree on semantic v1.1 release',async()=>{
 const pkg=JSON.parse(await read('package.json'));
 const lock=JSON.parse(await read('package-lock.json'));
 assert.equal(pkg.version,'1.1.0');
 assert.equal(lock.version,pkg.version);
 assert.equal(lock.packages[''].version,pkg.version);
});

test('botinfo, dashboard, help and status all use the shared public v1.1 label',async()=>{
 for(const path of [
  'src/commands/Core/botinfo.js',
  'src/commands/Core/dashboard.js',
  'src/commands/Core/help.js',
  'src/commands/Core/status.js',
 ]){
  const source=await read(path);
  assert.match(source,/BEACON_VERSION_LABEL/,path);
  assert.doesNotMatch(source,/V1 🎉/,path);
 }
});

test('version bump does not migrate or rename persistent economy data',async()=>{
 const source=await read('src/services/sandCoinsService.js');
 assert.match(source,/beacon:sandcoins:v1:/);
 const dbSchema=await read('src/config/database/schemaVersion.js');
 assert.ok(dbSchema.includes('EXPECTED_SCHEMA_VERSION'));
});
