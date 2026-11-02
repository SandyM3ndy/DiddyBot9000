// Railway Free services sleep and may terminate active PostgreSQL sockets.
// Only classify known PostgreSQL disconnects; unrelated programming errors
// must still follow the normal fatal-error path.
const PG_SHUTDOWN_CODES=new Set([
 '57P01','57P02','57P03','08000','08001','08003','08006','08007','08P01',
]);
const PG_SHUTDOWN_MESSAGE=/terminating connection due to administrator command|connection terminated unexpectedly|connection ended unexpectedly|server closed the connection unexpectedly|database system is shutting down|database system is starting up/i;

export function isPostgresShutdownError(error){
 const seen=new Set(),pending=[error];
 while(pending.length){
  const entry=pending.pop();
  if(!entry||typeof entry!=='object'||seen.has(entry))continue;
  seen.add(entry);
  if(PG_SHUTDOWN_CODES.has(String(entry.code||'').toUpperCase())||
   PG_SHUTDOWN_MESSAGE.test(String(entry.message||'')))return true;
  if(entry.cause)pending.push(entry.cause);
  if(Array.isArray(entry.errors))pending.push(...entry.errors);
 }
 return false;
}

// Other transient connectivity failures are retryable for ordinary DB calls,
// but are not automatically proof that an UNCAUGHT exception is from Postgres.
const TRANSIENT_CONNECTION_CODES=new Set([
 ...PG_SHUTDOWN_CODES,'ECONNREFUSED','ECONNRESET','ETIMEDOUT','EPIPE',
 'EHOSTUNREACH','ENETUNREACH','ENOTFOUND','EAI_AGAIN',
]);
export function isTransientPostgresConnectionError(error){
 const seen=new Set(),pending=[error];
 while(pending.length){
  const entry=pending.pop();
  if(!entry||typeof entry!=='object'||seen.has(entry))continue;
  seen.add(entry);
  if(TRANSIENT_CONNECTION_CODES.has(String(entry.code||'').toUpperCase())||
   PG_SHUTDOWN_MESSAGE.test(String(entry.message||''))||
   /connection timeout|connect ETIMEDOUT|connect ECONNREFUSED|cannot use a pool after calling end/i.test(String(entry.message||'')))return true;
  if(entry.cause)pending.push(entry.cause);
  if(Array.isArray(entry.errors))pending.push(...entry.errors);
 }
 return false;
}
