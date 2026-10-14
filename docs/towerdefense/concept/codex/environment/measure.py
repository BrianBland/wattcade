"""Measure decoded production terrain using fixed geometry masks, not hue selection."""
import json
from pathlib import Path
import numpy as np
from PIL import Image
HERE = Path(__file__).resolve().parent
WEIGHTS = np.array([.2126, .7152, .0722])

def measure(out):
    rgb = np.asarray(Image.open(out/'background.webp').convert('RGB')).astype(float)
    guide = np.asarray(Image.open(HERE/'map-layout-guide.png').convert('RGB'))
    field = np.zeros(guide.shape[:2], bool)
    field[32:932, 318:1218] = True
    result = dict(mask='geometry guide within registered 900×900 field; includes shared apron; excludes rubble shoulders',
                  luminance='Rec.709 weighted encoded sRGB / 255 (display value); linear relative luminance also reported')
    old = np.asarray(Image.open(HERE/'raw/battlefield-painted-v4-raw.png').convert('RGB')).astype(float)
    for name, colour in [('floor', [110,80,58]), ('plateau', [49,49,51])]:
        mask = field & (guide == colour).all(2)
        pixels = rgb[mask]; values = pixels @ WEIGHTS
        mean = pixels.mean(0)
        srgb = pixels/255
        linear = np.where(srgb <= .04045, srgb/12.92, ((srgb+.055)/1.055)**2.4)
        result[name] = dict(pixels=int(mask.sum()), averageRGB=mean.round(3).tolist(),
                            displayLuminancePercent=round(float(values.mean()/255*100),3),
                            linearRelativeLuminancePercent=round(float((linear@WEIGHTS).mean()*100),3),
                            valueStdDev=round(float(values.std()),3),
                            meanChannelSpread=round(float(np.ptp(pixels,axis=1).mean()),3))
        if name == 'floor':
            result[name]['previousUmberTargetRGB'] = [110,80,58]
            warm = (pixels[:,0]>pixels[:,1]*1.14) & (pixels[:,1]>pixels[:,2]*1.08)
            result[name]['warmMaterialSupport'] = round(float(warm.mean()),5)
            # The owner reverted the smooth-floor direction to textured rock/dirt.
            # Hue support is diagnostic here: neutral stones on dirt are valid.
        else:
            result[name]['previousDisplayValueLimitPercent'] = 22
            result[name]['measurementIncludes'] = 'warm industrial wreckage and weathered rock in the restored original-style scene'
            # Spatial high-frequency energy over a common conservative rock region.
            common = mask & (old[...,0] < old[...,1]*1.2)
            common[1:] &= mask[:-1]
            detail = np.abs(np.diff(rgb@WEIGHTS,axis=0))[common[1:]].mean()
            previous = np.abs(np.diff(old@WEIGHTS,axis=0))[common[1:]].mean()
            result[name]['contrastRatioVsPrevious'] = round(float((rgb@WEIGHTS)[common].std()/(old@WEIGHTS)[common].std()),3)
            result[name]['fineDetailRatioVsPrevious'] = round(float(detail/previous),3)
    (HERE/'terrain-measurements.json').write_text(json.dumps(result,indent=2)+'\n')
    return result

if __name__ == '__main__':
    import sys
    print(json.dumps(measure(Path(sys.argv[1])),indent=2))
