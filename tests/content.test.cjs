// Structural integrity checks for the learning bank; no dependencies.
const assert = require('node:assert/strict');
global.window = {};
require('../content.js');
const {questions, words, surahs} = window.GALAXY_CONTENT;
const ids = new Set();
for (const q of questions) {
  assert(!ids.has(q.id), `Duplicate question: ${q.id}`); ids.add(q.id);
  assert(['letters','numbers','arabic','discovery'].includes(q.world));
  assert([1,2,3].includes(q.level));
  assert.equal(new Set(q.choices).size, q.choices.length, q.id);
  assert(q.choices.length >= 2 && q.choices.length <= 4, q.id);
  assert(q.choices.includes(q.answer), q.id);
  assert(q.prompt && q.hint && q.explanation && q.visual, q.id);
  if(q.visual.type === 'dots') assert(Number.isInteger(Number(q.visual.value)) && q.visual.value >= 0 && q.visual.value <= 10, q.id);
}
for (const w of words) assert.equal(w.letters.join(''), w.word);
assert.deepEqual(surahs.map(s=>s.number), [112,113,114]);
assert.deepEqual(surahs.map(s=>s.verses.length), [4,5,6]);
console.log(`PASS: ${questions.length} valid questions, ${words.length} builder words, ${surahs.length} short-surah structures. Text certification is outside this structural check.`);
