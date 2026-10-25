import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getRegisteredCommands, createHelpQuickStartMenu } from '../src/handlers/help/helpSelectMenus.js';

test('Quick Start tells users to run a real ticket setup subcommand',()=>{
 const guide=createHelpQuickStartMenu().embeds[0].toJSON();
 const content=JSON.stringify(guide);
 assert.match(content,/\/ticket panel/);
 assert.doesNotMatch(content,/\/ticket dashboard/);
});

test('public feature overview does not advertise removed economy or birthday commands',async()=>{
 const readme=await readFile('README.md','utf8');
 const start=readme.indexOf('## Features Overview');
 const end=readme.indexOf('## Quick Setup',start);
 const description=readme.slice(start,end);
 assert.ok(start>=0 && end>start);
 assert.match(description,/Your community|Server Progression/i);
 assert.match(description,/Ticket Command Center/);
 assert.doesNotMatch(description,/### Economy System|### Birthday System|Wanted Poster/);
});

test('registered slash command cache enables instant direct links and avoids redundant Discord fetches',async()=>{
 let fetches=0;
 const client={application:{commands:{fetch:async()=>{
  fetches++;
  return new Map([['ticket',{id:'123456789012345678',name:'ticket'}]]);
 }}}};
 const first=await getRegisteredCommands(client);
 assert.equal(first.get('ticket').id,'123456789012345678');
 const second=await getRegisteredCommands(client);
 assert.equal(second.get('ticket').id,'123456789012345678');
 assert.equal(fetches,1);
});
