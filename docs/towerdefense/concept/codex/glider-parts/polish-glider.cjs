/* Polish blue wings and restore a matching pair of head horns in existing canvases.
 * node polish-glider.cjs <Glider folder at90700e8>
 * Uses generated material reference, matching generated horn material for both horns.
 */
const fs=require('fs'),path=require('path'),crypto=require('crypto'),png=require('../skitter-parts/png-tools.cjs');const source=process.argv[2],dir=__dirname;if(!source)throw Error('Supply pristine folder');
const mb=fs.readFileSync(dir+'/manifest.json');if(!mb.equals(fs.readFileSync(source+'/manifest.json')))throw Error('Rig changed');const m=JSON.parse(mb),paint=png.read(dir+'/polish-paint.png'),parts=new Map(m.parts.map(p=>[p.name,p]));
const report={sourceCommit:'90700e8',manifestSha256:crypto.createHash('sha256').update(mb).digest('hex'),manifestUnchanged:true,partCanvasesUnchanged:true,polishedWingPixels:{},horns:{count:2,method:'Generated polished horn duplicated and mirrored into head layer; original protruding horn removed from both overlapping head/body layers.',anchorRight:[345,164],scale:[.40,.46],bothAttachedTo:'head'}};
function hsl(h,s,l){const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs((h/60)%2-1)),q=l-c/2;return[0,x,c].map(v=>Math.round((v+q)*255))}
for(const name of ['wing_l','wing_r']){const p=parts.get(name),src=png.read(source+'/'+p.file),out={w:src.w,h:src.h,data:Buffer.from(src.data)};let count=0;
 for(let y=60;y<Math.min(334,src.h);y++)for(let x=0;x<src.w;x++){const i=(y*src.w+x)*4,r=src.data[i],g=src.data[i+1],b=src.data[i+2],a=src.data[i+3];if(a<128||b>r*1.55)continue;const L=(.2126*r+.7152*g+.0722*b)/255;if(L<.12)continue;
  // Generated paint supplies richer blue fold values, while dark finger ribs stay intact.
  const wx=x+p.offset[0],wy=y+p.offset[1],px=Math.min(paint.w-1,Math.round(wx*paint.w/640)),py=Math.min(paint.h-1,Math.round(wy*paint.h/640)),j=(py*paint.w+px)*4,energy=(.2126*paint.data[j]+.7152*paint.data[j+1]+.0722*paint.data[j+2])/255;
  const light=Math.max(.32,Math.min(.53,.33+.23*L+.12*energy));out.data.set([...hsl(218,.84,light),a],i);count++;}
 png.write(dir+'/'+p.file,out);report.polishedWingPixels[name]=count;
}
function inside(x,y,t){let yes=false;for(let i=0,j=t.length-1;i<t.length;j=i++){const a=t[i],b=t[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const hornPoly=[[349,155],[367,161],[381,167],[399,170],[399,213],[381,213],[377,185],[358,177],[349,176]],head=parts.get('head'),original=png.read(source+'/'+head.file),originalGlow=png.read(source+'/'+head.glow);
for(const name of ['head','thorax_1']){const p=parts.get(name);for(const key of ['file','glow']){const image=png.read(source+'/'+p[key]);for(let y=0;y<image.h;y++)for(let x=0;x<image.w;x++)if(x+p.offset[0]>=349&&y+p.offset[1]>=155&&y+p.offset[1]<=213)image.data.set([0,0,0,0],(y*image.w+x)*4);png.write(dir+'/'+p[key],image);}}
const generatedHorn=[[693,314],[733,303],[756,321],[769,359],[761,396],[739,414],[745,374],[731,350],[698,345]];
const out=png.read(dir+'/'+head.file);let hornPixels=0;
for(const left of [false,true])for(let y=4;y<out.h-4;y++)for(let x=4;x<out.w-4;x++){const wx=x+head.offset[0],wy=y+head.offset[1],rightX=left?640-wx:wx,sx=700+(rightX-345)/.40,sy=312+(wy-162)/.46;if(!inside(sx,sy,generatedHorn))continue;const ix=Math.round(sx),iy=Math.round(sy);if(ix<0||iy<0||ix>=paint.w||iy>=paint.h)continue;const a=(iy*paint.w+ix)*4,b=(y*out.w+x)*4;if(paint.data[a+3]<8)continue;paint.data.copy(out.data,b,a,a+4);hornPixels++;}
png.write(dir+'/'+head.file,out);report.horns.filePixels=hornPixels;
fs.writeFileSync(dir+'/polish-validation.json',JSON.stringify(report,null,2)+'\n');console.log(report);
