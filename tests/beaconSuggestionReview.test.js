import test from 'node:test';
import assert from 'node:assert/strict';
import {
  suggestionKey,renderSuggestionPost,createSuggestionRecord,getSuggestionRecord,
  changeSuggestionStatus,attachSuggestionMessage,
} from '../src/services/suggestionReviewService.js';

function mockClient(store=new Map()){
  return {db:{
    async get(key,fallback=null){return store.has(key)?structuredClone(store.get(key)):fallback;},
    async set(key,value){store.set(key,structuredClone(value));return true;},
  }};
}
const guildId='111111111111111111',id='222222222222222222',messageId='333333333333333333';
function initial(){return {id,guildId,channelId:'444444444444444444',authorId:'555555555555555555',
  idea:'More game nights',status:'under_review',createdAt:'2026-10-25T12:00:00.000Z',reviewedBy:null,messageId:null};}

test('suggestion review records and decisions survive simulated restarts',async()=>{
  const store=new Map();
  const before=mockClient(store);
  await createSuggestionRecord(before,initial());
  await attachSuggestionMessage(before,guildId,id,messageId);
  const after=mockClient(store);
  const change=await changeSuggestionStatus(after,guildId,id,'accepted','666666666666666666');
  assert.equal(change.status,'accepted');
  assert.equal(change.messageId,messageId);
  const restart=await getSuggestionRecord(mockClient(store),guildId,id);
  assert.equal(restart.status,'accepted');
  assert.equal(restart.reviewedBy,'666666666666666666');
  const view=renderSuggestionPost(restart);
  assert.match(JSON.stringify(view.embeds[0].toJSON()),/Accepted/);
  assert.equal(view.components[0].toJSON().components[0].custom_id,'suggest_review:'+id);
  assert.deepEqual(view.allowedMentions,{parse:[]});
});

test('suggestion storage failures do not report false success',async()=>{
  const client=mockClient();
  client.db.set=async()=>false;
  await assert.rejects(()=>createSuggestionRecord(client,initial()),/rejected/);
  await assert.rejects(()=>changeSuggestionStatus(client,guildId,id,'accepted','666666666666666666'),/not saved/);
});

test('review rejects invalid transitions and malformed IDs',async()=>{
  const client=mockClient();
  await createSuggestionRecord(client,initial());
  await assert.rejects(()=>changeSuggestionStatus(client,guildId,id,'invalid','666666666666666666'),/Invalid/);
  await assert.rejects(()=>getSuggestionRecord(client,guildId,'bogus'),/Invalid/);
  assert.equal(suggestionKey(guildId,id),'guild:'+guildId+':suggestion:'+id);
});

test('suggestion preview never includes untrusted mentions without escaping',()=>{
  const state=initial();state.idea='Hi @everyone — come vote';
  const serialized=renderSuggestionPost(state).embeds[0].toJSON();
  assert.doesNotMatch(serialized.description,/@everyone/);
  assert.match(serialized.description,/everyone/);
});
