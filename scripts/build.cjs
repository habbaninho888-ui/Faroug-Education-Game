const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const app = path.join(root, 'app');
fs.copyFileSync(path.join(root,'node_modules/@capacitor/core/dist/capacitor.js'),path.join(app,'capacitor-runtime.js'));
fs.copyFileSync(path.join(root,'node_modules/@capacitor/core/LICENSE'),path.join(app,'licenses/Capacitor-MIT.txt'));
const cues = vm.runInNewContext('(' + fs.readFileSync(path.join(app,'runner.js'),'utf8').match(/const cues = (\{[\s\S]*?\n    \});/)[1] + ')');
const lines = [...new Set(Object.values(cues).flatMap(v => v.flatMap((phrases,i)=>phrases.map(text=>(i?'ar':'en')+'|'+text.normalize('NFKC').trim()))))];
fs.writeFileSync(path.join(app,'runner-lines.js'),'window.GALAXY_RUNNER_LINES = '+JSON.stringify(lines,null,2)+';\n');
const files = fs.readdirSync(app,{recursive:true}).filter(name=>fs.statSync(path.join(app,name)).isFile() && name !== 'sw.js');
const version = crypto.createHash('sha256');
files.forEach(name=>version.update(fs.readFileSync(path.join(app,name))));
const cache = 'galaxy-v2-'+version.digest('hex').slice(0,12);
fs.writeFileSync(path.join(app,'sw.js'),`const CACHE=${JSON.stringify(cache)};
const FILES=${JSON.stringify(['./',...files.map(f=>'./'+f)])};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('galaxy-v2-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});
`);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.cpSync(app,path.join(root,'dist'),{recursive:true});
let standalone=fs.readFileSync(path.join(app,'index.html'),'utf8');
standalone=standalone.replace(/<script src="([^"]+)"><\/script>/g,(_,file)=>'<script>\n'+fs.readFileSync(path.join(app,file),'utf8').replace(/<\/script/gi,'<\\/script')+'\n</script>');
standalone=standalone.replace(/<link rel="stylesheet" href="([^"]+)">/g,(_,file)=>'<style>'+fs.readFileSync(path.join(app,file),'utf8')+'</style>');
fs.mkdirSync(path.join(root,'artifacts'),{recursive:true});
fs.writeFileSync(path.join(root,'artifacts','Farougs-Learning-Galaxy.html'),standalone);
const voiceContext={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(app,'voice-pack.js'),'utf8'),voiceContext);
const allLines=[...new Set([...Object.keys(voiceContext.window.GALAXY_VOICE_PACK.clips),...lines])];
fs.writeFileSync(path.join(root,'artifacts','narration-script.json'),JSON.stringify({
  language:'Modern Standard Arabic for Arabic lines; English for English lines',
  direction:'Warm, conversational, encouraging. Record whole phrases. Preserve Arabic vowel marks and intended letter names. Have a fluent Arabic educator review before importing.',
  phrases:allLines.map(key=>({key,text:key.slice(key.indexOf('|')+1)}))
},null,2)+'\n');
console.log('Built web assets, offline cache, narration script, and standalone HTML.');
