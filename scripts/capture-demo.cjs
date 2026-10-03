// Capture only app content with a fresh fictional profile; never the user's desktop.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { _electron, chromium } = require('../apps/pet-desktop/node_modules/playwright-core');
const repo = path.resolve(__dirname, '..');
const installed = path.resolve(process.argv[2] || '');
if (!process.argv[2]) throw Error('Pass an isolated installed application directory');
const profile = path.join(repo, 'tmp', 'demo-' + Date.now());
const frames = path.join(profile, 'frames');
const media = path.join(repo, 'docs', 'media');
fs.mkdirSync(frames, { recursive: true }); fs.mkdirSync(media, { recursive: true });
fs.writeFileSync(path.join(profile, 'gowin-prefs.json'), JSON.stringify({theme: 'clawd', soundEnabled: false}));
const env = { ...process.env, GOWIN_USER_DATA_ROOT: profile, GOWIN_BUDDY_MODE: 'dashboard' };
for (const key of ['ELECTRON_RUN_AS_NODE','GOWIN_BUDDY_ROOT','GOWIN_DASHBOARD_HOST_SCRIPT','GOWIN_DASHBOARD_STATE_PATH','GOWIN_DASHBOARD_RUNTIME_PATH','GOWIN_DASHBOARD_THEME_PATH','GOWIN_BUNDLED_PYTHON','GOWIN_DASHBOARD_PYTHON','RIOS_WORKSPACE_ROOT','RIOS_BUNDLED_PYTHON']) delete env[key];
let app, host, browser;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label) { for (let i=0; i<150; i++) { const value=await fn(); if(value)return value; await pause(100); } throw Error('Timed out: '+label); }
async function captureNative(app, suffix, target) {
  await app.evaluate(async ({ BrowserWindow }, input) => {
    const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith(input.suffix));
    if (!win) throw Error('Capture window missing: ' + input.suffix);
    const image = await win.webContents.capturePage(undefined, { stayHidden: true, stayAwake: true });
    if (image.isEmpty()) throw Error('Empty window capture');
    process.getBuiltinModule('fs').writeFileSync(input.target, image.toPNG());
  }, { suffix, target });
}

(async()=>{
  try {
    app=await _electron.launch({executablePath:path.join(installed,'pet-dist/win-unpacked/GoWIN!Buddy.exe'),cwd:installed,env,timeout:30000});
    const main=await until(()=>app.windows().find(p=>p.url().endsWith('/index.html')),'pet');
    const hit=await until(()=>app.windows().find(p=>p.url().endsWith('/hit.html')),'input');
    await main.waitForSelector('#clawd');
    await until(()=>main.evaluate(()=>!!document.getElementById('clawd').data),'SVG');
    await hit.evaluate(()=>window.hitAPI.hoverQuickTasks(true));
    const quick=await until(()=>app.windows().find(p=>p.url().endsWith('/quick-tasks.html')),'tasks');
    await quick.waitForSelector('#todoInput');
    await quick.evaluate(()=>window.quickTasksAPI.hoverPanel(true));
    await quick.evaluate(()=>window.quickTasksAPI.addTodo('读十页喜欢的书','daily',null));
    await quick.evaluate(()=>window.quickTasksAPI.addTodo('给植物浇水','temporary',null));
    await pause(500);
    const scenes=[];
    async function capture(label,count=5){
      for(let j=0;j<count;j++){
        const index=scenes.length;
        await captureNative(app, '/index.html', path.join(frames,'pet-'+index+'.png'));
        await captureNative(app, '/quick-tasks.html', path.join(frames,'panel-'+index+'.png'));
        scenes.push(label);await pause(140);
      }
    }
    await capture('A little companion for your day');
    await quick.locator('#todoInput').fill('给今天写一句总结');
    await capture('Capture one small task');
    await quick.locator('#todoAddBtn').click();
    await pause(350);await capture('Keep tasks beside your pet');
    const task=(await quick.evaluate(()=>window.quickTasksAPI.getData())).todos.find(x=>x.title==='给今天写一句总结');
    if(!task)throw Error('Demo task not added');
    await quick.evaluate(id=>window.quickTasksAPI.setTodoChecked(id,true),task.id);
    await pause(350);await capture('Make a little progress');
    await captureNative(app, '/quick-tasks.html', path.join(media,'quick-tasks.png'));
    await captureNative(app, '/index.html', path.join(media,'pet.png'));
    const cfg=await app.evaluate(({app})=>{
      const path=process.getBuiltinModule('path');const req=process.getBuiltinModule('module').createRequire(path.join(app.getAppPath(),'package.json'));
      return req(path.join(app.getAppPath(),'src/dashboard-env.js')).resolveDashboardRuntimeConfig({baseDir:path.join(app.getAppPath(),'src'),isPackaged:true,resourcesPath:process.resourcesPath,userDataRoot:app.getPath('userData')});
    });
    host=spawn(cfg.bundledPython,[cfg.dashboardHostScript,'launch','--workspace-root',installed,'--state-path',cfg.dashboardStatePath,'--runtime-path',cfg.dashboardRuntimePath,'--theme-path',cfg.dashboardThemePath,'--no-open'],{cwd:installed,env,windowsHide:true,stdio:'ignore'});
    const url=await until(async()=>{try{const x=JSON.parse(fs.readFileSync(cfg.dashboardRuntimePath,'utf8'));const r=await fetch(new URL('/health',x.url));return r.ok&&x.url;}catch{return false;}},'host');
    const browserExe=[process.env.PLAYWRIGHT_CHROMIUM_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(x=>fs.existsSync(x));
    browser=await chromium.launch({executablePath:browserExe,headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1100}});
    const failures=[];page.on('pageerror',e=>failures.push(e.message));
    await page.goto(url);await page.waitForSelector('#questStarValue');await page.waitForFunction(()=>!remoteDirty&&!remoteSaveInFlight);
    await page.locator('#questCheckInBtn').click();await page.waitForFunction(()=>!remoteDirty&&!remoteSaveInFlight);await pause(600);
    await page.evaluate(()=>window.scrollTo(0,0));await pause(250);
    await page.screenshot({path:path.join(media,'dashboard.png')});
    await page.locator('#questCheckInBtn').scrollIntoViewIfNeeded();await pause(250);
    await page.screenshot({path:path.join(media,'dashboard-rpg.png')});
    const broken=await page.evaluate(()=>Array.from(document.images).filter(x=>!x.complete||x.naturalWidth===0).map(x=>x.getAttribute('src')));
    if(failures.length||broken.length)throw Error(JSON.stringify({failures,broken}));
    await capture('Check in to your local adventure',8);
    fs.writeFileSync(path.join(frames,'scenes.json'),JSON.stringify(scenes));
    fs.writeFileSync(path.join(media,'demo-manifest.json'),JSON.stringify({version:require('../apps/pet-desktop/package.json').version,profile:'Fresh fictional demonstration data',capture:'Electron and local dashboard content only',frames:scenes.length,files:['pet.png','quick-tasks.png','dashboard.png','dashboard-rpg.png','demo.gif'],rendererErrors:failures},null,2)+'\n');
    console.log(JSON.stringify({frames,frameCount:scenes.length,media}));
  } finally {
    if(browser)await browser.close();if(host&&!host.killed)host.kill();if(app)await app.close().catch(()=>{});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
