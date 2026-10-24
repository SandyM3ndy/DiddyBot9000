import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MessageFlags } from 'discord.js';
import { getMusicDeferOptions } from '../src/services/music/prefixSupport.js';
import help from '../src/commands/Core/help.js';
import userinfo from '../src/commands/Utility/userinfo.js';

const read = name => readFile(name,'utf8');

test('all music commands, including service status, use public replies', () => {
  assert.deepEqual(getMusicDeferOptions({ commandName:'music', options:{ getSubcommand:()=> 'skip' } }), {});
  assert.deepEqual(getMusicDeferOptions({ commandName:'join', options:{} }), {});
  assert.deepEqual(getMusicDeferOptions({ commandName:'nowplaying', options:{} }), {});
  assert.deepEqual(getMusicDeferOptions({ commandName:'music', options:{ getSubcommand:()=> 'status' } }), {});
});

test('help and user profile offer opt-in privacy, not forced ephemeral replies', () => {
  for (const command of [help,userinfo]) {
    const option = command.data.toJSON().options.find(o=>o.name==='private');
    assert.equal(option.type,5);
    assert.equal(option.required,false);
  }
});

test('public command response paths do not use private deferrals', async () => {
  const targets=[
    'src/commands/Music/play.js',
    'src/commands/Music/queue.js',
    'src/commands/Community/progression.js',
    'src/commands/Tools/time.js',
    'src/commands/Tools/unixtime.js',
  ];
  const sources=await Promise.all(targets.map(read));
  for(let i=0;i<targets.length;i++){
    assert.doesNotMatch(sources[i], /deferOptions:\s*\{\s*flags:\s*MessageFlags\.Ephemeral/,targets[i]);
    if(/\/Music\/(play|queue)\.js$/.test(targets[i])){
      assert.match(sources[i],/safeDefer\(interaction\)/,targets[i]);
    }
  }
});

test('counting displays public views but keeps changes private', async () => {
  const s=await read('src/commands/Fun/count.js');
  assert.match(s,/subcommand === 'status' \|\| subcommand === 'leaderboard'/);
  assert.match(s,/publicView \? \{\} : \{ flags: MessageFlags\.Ephemeral \}/);
});

test('sensitive moderation, cases, dashboards and personal to-dos stay private', async () => {
  const targets=[
    'src/commands/Moderation/cases.js',
    'src/commands/Core/dashboard.js',
    'src/commands/Utility/diagnose.js',
    'src/commands/Ticket/modules/ticketActions.js',
    'src/commands/Utility/todo.js',
  ];
  const [cases,dashboard,diagnose,tickets,todo]=await Promise.all(targets.map(read));
  for(const [i,s] of [cases,dashboard,diagnose,tickets].entries()){
    assert.match(s,/MessageFlags\.Ephemeral/,targets[i]);
  }
  assert.match(todo,/safeDefer\(interaction,\s*\{ flags: MessageFlags\.Ephemeral \}\)/);
});

test('public system status never publishes bot owner failure diagnostics', async () => {
  const src=await read('src/commands/Core/status.js');
  assert.match(src,/if \(owner && !dbReady && pg\?\.getLastFailure\)/);
  assert.match(src,/privateOwnerDiagnostics = owner && !dbReady/);
  assert.match(src,/privateOwnerDiagnostics \? \{ flags: MessageFlags\.Ephemeral \} : \{\}/);
});

test('public help remains a readable menu and private help stays opt-in',async()=>{
  const src=await read('src/commands/Core/help.js');
  assert.match(src,/privateView \? \{ flags: MessageFlags\.Ephemeral \} : \{\}/);
  assert.doesNotMatch(src,/Command Center • Private search/);
});


test('verification and cleanup results are public by default with private overrides', async () => {
  const verify = (await import('../src/commands/Verification/verify.js')).default;
  const purge = (await import('../src/commands/Moderation/purge.js')).default;
  for (const command of [verify, purge]) {
    assert.equal(command.data.toJSON().options.find(o => o.name === 'private')?.type, 5);
  }
  for (const path of ['src/commands/Verification/verify.js','src/commands/Moderation/purge.js']) {
    const code = await read(path);
    assert.match(code, /privateView \? \{ flags: MessageFlags\.Ephemeral \} : \{\}/);
  }
  const source = await read('src/commands/Moderation/purge.js');
  assert.match(source, /message\.id !== ownReply\?\.id/);
});


test('polls and suggestions use a single public command response instead of a private duplicate', async () => {
  for (const path of ['src/commands/Community/poll.js', 'src/commands/Community/suggest.js']) {
    const code = await read(path);
    assert.match(code, /safeDefer\(interaction\)/);
    assert.doesNotMatch(code, /channel\.send\(\{ embeds: \[embed\]/);
    assert.match(code, /interaction\.fetchReply\(\)/);
    assert.match(code, /safeEditReply\(interaction, \{\s*embeds: \[embed\]/);
  }
});
