import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreLockdown } from '../src/services/lockdownService.js';

function makeClient(fail) {
  const data = new Map([['guild:lockdown_state', {
    active: true, roles: [{ id: 'r1', permissions: '1024' }],
    channels: [{ id: 'c1', overwrites: [] }],
  }]]);
  return {
    data,
    lockdownStates: new Map([['guild', true]]),
    db: {
      get: async key => data.get(key),
      delete: async key => data.delete(key),
    },
    fail,
  };
}
function makeGuild(client) {
  return {
    id: 'guild',
    members: { me: { id: 'bot', roles: { highest: { id: 'botrole' } } } },
    roles: { cache: new Map([['r1', { id: 'r1', editable: true, managed: false, setPermissions: async () => {
      if (client.fail) throw new Error('missing permission');
    } }]]) },
    channels: { cache: new Map([['c1', { id: 'c1', permissionOverwrites: { set: async () => {} } }]]) },
  };
}
test('failed lockdown restore retains the only saved permission snapshot', async () => {
  const client = makeClient(true);
  const result = await restoreLockdown(client, makeGuild(client));
  assert.equal(result.success, false);
  assert.deepEqual(result.failedRoles, ['r1']);
  assert.equal(client.lockdownStates.get('guild'), true);
  assert.ok(client.data.has('guild:lockdown_state'));
});
test('successful retry clears persisted state only after permissions restore', async () => {
  const client = makeClient(true);
  const guild = makeGuild(client);
  await restoreLockdown(client, guild);
  client.fail = false;
  const result = await restoreLockdown(client, guild);
  assert.equal(result.success, true);
  assert.equal(client.data.has('guild:lockdown_state'), false);
  assert.equal(client.lockdownStates.get('guild'), false);
});
