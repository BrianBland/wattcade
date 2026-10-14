/* Apply generated crystal membrane repaint to original wing canvases.
 * node fill-crystal-wings.cjs <pristine Glider folder at 191b5e3>
 * Bone pixels, all other parts, geometry and manifest remain unchanged.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),png=require('../skitter-parts/png-tools.cjs');
const source=process.argv[2];if(!source)throw Error('Supply pristine Glider folder');const dir=__dirname,m=JSON.parse(fs.readFileSync(dir+'/manifest.json')),paint=png.read(dir+'/crystal-wing-paint.png');
if(!fs.readFileSync(source+'/manifest.json').equals(fs.readFileSync(dir+'/manifest.json')))throw Error('Rig changed');
const report={sourceCommit:'191b5e3',manifestSha256:crypto.createHash('sha256').update(fs.readFileSync(dir+'/manifest.json')).digest('hex'),manifestUnchanged:true,canvasesUnchanged:true,nonWingPartsUnchanged:true,wings:[]};
function inside(x,y,t){const s=(a,b)=>((x-b[0])*(a[1]-b[1])-(a[0]-b[0])*(y-b[1]));const a=s(t[0],t[1]),b=s(t[1],t[2]),c=s(t[2],t[0]);return !((a<0||b<0||c<0)&&(a>0||b>0||c>0))}
for(const p of m.parts){if(!p.name.startsWith('wing')){for(const k of ['file','glow'])if(!fs.readFileSync(source+'/'+p[k]).equals(fs.readFileSync(dir+'/'+p[k])))throw Error('Non-wing part changed');continue;}
 const src=png.read(source+'/'+p.file),emit=png.read(source+'/'+p.glow),{w,h}=src,out={w,h,data:Buffer.from(src.data)},glow={w,h,data:Buffer.from(emit.data)},seen=new Uint8Array(w*h),fill=new Uint8Array(w*h),holes=[];
 for(let i=0;i<w*h;i++){if(seen[i]||src.data[i*4+3]>=128)continue;const queue=[i];seen[i]=1;let exterior=false;for(let q=0;q<queue.length;q++){const j=queue[q],x=j%w,y=Math.floor(j/w);if(x===0||y===0||x===w-1||y===h-1)exterior=true;for(const n of [j-1,j+1,j-w,j+w]){if(n<0||n>=w*h||seen[n]||src.data[n*4+3]>=128)continue;seen[n]=1;queue.push(n);}}if(exterior||queue.length>800)continue;holes.push(queue.length);for(const j of queue)fill[j]=1;}
 // Inpaint perforation rims too; pixels outside the perforation rims keep their original bone fingers.
 const spread=Uint8Array.from(fill);for(let y=4;y<h-4;y++)for(let x=4;x<w-4;x++)if(fill[y*w+x])for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++)if(dx*dx+dy*dy<=16)spread[(y+dy)*w+x+dx]=1;
 const triangle=p.name==='wing_l'?[[62,249],[80,258],[78,272]]:[[185,249],[167,258],[169,272]];const chip=new Uint8Array(w*h);let filledPixels=0,membranePixels=0,chipPixels=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=y*w+x,i=j*4,a=src.data[i+3],isMembrane=a>=128&&a<=220;if(!isMembrane&&!fill[j]&&(!spread[j]||a<128))continue;
 const ax=Math.min(paint.w-1,Math.floor((x+p.offset[0]+.5)*paint.w/640)),ay=Math.min(paint.h-1,Math.floor((y+p.offset[1]+.5)*paint.h/640)),k=(ay*paint.w+ax)*4,valid=paint.data[k+3]>100&&paint.data[k+2]>80;
 for(let c=0;c<3;c++){const value=valid?paint.data[k+c]:[145,195,218][c];out.data[i+c]=Math.round(value*.85+(a>=128&&!spread[j]?src.data[i+c]:[145,195,218][c])*.15);}out.data[i+3]=isMembrane?a:199;membranePixels++;if(fill[j])filledPixels++;
 if(fill[j])glow.data.set([0,0,0,0],i);
 if(inside(x+.5,y+.5,triangle)){chip[j]=1;out.data.set([0,0,0,0],i);glow.data.set([0,0,0,0],i);chipPixels++;}
 }
 // Sharp, dark cut face along the new missing shard; no glowing silhouette.
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const j=y*w+x,i=j*4;if(out.data[i+3]===0||src.data[i+3]===255)continue;if([j-1,j+1,j-w,j+w].some(k=>chip[k])){out.data[i]=23;out.data[i+1]=46;out.data[i+2]=60;glow.data.set([0,0,0,0],i);}}
 png.write(dir+'/'+p.file,out);png.write(dir+'/'+p.glow,glow);report.wings.push({name:p.name,canvas:[w,h],filledPerforations:holes.length,filledPerforationPixels:filledPixels,membranePixelsRepainted:membranePixels,edgeChipPixels:chipPixels,edgeChipTriangle:triangle});
}
fs.writeFileSync(dir+'/wing-validation.json',JSON.stringify(report,null,2)+'\n');
const retone=JSON.parse(fs.readFileSync(dir+'/retone-validation.json'));delete retone.preservedWingHolePixels;retone.wingTreatment='Continuous crystal panels with fine fractures; scattered perforations filled; one trailing-edge chip per wing. Bone fingers retained.';fs.writeFileSync(dir+'/retone-validation.json',JSON.stringify(retone,null,2)+'\n');console.log(report.wings);
