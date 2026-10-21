import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSecurePassword } from '../src/utils/securePassword.js';

test('default: 16 chars with every class included', () => {
  for (let i = 0; i < 100; i++) {
    const value = generateSecurePassword();
    assert.equal(value.length, 16);
    assert.match(value, /[a-z]/);
    assert.match(value, /[A-Z]/);
    assert.match(value, /[0-9]/);
    assert.match(value, /[^a-zA-Z0-9]/);
  }
});
test('excluded classes are never generated', () => {
  for (let i = 0; i < 100; i++) {
    const value = generateSecurePassword({ length: 8, uppercase: false, numbers: false, symbols: false });
    assert.match(value, /^[a-z]{8}$/);
  }
});
test('custom character classes and 50 chars', () => {
  for (let i = 0; i < 100; i++) {
    const value = generateSecurePassword({ length: 50, uppercase: true, numbers: true, symbols: false });
    assert.equal(value.length, 50);
    assert.match(value, /[a-z]/);
    assert.match(value, /[A-Z]/);
    assert.match(value, /[0-9]/);
    assert.doesNotMatch(value, /[^a-zA-Z0-9]/);
  }
});
test('invalid lengths rejected', () => {
  for (const length of [0, 7, 51, 2.5, NaN]) assert.throws(() => generateSecurePassword({ length }), RangeError);
});
test('outputs differ', () => {
  const passwords = Array.from({ length: 100 }, () => generateSecurePassword());
  assert.equal(new Set(passwords).size, passwords.length);
});
