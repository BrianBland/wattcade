/* Repaint atlas is generated with image_gen; source silhouettes, texture detail and
 * hidden overlaps are registered back to exact existing PNG canvases. Rig untouched.
 * Usage: node retone-blue.cjs skitter /path/to/pristine/skitter-parts
 *        node retone-blue.cjs glider /path/to/pristine/glider-parts
 * Pristine inputs are the same folders at git 88ffc23; never rebuild anatomy.
 */
const fs=require('fs'),path=require('path'),png=require('./png-tools.cjs');
const species=process.argv[2],source=process.argv[3];if(!['skitter','glider'].includes(species)||!source)throw Error('Supply species and pristine input folder');
const dir=path.join(__dirname,'..',species+'-parts'),m=JSON.parse(fs.readFileSync(source+'/manifest.json')),layout=JSON.parse(fs.readFileSync(dir+'/crystal-paint-layout.json')),paint=png.read(dir+'/crystal-paint-atlas.png');
if(!fs.readFileSync(source+'/manifest.json').equals(fs.readFileSync(dir+'/manifest.json')))throw Error('Rig changed');
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function hsl(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),a=l-c/2;let rgb=h<180?[0,c,x]:h<240?[0,x,c]:[x,0,c];return rgb.map(v=>Math.round(255*(v+a)))}
function near(arr,w,h,x,y,r,mode='max'){let value=mode==='min'?255:0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(dx*dx+dy*dy>r*r)continue;const xx=x+dx,yy=y+dy,v=xx<0||yy<0||xx>=w||yy>=h?0:arr[(yy*w+xx)*4+3];value=mode==='min'?Math.min(v,value):Math.max(v,value)}return value}
const report={species,manifestUnchanged:true,sourceCommit:'88ffc23',parts:[]};
for(const p of m.parts){const src=png.read(source+'/'+p.file),oldGlow=png.read(source+'/'+p.glow),item=layout.items.find(q=>q.name===p.name),{w,h}=src,base={w,h,data:Buffer.alloc(w*h*4)},glow={w,h,data:Buffer.alloc(w*h*4)},leg=species==='skitter'&&p.group==='limb',wing=p.name.startsWith('wing'),alpha=Buffer.from(src.data),nearest=new Int32Array(w*h);let oldArea=0,newArea=0;
 // Width-only dilation perpendicular to the pivot/end axis, limited by existing 4px margin.
 const end=p.end??p.pivot,dx=end[0]-p.pivot[0],dy=end[1]-p.pivot[1],len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;nearest[i]=i;if(src.data[i*4+3]>128)oldArea++;if(!leg||x<4||y<4||x>=w-4||y>=h-4)continue;let a=src.data[i*4+3],index=i;for(let t=-3.5;t<=3.5;t+=.5){const xx=Math.round(x+nx*t),yy=Math.round(y+ny*t);if(xx<0||yy<0||xx>=w||yy>=h)continue;const j=yy*w+xx,v=src.data[j*4+3];if(v>a){a=v;index=j}}alpha[i*4+3]=a;nearest[i]=index;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,a=alpha[i+3];if(!a)continue;const si=nearest[y*w+x]*4,sx=(si/4)%w,sy=Math.floor(si/4/w),r=src.data[si]/255,g=src.data[si+1]/255,b=src.data[si+2]/255,L=.2126*r+.7152*g+.0722*b,ch=Math.max(r,g,b)-Math.min(r,g,b);
 const ax=clamp(Math.floor((item.x+sx/w*item.w)*paint.w/layout.width),0,paint.w-1),ay=clamp(Math.floor((item.y+sy/h*item.h)*paint.h/layout.height),0,paint.h-1),ai=(ay*paint.w+ax)*4,pr=paint.data[ai]/255,pg=paint.data[ai+1]/255,pb=paint.data[ai+2]/255,pl=.2126*pr+.7152*pg+.0722*pb;
 const outline=near(alpha,w,h,x,y,2,'min')<100;
 let light=.30+.44*Math.pow(pl,.65)+.12*(L-.15);if(pl>.68)light=.77+.17*(pl-.68)/.32;if(L>.54)light=Math.max(light,.77+.17*(L-.54)/.46); // keep original engraved facet glints
 if(L<.025)light=Math.min(light,.26); // small internal creases, not black broad plates
 const membrane=wing&&ch<.24&&L>.07&&L<.55&&near(src.data,w,h,x,y,2,'min')>100;
 if(membrane)light=.64+.16*L+.09*(pl-.4);
 if(outline)light=.105+.09*L;
 const rgb=hsl(200,outline?.36:membrane?.42:.40,clamp(light,.10,.90));
 let opacity=membrane?Math.round(a*.78):a;
 base.data.set([...rgb,opacity],i);if(a>128)newArea++;
 // Existing glow network is thickened, then filled with independent body organs/joint emission.
 let emission=near(oldGlow.data,w,h,x,y,wing?3:2)/255*.52;
 const wx=x+p.offset[0],wy=y+p.offset[1],body=p.group==='body';
 if(body&&!p.name.startsWith('tail')){const cx=320,cy=species==='skitter'?235:245,rx=species==='skitter'?18:14,ry=species==='skitter'?57:58,d=Math.sqrt(((wx-cx)/rx)**2+((wy-cy)/ry)**2);emission=Math.max(emission,clamp((1-d)*2,0,.65));}
 if(p.group==='limb'){const pts=[p.pivot,...(p.end?[p.end]:[])];for(const pt of pts){const d=Math.hypot(wx-pt[0],wy-pt[1]);emission=Math.max(emission,clamp((6-d)/5,0,.66));}}
 if(outline)emission*=.1;
 const ea=Math.round(clamp(emission,0,.75)*opacity);glow.data.set(ea?[32,180,255,ea]:[0,0,0,0],i);
 }
 png.write(dir+'/'+p.file,base);png.write(dir+'/'+p.glow,glow);report.parts.push({name:p.name,canvas:[w,h],sourceOpaquePixels:oldArea,retoneOpaquePixels:newArea,areaRatio:Number((newArea/oldArea).toFixed(3)),legWidthOnly:leg});
}
fs.writeFileSync(dir+'/retone-validation.json',JSON.stringify(report,null,2)+'\n');console.log(species,'repainted',m.parts.length,'parts; rig and canvases unchanged');
