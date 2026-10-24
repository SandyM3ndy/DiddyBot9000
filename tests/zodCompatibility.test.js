import test from 'node:test';
import assert from 'node:assert/strict';
import { GuildConfigSchema, EconomyDataSchema, LoggingConfigSchema } from '../src/utils/schemas.js';

test('guild config accepts keyed flags with Zod explicit string-key records', () => {
  const parsed = GuildConfigSchema.safeParse({
    disabledCommands: { ban: true, ping: false },
    disabledCategories: { Moderation: true },
    logging: { enabled: true, enabledEvents: { guildMemberAdd: true } },
  });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  assert.equal(parsed.data.disabledCommands.ban, true);
  assert.equal(parsed.data.logging.enabledEvents.guildMemberAdd, true);
});

test('economy schema supports dynamic inventory and cooldown keys', () => {
  const parsed = EconomyDataSchema.safeParse({
    inventory: { sword: { quantity: 1 } },
    cooldowns: { daily: 120 },
  });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
  assert.equal(parsed.data.cooldowns.daily, 120);
});

test('invalid record values are rejected', () => {
  assert.equal(LoggingConfigSchema.safeParse({ enabledEvents: { welcome: 'yes' } }).success, false);
  assert.equal(EconomyDataSchema.safeParse({ cooldowns: { daily: -1 } }).success, false);
});
