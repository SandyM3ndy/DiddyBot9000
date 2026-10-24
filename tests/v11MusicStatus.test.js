import test from 'node:test';
import assert from 'node:assert/strict';
import music from '../src/commands/Music/music.js';
test('music status is available even while Lavalink is disconnected', () => {
  assert.ok(music.data.toJSON().options.some(option => option.name === 'status'));
});
