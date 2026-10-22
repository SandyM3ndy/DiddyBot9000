import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMassActionTargets } from '../src/utils/moderation/massActionTargets.js';

test('parses IDs, mentions and mixed separators', () => {
  assert.deepEqual(parseMassActionTargets('12345678901234567, <@123456789012345678> <@!1234567890123456789>'), [
    '12345678901234567', '123456789012345678', '1234567890123456789'
  ]);
});
test('deduplicates a target across IDs and mentions', () => {
  assert.deepEqual(parseMassActionTargets('123456789012345678 <@123456789012345678>'), ['123456789012345678']);
});
test('rejects malformed targets explicitly', () => {
  for (const raw of ['', 'hello', '1234', '123456789012345678 bad', '<@&123456789012345678>'])
    assert.throws(() => parseMassActionTargets(raw));
});
test('rejects an operation with more than 20 unique targets', () => {
  const ids = Array.from({ length: 21 }, (_, i) => String(123456789012345678n + BigInt(i)));
  assert.throws(() => parseMassActionTargets(ids.join(',')), /at most 20/);
});
