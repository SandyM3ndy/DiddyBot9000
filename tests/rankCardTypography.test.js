import test from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { renderProgressionRankPng,RANK_CARD_COSMETIC_LAYOUT } from '../src/utils/progressionRankCard.js';

// Decode pixels directly so a missing thousands-separator glyph cannot be
// replaced with the '?' glyph without breaking the test.
function unpackPng(buffer){
 assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);
 const chunks=[];
 for(let offset=8;offset<buffer.length;){
  const length=buffer.readUInt32BE(offset);
  const kind=buffer.subarray(offset+4,offset+8).toString('ascii');
  if(kind==='IDAT')chunks.push(buffer.subarray(offset+8,offset+8+length));
  offset+=12+length;
 }
 const scan=inflateSync(Buffer.concat(chunks));
 return (x,y)=>{
  assert.ok(x>=0&&x<width&&y>=0&&y<height);
  const row=y*(1+width*4);
  assert.equal(scan[row],0,'the renderer writes unfiltered PNG scanlines');
  return [...scan.subarray(row+1+x*4,row+1+x*4+3)];
 };
}

test('XP thousands separators render actual commas instead of question marks',()=>{
 const basics={name:'SAND CASTLE',rank:1,level:4,progress:45,fastPreview:true};
 const baseline=unpackPng(renderProgressionRankPng({...basics,xp:1}));
 const withCommas=unpackPng(renderProgressionRankPng({...basics,xp:1000000}));
 // The XP label is drawn at (646, 413), 4px scale, 24px advance per glyph.
 // "1,000,000" has commas at glyph indices 1 and 5.
 for(const index of [1,5]){
  const x=646+index*24;
  // A comma has ink only in its last two rows.
  assert.deepEqual(withCommas(x+4,413+1),baseline(x+4,413+1),
   'comma must not have question-mark ink at the top');
  assert.notDeepEqual(withCommas(x+8,413+5*4+1),baseline(x+8,413+5*4+1),
   'comma must have visible ink near the baseline');
  assert.deepEqual(withCommas(x+8,413+5*4+1),[246,250,255],
   'comma must use the same high-contrast white as the XP digits');
 }
});


test('default Beacon card uses teal and cyan with a restrained gold mark; purchased galaxy stays purple',()=>{
 const input={name:'SAND CASTLE',rank:3,level:7,xp:4000,progress:50,fastPreview:true};
 const branded=unpackPng(renderProgressionRankPng(input));
 const galaxy=unpackPng(renderProgressionRankPng({...input,appearance:{background:'galaxy'}}));
 const teal=branded(5,5),purple=galaxy(5,5);
 assert.ok(teal[1]>teal[0]+10&&teal[2]>teal[0]+10,'Unpurchased card background is dark teal');
 assert.ok(purple[2]>purple[1]+14,'Purchased galaxy background retains its blue-violet tone');
 assert.notDeepEqual(teal,purple);
 const gold=branded(346,76);
 assert.ok(gold[0]>gold[1]&&gold[1]>gold[2]&&gold[0]>140,
  'The approved gold accent is visible beside the Beacon wordmark');
});

test('Royal Sands and Pioneer occupy a dedicated nameplate zone with no Founder overlap',()=>{
 const {founder,nameTag}=RANK_CARD_COSMETIC_LAYOUT;
 assert.ok(founder.y+founder.height+25<nameTag.y,
  'Founder credential and cosmetic nameplate must have substantial breathing room');
 assert.ok(nameTag.y>245+7*4+10,'nameplate must be below the server name glyphs');
 assert.ok(nameTag.y+nameTag.height<351,'nameplate must not touch the XP progress rail');
 assert.ok(nameTag.x+nameTag.width<646,'nameplate must leave room beside the XP value section');
 const basics={name:'A VERY LONG ROYAL SANDBOX',rank:1,level:14,xp:48500,progress:74,
  appearance:{background:'galaxy',border:'gold'},fastPreview:true};
 for(const tag of ['royal','pioneer']){
  const clean=unpackPng(renderProgressionRankPng(basics));
  const withFounder=unpackPng(renderProgressionRankPng({...basics,founder:{number:10}}));
  const withTag=unpackPng(renderProgressionRankPng({...basics,appearance:{...basics.appearance,tag}}));
  const both=unpackPng(renderProgressionRankPng({...basics,founder:{number:10},
   appearance:{...basics.appearance,tag}}));
  // Both decorations must remain identical to their solo versions when paired.
  for(const [x,y] of [[747,82],[820,106],[914,115]]){
   assert.deepEqual(both(x,y),withFounder(x,y),'Founder badge must be unobstructed by '+tag);
  }
  for(const [x,y] of [[248,295],[301,308],[543,326]]){
   assert.deepEqual(both(x,y),withTag(x,y),'nameplate must be unobstructed by Founder badge');
  }
  assert.notDeepEqual(both(260,297),clean(260,297),'cosmetic must be clearly drawn');
  assert.notDeepEqual(both(745,75),clean(745,75),'Founder badge must be clearly drawn');
  assert.deepEqual(both(244,247),clean(244,247),'name text must not be overwritten');
  assert.deepEqual(both(350,355),clean(350,355),'XP bar must not be overwritten');
 }
});
