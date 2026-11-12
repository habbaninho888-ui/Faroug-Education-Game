(() => {
  const cap = window.Capacitor;
  const native = cap?.isNativePlatform();
  const app = native ? cap.registerPlugin('App') : null;
  const filesystem = native ? cap.registerPlugin('Filesystem') : null;
  const share = native ? cap.registerPlugin('Share') : null;
  window.galaxyDownload = async (name, blob) => {
    if(native) {
      const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});
      const saved=await filesystem.writeFile({path:name,data,directory:'CACHE'});
      await share.share({title:name,files:[saved.uri]});
    } else {
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }
  };
  if(native) {
    app.addListener('appStateChange',({isActive})=>{if(!isActive)window.dispatchEvent(new Event('galaxy-background'));});
    app.addListener('backButton',()=>window.dispatchEvent(new Event('galaxy-back')));
  }
  if('serviceWorker' in navigator && location.protocol !== 'file:' && !cap?.isNativePlatform()) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
