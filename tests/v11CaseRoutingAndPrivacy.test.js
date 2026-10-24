import test from 'node:test';
import assert from 'node:assert/strict';
import { isCollectorManagedComponent } from '../src/utils/collectorComponents.js';
import { readFile } from 'node:fs/promises';
test('case browsing remains collector-managed, not a generic unknown button',()=>{
  for(const id of ['cases_pick','cases_next','cases_prev','cases_back']){
    assert.equal(isCollectorManagedComponent(id),true);
  }
});
test('case notes and evidence text are never echoed into public moderation audit events',async()=>{
  const src=await readFile('src/services/moderationCaseManager.js','utf8');
  assert.match(src,/details kept in private case history/);
  assert.doesNotMatch(src,/reason: operation \+ ': ' \+ text/);
});
