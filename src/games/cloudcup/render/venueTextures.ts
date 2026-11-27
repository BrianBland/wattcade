import * as T from 'three';
export type ArtName =
  | 'cinder-dirt'
  | 'bridge-ties'
  | 'yard-siding'
  | 'mill-siding'
  | 'bowl-sign'
  | 'pass-sign'
  | 'spruce-bough'
  | 'pit-garage'
  | 'schist'
  | 'ticket-office'
  | 'grit'
  | 'magnet-enamel'
  | 'kiln-mural'
  | 'heron-glass'
  | 'magnet-horizon'
  | 'kiln-horizon'
  | 'storm-horizon'
  | 'bowl-horizon'
  | 'pass-horizon';
export type VenueArt = (name: ArtName) => T.Texture;
// Each venue requests its materials on first use. Three uploads the decoded
// image on the next rendered frame and the cached yard retains its textures.
export function venueTextures(loader: T.TextureLoader, anisotropy: number): VenueArt {
  const maps = new Map<ArtName, T.Texture>();
  return (name) => {
    const cached = maps.get(name);
    if (cached) return cached;
    const tex = loader.load('/scrapjet/' + name + '.webp');
    tex.colorSpace = T.SRGBColorSpace;
    tex.anisotropy = Math.min(8, anisotropy);
    maps.set(name, tex);
    return tex;
  };
}
