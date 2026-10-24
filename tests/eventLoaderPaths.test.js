import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toEventImportUrl } from '../src/handlers/loaders/events.js';

test('event loader encodes special characters in file paths', () => {
  const localPath = resolve('fake path', 'guild#join%event.js');
  const url = toEventImportUrl(localPath);
  assert.match(url, /^file:\/\//);
  assert.match(url, /guild%23join%25event\.js$/);
  assert.equal(fileURLToPath(url), localPath);
});
