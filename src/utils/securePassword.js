import { randomInt } from 'node:crypto';

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const NUMBERS = '0123456789';
const SYMBOLS = '!@#$%^&*()_+-=[]{}|;:,.<>?';

/** Use unbiased cryptographic randomness for every generated character. */
export function generateSecurePassword({ length = 16, uppercase = true, numbers = true, symbols = true } = {}) {
  if (!Number.isInteger(length) || length < 8 || length > 50) {
    throw new RangeError('Password length must be between 8 and 50.');
  }
  const groups = [LOWERCASE];
  if (uppercase) groups.push(UPPERCASE);
  if (numbers) groups.push(NUMBERS);
  if (symbols) groups.push(SYMBOLS);
  const alphabet = groups.join('');
  const chars = groups.map(group => group[randomInt(group.length)]);
  while (chars.length < length) chars.push(alphabet[randomInt(alphabet.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
