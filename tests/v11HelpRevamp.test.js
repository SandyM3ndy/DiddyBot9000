import test from 'node:test';
import assert from 'node:assert/strict';
import { SlashCommandBuilder, Collection } from 'discord.js';
import { createInitialHelpMenu, getHelpOverview } from '../src/commands/Core/help.js';
import { createCategoryCommandsMenu, createAllCommandsMenu } from '../src/handlers/help/helpSelectMenus.js';

function command(name, category, description, ownerOnly = false) {
  return { data: new SlashCommandBuilder().setName(name).setDescription(description), category, ownerOnly };
}
function mockClient() {
  const commands = new Collection();
  for (const item of [
    command('help', 'Core', 'Open help'),
    command('dashboard', 'Core', 'Configure your server'),
    command('diagnose', 'Utility', 'Check your server'),
    command('roleaudit', 'Moderation', 'Review roles'),
    command('ticketstats', 'Ticket', 'Support metrics'),
    command('restart', 'BotOwner', 'Bot Owner Only • Safely restart Beacon', true),
  ]) commands.set(item.data.name, item);
  return { commands, user: { username: 'Beacon', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' } };
}

test('revamped help home includes feature entry points and a category menu', async () => {
  const client = mockClient();
  const overview = getHelpOverview(client);
  assert.equal(overview.commands, 6);
  assert.equal(overview.categories.size, 5);
  const view = await createInitialHelpMenu(client);
  assert.equal(view.embeds.length, 1);
  const embed = view.embeds[0].toJSON();
  assert.match(embed.title, /Command Center/);
  assert.match(JSON.stringify(embed.fields), /diagnose/);
  const select = view.components[1].toJSON().components[0];
  assert.ok(select.options.some(o => o.value === 'BotOwner'));
  assert.ok(select.options.some(o => o.value === 'help-all-commands'));
  assert.ok(select.options.length <= 25);
});

test('category pages show access and do not strip owner restrictions', async () => {
  const client = mockClient();
  const view = await createCategoryCommandsMenu('BotOwner', client);
  const fields = view.embeds[0].toJSON().fields;
  assert.equal(fields.length, 1);
  assert.match(fields[0].value, /Bot Owner Only/);
  assert.match(fields[0].name, /restart/);
});

test('all commands view includes administrator tools', async () => {
  const client = mockClient();
  const view = await createAllCommandsMenu(1, client);
  const content = JSON.stringify(view.embeds[0].toJSON());
  assert.match(content, /diagnose/);
  assert.match(content, /ticketstats/);
  assert.match(content, /roleaudit/);
});
