// Render current runtime artwork without changing its aspect ratio or motion.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'tmp/output/playwright/mascot-preview-v3/frames'));
const { chromium } = require(path.join(root, 'apps/pet-desktop/node_modules/playwright-core'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/brand/extracted/manifest.json'), 'utf8'));
const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'apps/pet-desktop/package.json'), 'utf8')).version;
const themes = Object.keys(manifest.characters).map(id => ({ id, theme: JSON.parse(fs.readFileSync(path.join(root, 'apps/pet-desktop/themes', id, 'theme.json'), 'utf8')) })).sort((a,b) => a.theme.order - b.theme.order);
const phases = [{state:'idle',zh:'待机',en:'Idle',frames:108}, {state:'working',zh:'工作',en:'Working',frames:72}, {state:'attention',zh:'开心',en:'Happy',frames:72}, {state:'sleeping',zh:'休息',en:'Resting',frames:90}];
const frameDuration = 40;
const motionClass = {idle:'idle-motion',working:'working-motion',attention:'happy-motion',sleeping:'rest-motion'};
const minimumTravelPx = {idle:2.5,working:1.8,attention:7,sleeping:1.3};
const escape = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const payloads = phases.map(phase => themes.map(({theme}) => {
  const svg = fs.readFileSync(path.join(root, 'apps/pet-desktop/assets/svg', theme.states[phase.state][0]), 'utf8');
  return '<!doctype html><html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;width:100%;height:100%;background:transparent}svg{position:absolute;width:380px;height:380px;left:calc(50% - 190px);top:-222px}</style><body>' + svg + '</body></html>';
}));
const cards = themes.map(({theme},i) => '<article><div class="scene"><iframe id="pet'+i+'" title="'+escape(theme.mascot.name)+'"></iframe></div><strong>'+escape(theme.mascot.nameZh)+'</strong><small>'+escape(theme.mascot.name)+'</small></article>').join('');
const html = '<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:26px 30px 20px;background:#f2f7ef;color:#24453f;font-family:"Microsoft YaHei",Arial,sans-serif}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}h1{font-size:27px;margin:0 0 6px;letter-spacing:-.4px}header p{font-size:13px;color:#648078;margin:0}.brand{font-size:18px;font-weight:700;letter-spacing:-.3px}.phase{display:inline-block;margin-top:6px;padding:7px 13px;border-radius:20px;background:#dceddf;font-size:13px}main{display:grid;grid-template-columns:repeat(5,1fr);gap:13px}article{background:#fff;border:1px solid #dce9df;border-radius:16px;padding:10px 8px 13px;text-align:center;box-shadow:0 3px 12px #254a440c}.scene{height:144px;overflow:hidden;border-radius:10px;background:radial-gradient(ellipse at center,#edf7ef,#fff 80%)}iframe{width:100%;height:100%;border:0}strong{display:block;font-size:16px;margin:4px 0 3px}small{font-size:12px;color:#768d83}footer{color:#768d83;font-size:11px;margin-top:15px;display:flex;justify-content:space-between}</style><header><div><h1>十种桌面伙伴 · 自然比例</h1><p>圆润体块 · 柔和明暗 · 连续动作</p></div><div style="text-align:right"><div class="brand">GoWIN!Buddy</div><span id="phase" class="phase">待机 / Idle</span></div></header><main>'+cards+'</main><footer><span>画面已放大，桌面显示保持紧凑尺寸</span><span>v'+appVersion+' · 造型与动作预览</span></footer>';
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const executablePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
 const browser = await chromium.launch({executablePath,headless:true,args:['--disable-extensions']});
 try{
  const page = await browser.newPage({viewport:{width:1120,height:610},deviceScaleFactor:1,reducedMotion:'no-preference'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(html);
  let count=0;
  const phaseMotionMetrics=[];
  for(let phase=0;phase<phases.length;phase++){
   await page.evaluate(({sources,label})=>{document.querySelector('#phase').textContent=label;sources.forEach((src,i)=>document.querySelector('#pet'+i).srcdoc=src)}, {sources:payloads[phase],label:phases[phase].zh+' / '+phases[phase].en});
   await page.waitForFunction(()=>[...document.querySelectorAll('iframe')].every(el=>el.contentDocument?.querySelector('svg')));
      await page.evaluate(()=>[...document.querySelectorAll('iframe')].forEach(el=>{
     const doc=el.contentDocument;const svg=doc.querySelector('svg');svg.getBoundingClientRect();
     const matrix=doc.querySelector('[data-size-profile]').getCTM();
     if(Math.abs(matrix.a-matrix.d)>1e-8)throw Error('Character anatomy is being stretched');
     doc.getAnimations().forEach(a=>a.pause());
   }));
   const tracks=themes.map(()=>({min:Infinity,max:-Infinity}));
   for(let frame=0;frame<phases[phase].frames;frame++){
    const positions=await page.evaluate(({time,selector})=>[...document.querySelectorAll('iframe')].map(el=>{
     const doc=el.contentDocument;
     doc.getAnimations().forEach(a=>{a.pause();a.currentTime=time});
     return doc.querySelector(selector).getBoundingClientRect().top;
    }),{time:frame*frameDuration,selector:'.'+motionClass[phases[phase].state]});
    positions.forEach((y,i)=>{tracks[i].min=Math.min(tracks[i].min,y);tracks[i].max=Math.max(tracks[i].max,y)});
    await page.screenshot({path:path.join(output,'frame-'+String(count++).padStart(3,'0')+'.png'),animations:'allow'});
   }
   const travel=tracks.map(x=>Number((x.max-x.min).toFixed(2)));
   const weakest=Math.min(...travel);
   if(weakest<minimumTravelPx[phases[phase].state])throw Error(phases[phase].state+' motion is too subtle: '+weakest+'px');
   phaseMotionMetrics.push({state:phases[phase].state,minTravelPx:weakest,maxTravelPx:Math.max(...travel)});
  }
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({version:appVersion,fps:25,characters:themes.map(t=>t.theme.mascot),phases,frames:count,frameDuration,phaseMotionMetrics,source:'Runtime SVG art and animation with measured motion travel'},null,2));
    // Export transparent source-resolution characters and check the real desktop object size.
  const rawDir=path.join(output,'characters');fs.mkdirSync(rawDir,{recursive:true});
  const dimensions=[];
  for(const {id,theme} of themes){
    await page.setViewportSize({width:500,height:500});
    await page.goto(require('node:url').pathToFileURL(path.join(root,'apps/pet-desktop/assets/svg',theme.states.idle[0])).href);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.screenshot({path:path.join(rawDir,theme.mascot.species+'.png'),omitBackground:true,animations:'disabled'});
    await page.setViewportSize({width:380,height:260});
    const dim=await page.evaluate(()=>{const profile=document.querySelector('[data-size-profile]');const m=profile.getCTM();const b=profile.getBoundingClientRect();return {scaleX:m.a,scaleY:m.d,width:b.width,height:b.height}});
    if(Math.abs(dim.scaleX-dim.scaleY)>1e-8)throw Error('Runtime object distorts '+id);
    if(dim.width>100 || dim.height>100)throw Error('Runtime footprint exceeds compact size for '+id);
    dimensions.push({id,...dim});
  }
  fs.writeFileSync(path.join(output,'runtime-dimensions.json'),JSON.stringify(dimensions,null,2));
  console.log(JSON.stringify({frames:count,fps:25,characters:themes.length,output,phaseMotionMetrics,dimensions}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});