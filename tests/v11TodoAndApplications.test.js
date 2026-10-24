import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatPersonalTasks } from '../src/commands/Utility/todo.js';

test('personal todo UI limits very long task lists', () => {
  const tasks = Array.from({ length: 24 }, (_, i) => ({
    id: i + 1, text: 'Task ' + i, createdAt: '2026-10-24T00:00:00.000Z', completed: i % 2 === 0,
  }));
  const text = formatPersonalTasks(tasks);
  assert.match(text, /4 more tasks/);
  assert.match(text, /Task 0/);
  assert.doesNotMatch(text, /Task 23/);
  assert.ok(text.length <= 3800);
});
test('staff application list never silently deletes records during member fetches', async () => {
  const source = await readFile('src/commands/Community/app-admin.js', 'utf8');
  const block = source.slice(source.indexOf('async function handleList'), source.indexOf('async function handleList') + 650);
  assert.doesNotMatch(block, /deleteApplication|members\.fetch/);
});
