import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpamTracker } from '../src/utils/autoModSpamTracker.js';

test('duplicate messages trigger spam protection on third message', () => {
  const tracker = createSpamTracker();
  const message = { guildId: '1', userId: '2', content: 'HELLO', now: 1000 };
  assert.equal(tracker.inspect(message), null);
  assert.equal(tracker.inspect({ ...message, content: 'hello', now: 2000 }), null);
  assert.match(tracker.inspect({ ...message, now: 3000 }), /repeated messages/);
});

test('fast messaging and excessive mentions are detected', () => {
  const tracker = createSpamTracker();
  for (let i = 0; i < 5; i++) {
    assert.equal(tracker.inspect({ guildId: '1', userId: '2', content: String(i), now: 1000 + i }), null);
  }
  assert.match(tracker.inspect({ guildId: '1', userId: '2', content: 'last', now: 1005 }), /too many messages/);
  assert.match(tracker.inspect({ guildId: '1', userId: '3', content: 'x', mentionCount: 6, now: 1005 }), /excessive mentions/);
});

test('spam is isolated by guild and stale user histories are swept', () => {
  const tracker = createSpamTracker();
  for (const guildId of ['one', 'two']) {
    assert.equal(tracker.inspect({ guildId, userId: 'same', content: 'hi', now: 1000 }), null);
  }
  assert.equal(tracker.trackedUsers, 2);
  assert.equal(tracker.inspect({ guildId: 'three', userId: 'new', content: 'hi', now: 62_000 }), null);
  assert.equal(tracker.trackedUsers, 1);
});

test('messages outside the sliding window do not count as duplicates', () => {
  const tracker = createSpamTracker();
  tracker.inspect({ guildId: '1', userId: '2', content: 'a', now: 1000 });
  tracker.inspect({ guildId: '1', userId: '2', content: 'a', now: 2000 });
  assert.equal(tracker.inspect({ guildId: '1', userId: '2', content: 'a', now: 13_001 }), null);
});
