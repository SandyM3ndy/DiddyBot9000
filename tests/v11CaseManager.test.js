import test from 'node:test';
import assert from 'node:assert/strict';
import cases, { buildCaseDetail, buildCaseListPage } from '../src/commands/Moderation/cases.js';
import { normalizeCase } from '../src/services/moderationCaseManager.js';
test('new case suite has list, view, status, note and evidence',()=>{
  const names=cases.data.toJSON().options.map(x=>x.name);
  assert.deepEqual(names,['list','view','status','note','evidence','warnings','warn','notes-add','notes-view','notes-remove','notes-clear']);
});
test('old moderation cases retain their action and get safe default review metadata',()=>{
  const record=normalizeCase({caseId:7,action:'Member Kicked',target:'Example',reason:'Test'});
  assert.equal(record.review.status,'open');
  assert.equal(record.review.notes.length,0);
  assert.match(buildCaseDetail(record).toJSON().title,/#7/);
});
test('case list never exceeds Discord selection limits',()=>{
  const records=Array.from({length:23},(_,i)=>({caseId:i+1,action:'User Warned',reason:'test',createdAt:'2026-10-24T09:00:00Z'}));
  const page=buildCaseListPage(records,'Guild',3);
  assert.equal(page.page,3);
  assert.equal(page.components[0].toJSON().components[0].options.length,5);
});
