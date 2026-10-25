import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EIGHT_BALL_ANSWERS, safeGameText, pick8BallAnswer, build8BallPayload,
  resolveRps, buildRpsChoicePayload, buildRpsResultPayload,
} from '../src/services/funGamesService.js';
import eightBall from '../src/commands/Fun/8ball.js';
import rps from '../src/commands/Fun/rps.js';
import handlers from '../src/interactions/buttons/funGames.js';
import { loadCommands } from '../src/handlers/loaders/commandLoader.js';

const player='111111111111111111';

test('8-ball questions are mention-safe and buttons are bound to the original player',()=>{
  assert.ok(EIGHT_BALL_ANSWERS.length>=12);
  assert.equal(pick8BallAnswer(()=>0),EIGHT_BALL_ANSWERS[0]);
  const view=build8BallPayload('@everyone should we start the party?',player,()=>1);
  const embedded=view.embeds[0].toJSON();
  assert.match(embedded.title,/Magic 8-Ball/);
  assert.doesNotMatch(embedded.fields[0].value,/@everyone/);
  assert.match(embedded.fields[0].value,/everyone/);
  assert.equal(view.components[0].toJSON().components[0].custom_id,'fun_8ball_again:'+player);
  assert.deepEqual(view.allowedMentions,{parse:[]});
  assert.equal(safeGameText('Hi\n\tthere'),'Hi there');
  assert.throws(()=>build8BallPayload(' ',player),/Invalid/);
});

test('rock paper scissors scores all nine possible outcomes correctly',()=>{
  const moves=['rock','paper','scissors'];
  const expected=[
    ['draw','lose','win'],
    ['win','draw','lose'],
    ['lose','win','draw'],
  ];
  moves.forEach((playerMove,i)=>moves.forEach((_,j)=>{
    assert.equal(resolveRps(playerMove,()=>j).outcome,expected[i][j]);
  }));
  assert.throws(()=>resolveRps('lizard',()=>0),/Unknown/);
});

test('RPS has three interactive moves, result and a restart-safe replay control',()=>{
  const choice=buildRpsChoicePayload(player);
  const ids=choice.components[0].toJSON().components.map(c=>c.custom_id);
  assert.deepEqual(ids, ['fun_rps:rock:'+player,'fun_rps:paper:'+player,'fun_rps:scissors:'+player]);
  const result=buildRpsResultPayload(player,'paper',()=>0);
  assert.match(result.embeds[0].toJSON().description,/You win/);
  assert.equal(result.components[0].toJSON().components[0].custom_id,'fun_rps:again:'+player);
  assert.deepEqual(result.allowedMentions,{parse:[]});
});

test('new slash commands default to public with private opt-in and registered handlers',()=>{
  assert.equal(eightBall.data.toJSON().name,'8ball');
  assert.equal(rps.data.toJSON().name,'rps');
  for(const command of [eightBall,rps]){
    assert.equal(command.category,'Fun');
    const options=command.data.toJSON().options;
    assert.ok(options.some(x=>x.name==='private' && x.required!==true));
  }
  assert.deepEqual(handlers.map(x=>x.name),['fun_8ball_again','fun_rps']);
});

test('RPS round-trips via actual Discord button handlers without state or collectors',async()=>{
  const sent=[];
  const playerInteraction={
    user:{id:player},
    update:async(payload)=>{sent.push(payload);return true;},
  };
  await handlers[1].execute(playerInteraction,null,['rock',player]);
  assert.match(sent[0].embeds[0].toJSON().description,/Beacon/);
  await handlers[1].execute(playerInteraction,null,['again',player]);
  assert.equal(sent[1].components[0].toJSON().components.length,3);
});

test('maintained slash commands are not still silently hidden by the loader',async()=>{
  const loader=await readFile('src/handlers/loaders/commandLoader.js','utf8');
  const hidden=loader.split('const HIDDEN_COMMANDS = new Set([')[1].split(']);')[0];
  const legacy=loader.split('export const LEGACY_SLASH_COMMANDS = new Set([')[1].split(']);')[0];
  for(const name of ['reactroles','firstmsg','8ball','rps']){
    assert.ok(!new RegExp("'"+name+"'").test(hidden),name+' is hidden from the loader');
    assert.ok(!new RegExp("'"+name+"'").test(legacy),name+' is legacy-only');
  }
  assert.equal(typeof loadCommands,'function');
});
