/* Original roster body/bones; vivid blue wing membrane material from image_gen.
 * node apply-rich-blue.cjs <original Glider folder at88ffc23> <wing masks at5cf88db>
 * Whole original rig is retained; masks retain filled membranes and edge chips.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),png=require('../skitter-parts/png-tools.cjs');
const source=process.argv[2],maskSource=process.argv[3],dir=__dirname;if(!source||!maskSource)throw Error('Supply original Glider folder and previous wing masks');
const bytes=fs.readFileSync(dir+'/manifest.json');if(!bytes.equals(fs.readFileSync(source+'/manifest.json')))throw Error('Manifest changed');const m=JSON.parse(bytes),paint=png.read(dir+'/rich-blue-paint.png'),originalFrame=png.read(source+'/assembled-base.png');
function bounds(img){let x0=img.w,y0=img.h,x1=0,y1=0;for(let y=0;y<img.h;y++)for(let x=0;x<img.w;x++)if(img.data[(y*img.w+x)*4+3]>128){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y)}return[x0,y0,x1,y1]}
const a=bounds(originalFrame),b=bounds(paint),scaleX=(b[2]-b[0])/(a[2]-a[0]),scaleY=(b[3]-b[1])/(a[3]-a[1]);
function clamp(v,lo,hi){return Math.max(lo,Math.min(v,hi))}
function hsl(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),q=l-c/2;return [0,x,c].map(v=>Math.round((v+q)*255))}
const report={source:'Original roster-derived parts at88ffc23',material:'Saturated electric/royal blue membranes, original dark body and bone textures',manifestSha256:crypto.createHash('sha256').update(bytes).digest('hex'),manifestUnchanged:true,partCanvasesUnchanged:true,originalBodyAndGlowRestored:true,wingMasksSource:'5cf88db',paintRegistration:{originalBounds:a,paintBounds:b},parts:[]};
for(const p of m.parts){const base=png.read(source+'/'+p.file),oldGlow=png.read(source+'/'+p.glow);if(!p.name.startsWith('wing')){fs.copyFileSync(source+'/'+p.file,dir+'/'+p.file);fs.copyFileSync(source+'/'+p.glow,dir+'/'+p.glow);report.parts.push({name:p.name,originalPixels:true,canvas:[base.w,base.h]});continue;}
 const mask=png.read(maskSource+'/'+p.file);if(mask.w!==base.w||mask.h!==base.h)throw Error('Canvas changed');const out={w:base.w,h:base.h,data:Buffer.from(base.data)},glow={w:base.w,h:base.h,data:Buffer.from(oldGlow.data)};let membraneCount=0;
 for(let y=0;y<base.h;y++)for(let x=0;x<base.w;x++){const i=(y*base.w+x)*4,opacity=mask.data[i+3];if(opacity===0){out.data.set([0,0,0,0],i);glow.data.set([0,0,0,0],i);continue;}
 const membrane=opacity>=128&&opacity<=220;if(!membrane)continue;
 const wx=p.offset[0]+x,wy=p.offset[1]+y,px=clamp(Math.round(b[0]+(wx-a[0])*scaleX),0,paint.w-1),py=clamp(Math.round(b[1]+(wy-a[1])*scaleY),0,paint.h-1),j=(py*paint.w+px)*4;
 const r=paint.data[j]/255,g=paint.data[j+1]/255,bl=paint.data[j+2]/255,valid=paint.data[j+3]>128&&bl>r*1.6&&bl>.2;
 const originalL=(.2126*base.data[i]+.7152*base.data[i+1]+.0722*base.data[i+2])/255;
 // Blue rather than cyan highlights, with original folds kept as material detail.
 const energy=valid?(.2126*r+.7152*g+.0722*bl):.26;
 const light=clamp(.36+.37*energy+.10*(originalL-.25),.35,.58);
 const rgb=hsl(valid?214+8*(1-g/Math.max(bl,.01)):218,.84,light);
 out.data.set([...rgb,235],i);membraneCount++;
 // Original narrow electric-blue veins remain independent emissive material.
 if(base.data[i+3]<128)glow.data.set([0,0,0,0],i);
 }
 png.write(dir+'/'+p.file,out);png.write(dir+'/'+p.glow,glow);report.parts.push({name:p.name,canvas:[base.w,base.h],blueMembranePixels:membraneCount});
}
fs.writeFileSync(dir+'/blue-validation.json',JSON.stringify(report,null,2)+'\n');console.log('Restored original Glider body; painted broad blue wings; exact rig retained',report.paintRegistration);
