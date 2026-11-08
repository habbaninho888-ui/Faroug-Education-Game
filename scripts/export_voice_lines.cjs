// Exact spoken lines used by the game. Does not include Quran recitation.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sandbox = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), sandbox);
const content = sandbox.window.GALAXY_CONTENT;
vm.runInNewContext(fs.readFileSync(path.join(root, 'feedback.js'), 'utf8'), sandbox);
const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const worldSource = source.match(/const WORLDS=(.*);\nconst KEY=/s)[1];
const worlds = vm.runInNewContext('(' + worldSource + ')');
const lines = new Map();
function add(text, lang) {
  const normalized = text.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const key = lang + '|' + normalized;
  if (!lines.has(key)) lines.set(key, {key, text:normalized, lang, id:crypto.createHash('sha256').update(key).digest('hex').slice(0,20)});
}
content.questions.forEach(q => [q.spoken || q.prompt, q.hint, q.explanation].forEach(t => add(t, q.lang)));
content.words.forEach(w => add(w.word, 'en'));
Object.entries(worlds).forEach(([id,w]) => add(w.say, id === 'arabic' ? 'ar' : 'en'));
add('Hello, explorer! I’m Nova. Let’s make a little discovery together.', 'en');
add('مرحبًا يا صديقي. هيا نتعلم معًا.', 'ar');
Object.entries(sandbox.window.GALAXY_CHEERS).forEach(([lang,groups]) => Object.values(groups).flat().forEach(text=>add(text,lang)));
const out = path.join(root, 'voice-lines.json');
fs.writeFileSync(out, JSON.stringify([...lines.values()], null, 2));
console.log(`Exported ${lines.size} exact narration lines to ${out}.`);
