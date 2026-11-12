const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
require('../scripts/export_voice_lines.cjs');
const corpus = JSON.parse(fs.readFileSync(path.join(root,'voice-lines.json')));
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'voice-pack.js'),'utf8'),sandbox);
const pack = sandbox.window.GALAXY_VOICE_PACK;
assert.equal(pack.version,1);
assert(pack.voices.en && pack.voices.ar);
const missing=[];
for(const line of corpus) {
  const audio = pack.clips[line.key];
  if(!audio){missing.push(line.key);continue;}
  assert(audio.startsWith('data:audio/mpeg;base64,'),line.key);
  const bytes = Buffer.from(audio.split(',')[1],'base64');
  assert(bytes.length>500,line.key);
  assert(bytes.subarray(0,3).toString()==='ID3'||bytes[0]===255,line.key);
  assert(fs.existsSync(path.join(root,'assets/narration',line.id+'.mp3')),line.id);
}
assert.deepEqual(missing,[],'All live game narration must have a bundled clip');
console.log(`PASS all ${corpus.length} live narration lines have embedded MP3 audio, including ${corpus.filter(x=>x.lang==='ar').length} Arabic clips.`);
