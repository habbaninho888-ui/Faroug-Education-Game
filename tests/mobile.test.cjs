const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
test('native share uses app cache and native lifecycle dispatches pause/back',async()=>{
 const listeners={},registered=[],events=[],writes=[],shares=[];
 const plugins={App:{addListener:(name,fn)=>listeners[name]=fn},Filesystem:{writeFile:async options=>{writes.push(options);return {uri:'file:///cache/drawing.png'};}},Share:{share:async options=>shares.push(options)}};
 const window={Capacitor:{isNativePlatform:()=>true,registerPlugin:name=>{registered.push(name);return plugins[name];}},dispatchEvent:e=>events.push(e.type)};
 class FileReader {readAsDataURL(){this.result='data:image/png;base64,AAAA';this.onload();}}
 vm.runInNewContext(fs.readFileSync(require.resolve('../app/mobile.js'),'utf8'),{window,FileReader,Event,navigator:{},location:{protocol:'https:'}});
 await window.galaxyDownload('drawing.png',{});assert.deepEqual(registered,['App','Filesystem','Share']);assert.equal(writes[0].directory,'CACHE');assert.equal(shares[0].files[0],'file:///cache/drawing.png');listeners.appStateChange({isActive:false});listeners.backButton();assert.deepEqual(events,['galaxy-background','galaxy-back']);
});
