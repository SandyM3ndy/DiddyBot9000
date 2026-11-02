import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseWrapper } from '../src/utils/database/wrapper.js';
import { pgDb,PostgreSQLDatabase } from '../src/utils/postgresDatabase.js';
import { isPostgresShutdownError,isTransientPostgresConnectionError } from '../src/utils/postgresOutage.js';

test('Railway admin termination is recoverable, including a nested pg-pool error',()=>{
 for(const code of ['57P01','57P02','57P03','08006']){
  assert.equal(isPostgresShutdownError(Object.assign(new Error('socket closed'),{code})),true);
 }
 const admin=new Error('terminating connection due to administrator command');
 assert.equal(isPostgresShutdownError(admin),true);
 assert.equal(isPostgresShutdownError(new AggregateError([admin],'pool failed')),true);
 for(const code of ['ETIMEDOUT','ECONNREFUSED','ECONNRESET']){
  const error=new AggregateError([Object.assign(new Error('connect failed'),{code})],'pg-pool failed');
  assert.equal(isTransientPostgresConnectionError(error),true,code);
  assert.equal(isPostgresShutdownError(error),false,'not every network error is an uncaught PostgreSQL shutdown');
 }
 assert.equal(isPostgresShutdownError(new TypeError('Cannot read properties of undefined')),false);
 assert.equal(isPostgresShutdownError(Object.assign(new Error('syntax error'),{code:'42601'})),false);
});

test('production never silently switches to volatile memory when PostgreSQL sleeps',async()=>{
 const previous=process.env.NODE_ENV;
 const saved={connect:pgDb.connect,getLastFailure:pgDb.getLastFailure,
  reconnect:pgDb.reconnect,isAvailable:pgDb.isAvailable,set:pgDb.set};
 process.env.NODE_ENV='production';
 let writes=0,reconnects=0;
 try {
  pgDb.connect=async()=>false;
  pgDb.getLastFailure=()=>({reason:'ECONNREFUSED',message:'Postgres sleeping'});
  pgDb.isAvailable=()=>false;
  pgDb.reconnect=async()=>{reconnects++;return false;};
  pgDb.set=async()=>{writes++;throw new Error('must not be used');};
  const wrapper=new DatabaseWrapper();
  await wrapper.initialize();
  assert.equal(wrapper.getConnectionType(),'postgresql');
  assert.equal(wrapper.isDegraded(),false,'production must not run volatile memory storage');
  assert.equal(wrapper.isAvailable(),false);
  assert.equal(wrapper.db,pgDb);
  await assert.rejects(wrapper.get('beacon:sandcoins:v1:wallet:123'),/database connection is unavailable/);
  await assert.rejects(wrapper.set('beacon:sandcoins:v1:wallet:123',{balance:42}),
   /database connection is unavailable/);
  assert.equal(writes,0,'no currency operation may be silently stored in memory');
  assert.equal(reconnects,2);
 }finally{
  Object.assign(pgDb,saved);
  if(previous===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=previous;
 }
});

test('PostgreSQL reconnection replaces the dead pool without waiting for stuck transactions',async()=>{
 const db=new PostgreSQLDatabase();
 let closing=0,attempts=0;
 db.pool={end:()=>{closing++;return new Promise(()=>{});}};
 db.isConnected=false;
 db.connectionPromise=Promise.resolve(true);
 db.connect=async()=>{attempts++;return true;};
 const result=await Promise.race([
  db.reconnect(),
  new Promise(resolve=>setTimeout(()=>resolve('hung pool drain'),300)),
 ]);
 assert.equal(result,true,'new connection must not depend on broken pool draining');
 assert.equal(closing,1);
 assert.equal(attempts,1);
 assert.equal(db.pool,null,'dead pool must be detached before reconnect');
 assert.equal(db.connectionPromise,null,'old successful connection promise must be invalidated');
});
