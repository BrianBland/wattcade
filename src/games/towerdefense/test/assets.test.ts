import { describe, expect, it, vi } from 'vitest';
import { loadImage, loadManifest } from '../render/assets';
describe('battlefield asset readiness',()=>{
  it('waits for decoding after the network load event',async()=>{
    let decoded!:()=>void;
    const image={src:'',decode:()=>new Promise<void>(resolve=>{decoded=resolve;})} as HTMLImageElement;
    const complete=vi.fn();const ready=loadImage('/test.webp',image).then(complete);
    image.onload!(new Event('load'));await Promise.resolve();expect(complete).not.toHaveBeenCalled();
    decoded();await ready;expect(complete).toHaveBeenCalledWith(image);
  });
  it('rejects failed image downloads and failed decode rather than starting with missing art',async()=>{
    const image={src:''} as HTMLImageElement;
    const ready=loadImage('/missing.webp',image);image.onerror!(new Event('error'));await expect(ready).rejects.toThrow('Unable to load');
    const broken={src:'',decode:()=>{throw new Error('decode failed');}} as unknown as HTMLImageElement;
    const decoded=loadImage('/broken.webp',broken);broken.onload!(new Event('load'));await expect(decoded).rejects.toThrow('decode failed');
  });
  it('rejects HTTP failures before parsing a manifest',async()=>{
    const json=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,json})));
    try {await expect(loadManifest('/missing.json')).rejects.toThrow('Unable to load');expect(json).not.toHaveBeenCalled();}finally{vi.unstubAllGlobals();}
  });
});
