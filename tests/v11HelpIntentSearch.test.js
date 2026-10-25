import test from 'node:test';
import assert from 'node:assert/strict';
import { SlashCommandBuilder } from 'discord.js';
import { searchBeaconCommands } from '../src/commands/Core/help.js';

function fakeClient() {
  const ticket = new SlashCommandBuilder().setName('ticket')
    .setDescription('Manage support requests')
    .addSubcommand(sub=>sub.setName('queue').setDescription('Browse open support tickets'))
    .addSubcommand(sub=>sub.setName('transcript').setDescription('Export a ticket transcript'));
  const progression = new SlashCommandBuilder().setName('progression')
    .setDescription('Community XP and server rankings')
    .addSubcommand(sub=>sub.setName('quests').setDescription('View daily challenges'))
    .addSubcommand(sub=>sub.setName('weekly').setDescription('View weekly challenges'))
    .addSubcommand(sub=>sub.setName('leaderboard').setDescription('Browse world rankings'));
  const roles = new SlashCommandBuilder().setName('reactroles')
    .setDescription('Create self assignable role panels')
    .addSubcommand(sub=>sub.setName('studio').setDescription('Preview and edit panel'));
  return {commands:new Map([
    ['ticket',{data:ticket,category:'Ticket'}],
    ['progression',{data:progression,category:'Community'}],
    ['reactroles',{data:roles,category:'Reaction_roles'}],
    ['old',{data:{name:'old',description:'Old legacy command'},category:'Core',legacyOnly:true}],
  ])};
}

test('natural-language help finds the correct concrete installed subcommands',()=>{
 const client=fakeClient();
 assert.equal(searchBeaconCommands(client,'support queue')[0].name,'ticket queue');
 assert.equal(searchBeaconCommands(client,'daily goals')[0].name,'progression quests');
 assert.equal(searchBeaconCommands(client,'weekly challenges')[0].name,'progression weekly');
 assert.equal(searchBeaconCommands(client,'reaction roles')[0].baseName,'reactroles');
 assert.equal(searchBeaconCommands(client,'ticket transcript')[0].name,'ticket transcript');
});

test('help intent search does not advertise unloaded commands or deprecated ones',()=>{
 const client=fakeClient();
 assert.deepEqual(searchBeaconCommands(client,'economy'),[]);
 assert.deepEqual(searchBeaconCommands(client,'old legacy'),[]);
 assert.ok(searchBeaconCommands(client,'/ticket queue').length>0);
 assert.deepEqual(searchBeaconCommands(client,'  '),[]);
});

test('exact command names outrank semantic suggestions',()=>{
 const client=fakeClient();
 const results=searchBeaconCommands(client,'progression quests');
 assert.equal(results[0].name,'progression quests');
 assert.ok(results.every(row=>row.name && row.description && row.category));
});
