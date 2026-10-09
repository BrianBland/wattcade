// Run against npm run dev. Override CADENZA_TEST_URL / CHROMIUM_PATH as needed.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', headless:true, args:['--no-sandbox','--enable-unsafe-swiftshader'] });
try {
 const page = await browser.newPage({viewport:{width:800,height:600}}), errors=[];
 page.on('pageerror', e => errors.push(e.message));
 page.on('console', m => { if(m.type()==='error' && !m.text().includes('404')) errors.push(m.text()); });
 await page.addInitScript(() => { window.requestAnimationFrame = () => 0; });
 await page.goto(`${process.env.CADENZA_TEST_URL ?? 'http://127.0.0.1:5173'}/dev/cadenza.html?script=z2&sec=44&autopilot=1&speed=0`);
 await page.waitForTimeout(800);
 const results = await page.evaluate(async () => {
  const { CadenzaRenderer } = await import('/src/games/cadenza/render/renderer.ts');
  const { createGameSession, NullInput, testProfile } = await import('/src/core/index.ts');
  const { module } = await import('/src/games/cadenza/index.ts');
  const { synthTimeline } = await import('/src/media/synth/queue.ts');
  const { estimatedAnalysis } = await import('/src/media/online/rolling.ts');
  const { planMix } = await import('/src/media/mix/plan.ts');
  const { buildTimeline } = await import('/src/media/mix/timeline.ts');
  const { buildTrack } = await import('/src/games/cadenza/sim/track.ts');
  const { shader } = await import('/src/games/cadenza/render/look.ts');
  const THREE = await import('/node_modules/three/build/three.module.js');
  const timeline = synthTimeline({style:'edm',songs:2,seed:1,mix:'automix'});
  const session = createGameSession({game:module,profile:testProfile(),input:new NullInput(),fake:{script:'z2'},media:{timeline},simOpts:{difficulty:'pro',autopilot:true}});
  session.step(44*30);
  const host = document.createElement('div'); host.style.cssText='position:fixed;inset:0;background:black'; document.body.append(host);
  const r = new CadenzaRenderer(); r.mount(host,{profile:testProfile()});
  const snapshot=session.sim.snapshot(), originalTrack=snapshot.track, bike=session.bikeStore.get(), input=session.ctx.input();
  let invalid=0, checks=0, maxCameraDistance=0;
  const check=()=>{
   r.post.set({bloom:0.8,aberr:0.005,hurt:0,time:44,gray:1}); r.post.render();
   maxCameraDistance=Math.max(maxCameraDistance,r.camera.position.distanceTo(r.craft.group.position));
   const target=r.post.composer.renderTarget2, pixels=new Uint16Array(target.width*target.height*4);
   r.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
   for(const v of pixels) if((v&0x7c00)===0x7c00) invalid++;
   checks++;
  };
  for(const p of [0,15,44,49,80,120,170]) { snapshot.p=p; snapshot.effort.under=1; r.render(snapshot,bike,input); check(); }
  const items=[{id:'long',title:'Mix',artist:'Artist',analysis:estimatedAnalysis(14400)}];
  const started=performance.now(), long=buildTrack(buildTimeline(planMix(items,'continuous'),items),{difficulty:'pro',mode:'mono',seed:1});
  snapshot.track=long;
  const memory=[];
  for(const p of [0,30,60,90,120,14340,14370,14399,0]) {
   snapshot.p=p; r.render(snapshot,bike,input); check();
   memory.push({...r.renderer.info.memory});
  }
  const longMs=performance.now()-started;
  // Deliberately invalid fragment math must be contained before bloom can spread it.
  const bad=shader('void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', 'uniform float bad; void main(){gl_FragColor=vec4(sqrt(-abs(bad)),1.0,2.0,1.0);}',{bad:{value:1}});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),bad); r.camera.add(mesh); mesh.position.z=-1;
  r.post.render(); check(); r.camera.remove(mesh); mesh.geometry.dispose();bad.dispose();
  await new Promise(resolve=>setTimeout(resolve,40));
  const context=r.renderer.getContext(), glError=context.getError();
  const geometries=memory.map(x=>x.geometries);
  snapshot.track=originalTrack; snapshot.p=44; r.render(snapshot,bike,input);
  window.__smokeRenderer = r;
  const { MixEngine } = await import('/src/media/player/engine.ts');
  const ctx = new OfflineAudioContext(1, 88200, 44100), engine = new MixEngine({ctx,resolveUrl:async()=>''});
  const tone = ctx.createOscillator(), gain = ctx.createGain(); tone.frequency.value=440; gain.gain.value=0.5;
  tone.connect(gain).connect(engine.master); tone.start(); tone.stop(2); engine.setFx({degrade:1});
  const audio = (await ctx.startRendering()).getChannelData(0); let maxStep=0;
  for(let i=442;i<audio.length;i++) maxStep=Math.max(maxStep,Math.abs(audio[i]-audio[i-1]));
  return {invalid,checks,memory,longMs,glError,geometries,maxCameraDistance,maxAudioStep:maxStep};
 });
 if(process.env.CADENZA_SCREENSHOT) await page.screenshot({path:process.env.CADENZA_SCREENSHOT});
 await page.evaluate(()=>window.__smokeRenderer.unmount());
 console.log(JSON.stringify({results,errors}));
 if(results.maxCameraDistance > 100 || results.maxAudioStep > 0.04 || errors.length || results.invalid || results.glError || Math.max(...results.geometries)-Math.min(...results.geometries)>20) process.exitCode=1;
} finally { await browser.close(); }
