const {defineConfig,devices}=require('@playwright/test');
module.exports=defineConfig({
  testDir:'./tests/browser',timeout:45000,workers:2,
  reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:'http://127.0.0.1:4173',headless:true,launchOptions:{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']},screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
  webServer:{command:'npm start',url:'http://127.0.0.1:4173',reuseExistingServer:true}
});
