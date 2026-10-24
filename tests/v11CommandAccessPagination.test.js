import test from 'node:test';
import assert from 'node:assert/strict';
import { getCommandCategoryPage, buildCategoryComponents, COMMANDS_PER_PAGE } from '../src/commands/Core/modules/commands_dashboard.js';
import { buildCommandRegistry } from '../src/services/commandAccessService.js';

function fakeCategory(length) {
  const commands = Array.from({ length }, (_, i) => ({
    name: 'command' + i, protected: false, isSubcommand: false,
  }));
  return { key:'utility', displayName:'Utility', categoryDisabled:false, commands, enabledCommands:commands.map(c=>c.name) };
}

test('command access pages through all commands instead of hiding entries after 25', () => {
  const category = fakeCategory(53);
  const page0 = getCommandCategoryPage(category,0);
  const page2 = getCommandCategoryPage(category,2);
  assert.equal(COMMANDS_PER_PAGE,20);
  assert.equal(page0.items.length,20);
  assert.equal(page2.items.length,13);
  assert.equal(page2.totalPages,3);
  assert.equal(getCommandCategoryPage(category,99).currentPage,2);
  const rows = buildCategoryComponents('123456789012345678',category,1).map(row=>row.toJSON());
  assert.equal(rows[0].components[0].options.length,20);
  assert.ok(rows.at(-1).components.some(btn=>btn.custom_id.includes('cmdaccess_page:')));
});
test('hidden and legacy commands are excluded from command access registry', () => {
  const commands = new Map([
    ['live',{data:{name:'live',description:'Live',toJSON:()=>({})},category:'Core'}],
    ['legacy',{data:{name:'legacy',description:'Old',toJSON:()=>({})},category:'Core',legacyOnly:true}],
  ]);
  const registry = buildCommandRegistry({commands});
  const all = [...registry.values()].flatMap(c=>c.commands.map(x=>x.name));
  assert.deepEqual(all,['live']);
});
