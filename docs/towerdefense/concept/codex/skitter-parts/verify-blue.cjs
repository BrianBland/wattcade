// Verify a repaint against the pristine 88ffc23 folder; never modify the rig.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),png=require('./png-tools.cjs');
const species=process.argv[2],source=process.argv[3],dir=path.join(__dirname,'..',species+'-parts');
const bytes=fs.readFileSync(dir+'/manifest.json');if(!bytes.equals(fs.readFileSync(source+'/manifest.json')))throw Error('Manifest changed');
const m=JSON.parse(bytes),report=JSON.parse(fs.readFileSync(dir+'/retone-validation.json'));
report.manifestSha256=crypto.createHash('sha256').update(bytes).digest('hex');report.canvasChecks=0;report.preservedWingHolePixels=0;
for(const p of m.parts){for(const key of ['file','glow']){const old=png.read(source+'/'+p[key]),now=png.read(dir+'/'+p[key]);if(old.w!==now.w||old.h!==now.h)throw Error('Canvas changed: '+p[key]);report.canvasChecks++;}
 if(p.name.startsWith('wing')){const old=png.read(source+'/'+p.file),now=png.read(dir+'/'+p.file);for(let i=3;i<old.data.length;i+=4){if(old.data[i]===0){if(now.data[i]!==0)throw Error('Wing hole filled');report.preservedWingHolePixels++;}}}
}
const files=fs.readdirSync(dir+'/parts').sort(),oldFiles=fs.readdirSync(source+'/parts').sort();if(JSON.stringify(files)!==JSON.stringify(oldFiles))throw Error('Part filenames changed');
const joints=JSON.parse(fs.readFileSync(dir+'/validation.json'));report.scriptedJointChecks=Object.values(joints.poses).reduce((n,j)=>n+j.length,0);report.gapJoints=joints.gapJoints;report.clippedPoses=joints.clippedPoses;report.greenFringePixels=joints.greenFringePixels;if(report.gapJoints.length||report.clippedPoses.length||report.greenFringePixels)throw Error('Joint checks failed');
report.preview={deviceScaleFactor:2,skitterNominalPx:[40,45,50],gliderNominalPx:45,rendererAids:{},baseOnlyAlsoCaptured:true,backgroundSource:'PR #138 public/td/environment/background.webp'};
fs.writeFileSync(dir+'/retone-validation.json',JSON.stringify(report,null,2)+'\n');console.log(species,report.canvasChecks,'same-size PNGs;',report.scriptedJointChecks,'joint checks pass; exact manifest SHA',report.manifestSha256);
