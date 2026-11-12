// Data integrity checks. The publisher text is preserved; this is not text certification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
global.window = {};
require('../quran-data.js');
require('../content.js');
const {surahs,source}=window.QURAN_DATA;
assert.equal(surahs.length,114);
assert.deepEqual(surahs.map(s=>s.number),Array.from({length:114},(_,i)=>i+1));
const counts=[7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6];
assert.deepEqual(surahs.map(s=>s.count),counts,'Standard Hafs chapter counts');
assert.equal(surahs.reduce((n,s)=>n+s.count,0),6236);
for(const s of surahs){
  assert(s.title && s.english,`Names for ${s.number}`);
  assert.equal(s.verses.length,s.count,`Chapter ${s.number}`);
  for(const verse of s.verses)assert(verse && /[\u0600-\u06ff]/.test(verse),`Arabic text: ${s.number}`);
}
// The old last-three-surah bank uses a different diacritic/orthographic presentation.
const normalize=s=>s.normalize('NFKD').replace(/\u0670/g,'ا').replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g,'').replace(/ٱ/g,'ا').replace(/\s+/g,' ').trim();
for(const old of window.GALAXY_CONTENT.surahs){
  const fresh=surahs.find(s=>s.number===old.number);
  assert.deepEqual(fresh.verses.map(normalize),old.verses.map(normalize),`Same words as original surah ${old.number}`);
}
assert.equal(source.license,'CC-BY-SA-4.0');
assert.match(source.url,/v3\.1\.2$/);
assert.match(source.sha256,/^[0-9a-f]{64}$/);
assert(fs.existsSync(path.join(__dirname,'../assets/quran/Quran-JSON-CC-BY-SA-4.0.txt')));
assert(fs.statSync(path.join(__dirname,'../quran-data.js')).size<2*1024*1024);
console.log('PASS: 114 offline chapters, 6,236 Hafs verses, chapter counts, original last-three-surah word equivalence, pinned source and license.');
