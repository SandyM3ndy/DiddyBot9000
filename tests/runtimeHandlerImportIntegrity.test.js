import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

async function discover(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await discover(file));
    else if (entry.isFile() && entry.name.endsWith('.js')) result.push(file);
  }
  return result;
}

test('every Discord event module can be imported at runtime', async () => {
  const paths = await discover(resolve('src/events'));
  assert.ok(paths.length > 10, 'expected to inspect every event module');
  const failures = [];
  for (const path of paths) {
    try {
      const mod = await import(pathToFileURL(path).href);
      if (!mod.default?.name || typeof mod.default.execute !== 'function') {
        failures.push(path + ': missing event name or execute');
      }
    } catch (error) {
      failures.push(path + ': ' + (error?.message || error));
    }
  }
  assert.deepEqual(failures, [], 'Broken event imports would otherwise silently disable functionality');
});

test('every Discord component handler imports and exposes a valid handler', async () => {
  const paths = await discover(resolve('src/interactions'));
  assert.ok(paths.length > 15, 'expected to inspect all component handlers');
  const failures = [];
  const seen = new Set();
  for (const path of paths) {
    try {
      const mod = await import(pathToFileURL(path).href);
      const handlers = Array.isArray(mod.default) ? mod.default : [mod.default];
      for (const handler of handlers) {
        if (!handler?.name || typeof handler.execute !== 'function') {
          failures.push(path + ': missing handler name or execute');
          continue;
        }
        const type = path.includes('/selectMenus/') ? 'menu'
          : path.includes('/modals/') ? 'modal' : 'button';
        const key = type + ':' + handler.name;
        if (seen.has(key)) failures.push(path + ': duplicate ' + key);
        seen.add(key);
      }
    } catch (error) {
      failures.push(path + ': ' + (error?.message || error));
    }
  }
  assert.deepEqual(failures, [], 'Broken component imports would cause Discord buttons to time out');
});
